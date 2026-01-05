// ===== DOM Elements =====
const video = document.getElementById('video');
const captureCanvas = document.getElementById('captureCanvas');
const stripCanvas = document.getElementById('stripCanvas');
const startCameraBtn = document.getElementById('startCamera');
const captureBtn = document.getElementById('captureBtn');
const autoCaptureBtn = document.getElementById('autoCapture');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const resetBtn = document.getElementById('resetBtn');
const photoCountSpan = document.getElementById('photoCount');
const countdownEl = document.getElementById('countdown');
const flashEl = document.getElementById('flash');
const photoSlots = document.querySelectorAll('.photo-slot');
const filterBtns = document.querySelectorAll('.filter-btn');
const stripSection = document.getElementById('stripSection');
const generateStripBtn = document.getElementById('generateStrip');
const downloadStripBtn = document.getElementById('downloadStrip');
const stripColorInput = document.getElementById('stripColor');
const addDateCheckbox = document.getElementById('addDate');
const addBorderCheckbox = document.getElementById('addBorder');

// ===== State =====
let stream = null;
let photos = [];
let currentFilter = 'none';
let isCapturing = false;

// ===== Constants =====
const MAX_PHOTOS = 4;
const PHOTO_WIDTH = 640;
const PHOTO_HEIGHT = 480;
const COUNTDOWN_SECONDS = 3;

// ===== Camera Functions =====
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: PHOTO_WIDTH },
                height: { ideal: PHOTO_HEIGHT },
                facingMode: 'user'
            },
            audio: false
        });
        
        video.srcObject = stream;
        startCameraBtn.textContent = '📷 Camera Active';
        startCameraBtn.disabled = true;
        captureBtn.disabled = false;
        autoCaptureBtn.disabled = false;
        
        // Set up capture canvas dimensions
        captureCanvas.width = PHOTO_WIDTH;
        captureCanvas.height = PHOTO_HEIGHT;
        
    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Unable to access camera. Please make sure you have granted camera permissions.');
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;
    }
}

// ===== Photo Capture Functions =====
function capturePhoto() {
    if (photos.length >= MAX_PHOTOS || isCapturing) return;
    
    const ctx = captureCanvas.getContext('2d');
    
    // Apply filter
    ctx.filter = currentFilter;
    
    // Flip horizontally to match the mirrored video
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -PHOTO_WIDTH, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
    ctx.restore();
    
    // Reset filter
    ctx.filter = 'none';
    
    // Get image data
    const imageData = captureCanvas.toDataURL('image/png');
    photos.push(imageData);
    
    // Show flash effect
    triggerFlash();
    
    // Update UI
    updatePhotoGrid();
    updateControls();
    
    // Show strip section when all photos are taken
    if (photos.length === MAX_PHOTOS) {
        stripSection.classList.remove('hidden');
        generateStrip();
    }
}

function triggerFlash() {
    flashEl.classList.add('active');
    setTimeout(() => {
        flashEl.classList.remove('active');
    }, 300);
}

async function autoCapture() {
    if (photos.length >= MAX_PHOTOS || isCapturing) return;
    
    isCapturing = true;
    captureBtn.disabled = true;
    autoCaptureBtn.disabled = true;
    
    // Countdown
    for (let i = COUNTDOWN_SECONDS; i > 0; i--) {
        countdownEl.textContent = i;
        countdownEl.classList.remove('hidden');
        await sleep(1000);
    }
    
    countdownEl.classList.add('hidden');
    
    // Capture photo
    capturePhoto();
    
    isCapturing = false;
    updateControls();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== UI Update Functions =====
function updatePhotoGrid() {
    photoSlots.forEach((slot, index) => {
        if (photos[index]) {
            slot.innerHTML = `
                <img src="${photos[index]}" alt="Photo ${index + 1}">
                <button class="delete-photo" data-index="${index}">×</button>
            `;
            slot.classList.add('filled');
        } else {
            slot.innerHTML = `<span class="placeholder">${index + 1}</span>`;
            slot.classList.remove('filled');
        }
    });
    
    // Add delete event listeners
    document.querySelectorAll('.delete-photo').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            deletePhoto(index);
        });
    });
    
    photoCountSpan.textContent = photos.length;
}

function updateControls() {
    const hasPhotos = photos.length > 0;
    const allPhotosTaken = photos.length >= MAX_PHOTOS;
    
    captureBtn.disabled = !stream || allPhotosTaken || isCapturing;
    autoCaptureBtn.disabled = !stream || allPhotosTaken || isCapturing;
    uploadBtn.style.pointerEvents = allPhotosTaken ? 'none' : 'auto';
    uploadBtn.style.opacity = allPhotosTaken ? '0.5' : '1';
    resetBtn.disabled = !hasPhotos;
    generateStripBtn.disabled = !allPhotosTaken;
    
    if (photos.length < MAX_PHOTOS) {
        stripSection.classList.add('hidden');
        downloadStripBtn.disabled = true;
    }
}

function deletePhoto(index) {
    photos.splice(index, 1);
    updatePhotoGrid();
    updateControls();
    stripSection.classList.add('hidden');
}

