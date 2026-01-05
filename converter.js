// ===== DOM Elements =====
const uploadArea = document.getElementById('uploadArea');
const videoInput = document.getElementById('videoInput');
const previewSection = document.getElementById('previewSection');
const videoPreview = document.getElementById('videoPreview');
const fileNameSpan = document.getElementById('fileName');
const fileSizeSpan = document.getElementById('fileSize');
const fileDurationSpan = document.getElementById('fileDuration');
const optionsSection = document.getElementById('optionsSection');
const qualitySelect = document.getElementById('quality');
const outputNameInput = document.getElementById('outputName');
const trimStartInput = document.getElementById('trimStart');
const trimEndInput = document.getElementById('trimEnd');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressStatus = document.getElementById('progressStatus');
const resultSection = document.getElementById('resultSection');
const audioPreview = document.getElementById('audioPreview');
const downloadBtn = document.getElementById('downloadBtn');
const convertAnotherBtn = document.getElementById('convertAnother');
const actionButtons = document.getElementById('actionButtons');
const convertBtn = document.getElementById('convertBtn');
const clearBtn = document.getElementById('clearBtn');

// ===== State =====
let selectedFile = null;
let audioBlob = null;
let ffmpeg = null;
let ffmpegLoaded = false;

// ===== FFmpeg Setup =====
async function loadFFmpeg() {
    if (ffmpegLoaded) return;
    
    try {
        progressStatus.textContent = 'Loading FFmpeg (this may take a moment)...';
        
        const { FFmpeg } = FFmpegWASM;
        const { fetchFile, toBlobURL } = FFmpegUtil;
        
        ffmpeg = new FFmpeg();
        
        ffmpeg.on('progress', ({ progress }) => {
            const percent = Math.round(progress * 100);
            progressFill.style.width = `${percent}%`;
            progressText.textContent = `${percent}%`;
        });
        
        ffmpeg.on('log', ({ message }) => {
            console.log('FFmpeg:', message);
        });
        
        // Load FFmpeg core
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        ffmpegLoaded = true;
        console.log('FFmpeg loaded successfully');
        
    } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        throw new Error('Failed to load FFmpeg. Please refresh and try again.');
    }
}

// ===== File Handling =====
function handleFileSelect(file) {
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('video/')) {
        alert('Please select a valid video file.');
        return;
    }
    
    selectedFile = file;
    
    // Create object URL for preview
    const videoURL = URL.createObjectURL(file);
    videoPreview.src = videoURL;
    
    // Update file info
    fileNameSpan.textContent = file.name;
    fileSizeSpan.textContent = formatFileSize(file.size);
    
    // Get duration when metadata loads
    videoPreview.onloadedmetadata = () => {
        fileDurationSpan.textContent = formatDuration(videoPreview.duration);
    };
    
    // Set default output name
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    outputNameInput.value = baseName;
    
    // Show sections
    previewSection.classList.remove('hidden');
    optionsSection.classList.remove('hidden');
    actionButtons.classList.remove('hidden');
    
    // Hide result section if visible
    resultSection.classList.add('hidden');
    progressSection.classList.add('hidden');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function parseTime(timeStr) {
    if (!timeStr) return null;
    
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 1) {
        return parts[0]; // Just seconds
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1]; // MM:SS
    } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
    }
    return null;
}

// ===== Conversion =====
async function convertToMP3() {
    if (!selectedFile) {
        alert('Please select a video file first.');
        return;
    }
    
    try {
        // Show progress section
        progressSection.classList.remove('hidden');
        actionButtons.classList.add('hidden');
        optionsSection.classList.add('hidden');
        previewSection.classList.add('hidden');
        resultSection.classList.add('hidden');
        
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        
        // Load FFmpeg if not loaded
        if (!ffmpegLoaded) {
            await loadFFmpeg();
        }
        
        progressStatus.textContent = 'Reading video file...';
        
        const { fetchFile } = FFmpegUtil;
        
        // Write input file to FFmpeg filesystem
        const inputFileName = 'input' + getFileExtension(selectedFile.name);
        const outputFileName = 'output.mp3';
        
        await ffmpeg.writeFile(inputFileName, await fetchFile(selectedFile));
        
        progressStatus.textContent = 'Converting to MP3...';
        
        // Build FFmpeg command
        const quality = qualitySelect.value;
        const ffmpegArgs = ['-i', inputFileName];
        
        // Add trim options if specified
        const trimStart = parseTime(trimStartInput.value);
        const trimEnd = parseTime(trimEndInput.value);
        
        if (trimStart !== null) {
            ffmpegArgs.push('-ss', trimStart.toString());
        }
        
        if (trimEnd !== null) {
            ffmpegArgs.push('-to', trimEnd.toString());
        }
        
        // Audio conversion options
        ffmpegArgs.push(
            '-vn',                    // No video
            '-acodec', 'libmp3lame',  // MP3 codec
            '-ab', `${quality}k`,     // Bitrate
            '-ar', '44100',           // Sample rate
            '-ac', '2',               // Stereo
            outputFileName
        );
        
        // Execute conversion
        await ffmpeg.exec(ffmpegArgs);
        
        progressStatus.textContent = 'Finalizing...';
        
        // Read output file
        const outputData = await ffmpeg.readFile(outputFileName);
        audioBlob = new Blob([outputData.buffer], { type: 'audio/mp3' });
        
        // Create audio preview
        const audioURL = URL.createObjectURL(audioBlob);
        audioPreview.src = audioURL;
        
        // Clean up FFmpeg filesystem
        await ffmpeg.deleteFile(inputFileName);
        await ffmpeg.deleteFile(outputFileName);
        
        // Show result
        progressSection.classList.add('hidden');
        resultSection.classList.remove('hidden');
        
        console.log('Conversion complete!');
        
    } catch (error) {
        console.error('Conversion failed:', error);
        progressSection.classList.add('hidden');
        actionButtons.classList.remove('hidden');
        optionsSection.classList.remove('hidden');
        previewSection.classList.remove('hidden');
        alert('Conversion failed: ' + error.message);
    }
}

function getFileExtension(filename) {
    const match = filename.match(/\.[^/.]+$/);
    return match ? match[0] : '.mp4';
}

// ===== Download =====
function downloadMP3() {
    if (!audioBlob) return;
    
    const outputName = outputNameInput.value || 'audio-output';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(audioBlob);
    link.download = `${outputName}.mp3`;
    link.click();
}

// ===== Reset =====
function resetConverter() {
    selectedFile = null;
    audioBlob = null;
    
    videoInput.value = '';
    videoPreview.src = '';
    audioPreview.src = '';
    outputNameInput.value = '';
    trimStartInput.value = '';
    trimEndInput.value = '';
    
    previewSection.classList.add('hidden');
    optionsSection.classList.add('hidden');
    progressSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    actionButtons.classList.add('hidden');
    
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
}

// ===== Event Listeners =====

// Upload area click
uploadArea.addEventListener('click', () => {
    videoInput.click();
});

// File input change
videoInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    
    if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

// Convert button
convertBtn.addEventListener('click', convertToMP3);

// Clear button
clearBtn.addEventListener('click', resetConverter);

// Download button
downloadBtn.addEventListener('click', downloadMP3);

// Convert another button
convertAnotherBtn.addEventListener('click', resetConverter);

// ===== Initialize =====
console.log('🎵 Video to MP3 Converter loaded!');
