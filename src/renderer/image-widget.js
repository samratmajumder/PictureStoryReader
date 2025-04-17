const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// DOM Elements
const closeBtn = document.getElementById('close-btn');
const currentImage = document.getElementById('current-image');
const imageDisplay = document.getElementById('image-display');
const modeSelect = document.getElementById('mode-select');
const loadImagesBtn = document.getElementById('load-images-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const intervalInput = document.getElementById('interval-input');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomResetBtn = document.getElementById('zoom-reset-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');

// State
let widgetId = null;
let widgetSettings = {
  mode: 'single',
  interval: 5,
  sources: [],
  currentIndex: 0,
  documentPath: null,
  scriptEntries: []
};
let isPlaying = false;
let playTimer = null;
let zoomLevel = 1;
let panMode = false;
let lastMousePosition = { x: 0, y: 0 };
let imagePosition = { x: 0, y: 0 };

// Event Listeners
closeBtn.addEventListener('click', () => window.close());
modeSelect.addEventListener('change', updateMode);
loadImagesBtn.addEventListener('click', loadImages);
playPauseBtn.addEventListener('click', togglePlayback);
intervalInput.addEventListener('input', updateInterval);
zoomInBtn.addEventListener('click', () => changeZoom(0.1));
zoomResetBtn.addEventListener('click', resetZoom);
zoomOutBtn.addEventListener('click', () => changeZoom(-0.1));

// Mouse event listeners for pan functionality
imageDisplay.addEventListener('mousedown', startPan);
imageDisplay.addEventListener('mousemove', pan);
imageDisplay.addEventListener('mouseup', endPan);
imageDisplay.addEventListener('mouseleave', endPan);
imageDisplay.addEventListener('wheel', handleZoomScroll);

// Init
ipcRenderer.on('init-widget', (event, data) => {
  widgetId = data.id;
  
  if (data.settings) {
    widgetSettings = { ...widgetSettings, ...data.settings };
    
    // Apply settings
    modeSelect.value = widgetSettings.mode;
    intervalInput.value = widgetSettings.interval;
    
    // Load images if available
    if (widgetSettings.sources && widgetSettings.sources.length > 0) {
      displayImage(widgetSettings.sources[widgetSettings.currentIndex]);
      
      // Start playback if mode is not single
      if (widgetSettings.mode !== 'single') {
        startPlayback();
      }
    }
  }
});

// Functions
async function loadImages() {
  const mode = modeSelect.value;
  widgetSettings.mode = mode;
  
  let imagePaths = [];
  
  if (mode === 'single' || mode === 'list') {
    // Select individual images
    imagePaths = await ipcRenderer.invoke('select-images', { mode: 'files' });
  } else if (mode === 'folder') {
    // Select folder of images
    imagePaths = await ipcRenderer.invoke('select-images', { mode: 'folder' });
  } else if (mode === 'script') {
    // Script-based loading
    const result = await ipcRenderer.invoke('parse-image-script', { 
      documentPath: widgetSettings.documentPath 
    });
    
    if (result) {
      widgetSettings.scriptEntries = result.entries;
      
      // Get the first image from script if available
      if (result.entries.length > 0) {
        imagePaths = [result.entries[0].imagePath];
      } else {
        alert('No valid entries found in the image script file.');
        return;
      }
    } else {
      alert('No image script file found for the current document.');
      return;
    }
  }
  
  if (imagePaths.length > 0) {
    widgetSettings.sources = imagePaths;
    widgetSettings.currentIndex = 0;
    
    // Display first image
    displayImage(imagePaths[0]);
    
    // Start playback for folder and list modes
    if (mode !== 'single' && mode !== 'script') {
      startPlayback();
    }
  }
}

function displayImage(imagePath) {
  if (!imagePath) return;
  
  currentImage.src = imagePath;
  resetZoom(); // Reset zoom when changing images
}

function updateMode(event) {
  const mode = event.target.value;
  widgetSettings.mode = mode;
  
  // Stop any existing playback
  stopPlayback();
  
  // If we have loaded images and not in single mode, start playback
  if (widgetSettings.sources.length > 0 && mode !== 'single') {
    startPlayback();
  }
}

function updateInterval() {
  widgetSettings.interval = parseInt(intervalInput.value, 10);
  
  // Restart playback if active
  if (isPlaying) {
    stopPlayback();
    startPlayback();
  }
}

function togglePlayback() {
  if (isPlaying) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (widgetSettings.sources.length <= 1) return;
  
  isPlaying = true;
  playPauseBtn.textContent = 'Pause';
  
  // Clear existing timer
  if (playTimer) clearInterval(playTimer);
  
  // Set interval to change images
  playTimer = setInterval(() => {
    if (widgetSettings.mode === 'folder') {
      // Random image from folder
      const randomIndex = Math.floor(Math.random() * widgetSettings.sources.length);
      widgetSettings.currentIndex = randomIndex;
    } else {
      // Sequential playback for list mode
      widgetSettings.currentIndex = (widgetSettings.currentIndex + 1) % widgetSettings.sources.length;
    }
    
    displayImage(widgetSettings.sources[widgetSettings.currentIndex]);
  }, widgetSettings.interval * 1000);
}

function stopPlayback() {
  isPlaying = false;
  playPauseBtn.textContent = 'Play';
  
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}

function changeZoom(delta) {
  zoomLevel = Math.max(0.1, Math.min(10, zoomLevel + delta));
  applyZoomAndPan();
}

function resetZoom() {
  zoomLevel = 1;
  imagePosition = { x: 0, y: 0 };
  applyZoomAndPan();
}

function applyZoomAndPan() {
  currentImage.style.transform = `translate(${imagePosition.x}px, ${imagePosition.y}px) scale(${zoomLevel})`;
}

function startPan(event) {
  if (zoomLevel > 1) {
    panMode = true;
    lastMousePosition = { x: event.clientX, y: event.clientY };
    imageDisplay.style.cursor = 'grabbing';
  }
}

function pan(event) {
  if (!panMode) return;
  
  const deltaX = event.clientX - lastMousePosition.x;
  const deltaY = event.clientY - lastMousePosition.y;
  
  imagePosition.x += deltaX;
  imagePosition.y += deltaY;
  
  lastMousePosition = { x: event.clientX, y: event.clientY };
  
  applyZoomAndPan();
}

function endPan() {
  panMode = false;
  imageDisplay.style.cursor = 'default';
}

function handleZoomScroll(event) {
  event.preventDefault();
  const delta = event.deltaY < 0 ? 0.1 : -0.1;
  changeZoom(delta);
}

// Listen for reader position updates (for script mode)
ipcRenderer.on('reader-position-update', (event, { lineNumber, documentPath }) => {
  // Store document path for script mode
  if (documentPath) {
    widgetSettings.documentPath = documentPath;
  }
  
  // If in script mode, update the displayed image based on line number
  if (widgetSettings.mode === 'script' && widgetSettings.scriptEntries.length > 0) {
    // Find the appropriate image for the current line number
    const matchingEntry = widgetSettings.scriptEntries.find(entry => 
      lineNumber >= entry.startLine && lineNumber <= entry.endLine
    );
    
    if (matchingEntry) {
      displayImage(matchingEntry.imagePath);
    }
  }
});