// ===== Upload Functions =====
function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    const remainingSlots = MAX_PHOTOS - photos.length;
    
    if (files.length === 0) return;
    
    if (files.length > remainingSlots) {
        alert(`You can only add ${remainingSlots} more photo(s). Only the first ${remainingSlots} will be added.`);
    }
    
    const filesToProcess = files.slice(0, remainingSlots);
    
    filesToProcess.forEach(file => {
        if (!file.type.startsWith('image/')) {
            console.warn('Skipping non-image file:', file.name);
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            // Create an image to resize/crop to match photo dimensions
            const img = new Image();
            img.onload = () => {
                // Use capture canvas to resize image
                const ctx = captureCanvas.getContext('2d');
                captureCanvas.width = PHOTO_WIDTH;
                captureCanvas.height = PHOTO_HEIGHT;
                
                // Calculate crop to fill (cover) the canvas
                const imgRatio = img.width / img.height;
                const canvasRatio = PHOTO_WIDTH / PHOTO_HEIGHT;
                
                let srcX = 0, srcY = 0, srcW = img.width, srcH = img.height;
                
                if (imgRatio > canvasRatio) {
                    // Image is wider - crop sides
                    srcW = img.height * canvasRatio;
                    srcX = (img.width - srcW) / 2;
                } else {
                    // Image is taller - crop top/bottom
                    srcH = img.width / canvasRatio;
                    srcY = (img.height - srcH) / 2;
                }
                
                // Apply current filter
                ctx.filter = currentFilter;
                ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
                ctx.filter = 'none';
                
                // Add to photos array
                const imageData = captureCanvas.toDataURL('image/png');
                photos.push(imageData);
                
                // Update UI
                updatePhotoGrid();
                updateControls();
                
                // Show strip section when all photos are taken
                if (photos.length === MAX_PHOTOS) {
                    stripSection.classList.remove('hidden');
                    generateStrip();
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
    
    // Reset file input so same files can be selected again
    event.target.value = '';
}

function resetPhotos() {
    photos = [];
    updatePhotoGrid();
    updateControls();
    stripSection.classList.add('hidden');
    
    // Clear strip canvas
    const ctx = stripCanvas.getContext('2d');
    ctx.clearRect(0, 0, stripCanvas.width, stripCanvas.height);
}

// ===== Filter Functions =====
function applyFilter(filter) {
    currentFilter = filter;
    video.style.filter = filter;
    
    // Update active button
    filterBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
}

// ===== Strip Generation =====
function generateStrip() {
    if (photos.length !== MAX_PHOTOS) return;
    
    const stripColor = stripColorInput.value;
    const addDate = addDateCheckbox.checked;
    const addBorder = addBorderCheckbox.checked;
    
    // Strip dimensions (portrait orientation like real photobooth strips)
    const photoW = 300;
    const photoH = 225;
    const padding = 20;
    const borderWidth = addBorder ? 8 : 0;
    const dateHeight = addDate ? 40 : 0;
    
    const stripW = photoW + (padding * 2) + (borderWidth * 2);
    const stripH = (photoH * MAX_PHOTOS) + (padding * (MAX_PHOTOS + 1)) + (borderWidth * 2) + dateHeight;
    
    stripCanvas.width = stripW;
    stripCanvas.height = stripH;
    
    const ctx = stripCanvas.getContext('2d');
    
    // Background
    ctx.fillStyle = stripColor;
    ctx.fillRect(0, 0, stripW, stripH);
    
    // Border
    if (addBorder) {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(borderWidth / 2, borderWidth / 2, stripW - borderWidth, stripH - borderWidth);
    }
    
    // Draw photos
    const startX = padding + borderWidth;
    let startY = padding + borderWidth;
    
    let loadedCount = 0;
    
    photos.forEach((photoData, index) => {
        const img = new Image();
        img.onload = () => {
            const y = startY + (index * (photoH + padding));
            
            // Draw photo with rounded corners
            ctx.save();
            roundedRect(ctx, startX, y, photoW, photoH, 8);
            ctx.clip();
            ctx.drawImage(img, startX, y, photoW, photoH);
            ctx.restore();
            
            // Add subtle shadow effect
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            
            loadedCount++;
            
            // Add date when all photos are loaded
            if (loadedCount === MAX_PHOTOS) {
                if (addDate) {
                    const dateY = stripH - borderWidth - 10;
                    ctx.shadowColor = 'transparent';
                    ctx.fillStyle = getContrastColor(stripColor);
                    ctx.font = 'bold 14px Poppins, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(formatDate(new Date()), stripW / 2, dateY);
                }
                
                downloadStripBtn.disabled = false;
            }
        };
        img.src = photoData;
    });
}

function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function formatDate(date) {
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return date.toLocaleDateString('en-US', options);
}

function getContrastColor(hexColor) {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    return luminance > 0.5 ? '#333333' : '#ffffff';
}

// ===== Download Function =====
function downloadStrip() {
    const link = document.createElement('a');
    link.download = `photobooth-strip-${Date.now()}.png`;
    link.href = stripCanvas.toDataURL('image/png');
    link.click();
}

// ===== Event Listeners =====
startCameraBtn.addEventListener('click', startCamera);
captureBtn.addEventListener('click', capturePhoto);
autoCaptureBtn.addEventListener('click', autoCapture);
fileInput.addEventListener('change', handleFileUpload);
resetBtn.addEventListener('click', resetPhotos);

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        applyFilter(btn.dataset.filter);
    });
});

generateStripBtn.addEventListener('click', generateStrip);
downloadStripBtn.addEventListener('click', downloadStrip);

// Regenerate strip when options change
stripColorInput.addEventListener('input', generateStrip);
addDateCheckbox.addEventListener('change', generateStrip);
addBorderCheckbox.addEventListener('change', generateStrip);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !captureBtn.disabled) {
        e.preventDefault();
        capturePhoto();
    }
    if (e.code === 'KeyA' && !autoCaptureBtn.disabled) {
        e.preventDefault();
        autoCapture();
    }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    stopCamera();
});

// ===== Initialize =====
console.log('📸 Photobooth Strip Generator loaded!');
console.log('Keyboard shortcuts: SPACE = capture, A = auto capture');
