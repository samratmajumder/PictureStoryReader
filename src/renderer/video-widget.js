const { ipcRenderer } = require('electron');
const path = require('path');

// DOM Elements
const closeBtn = document.getElementById('close-btn');
const currentVideo = document.getElementById('current-video');
const modeSelect = document.getElementById('mode-select');
const loadVideosBtn = document.getElementById('load-videos-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const prevVideoBtn = document.getElementById('prev-video-btn');
const nextVideoBtn = document.getElementById('next-video-btn');
const muteBtn = document.getElementById('mute-btn');
const volumeSlider = document.getElementById('volume-slider');

// State
let widgetId = null;
let widgetSettings = {
  mode: 'single',
  sources: [],
  currentIndex: 0
};
let isPlaying = false;
let isImmersiveMode = false;

// Event Listeners
closeBtn.addEventListener('click', () => window.close());
modeSelect.addEventListener('change', updateMode);
loadVideosBtn.addEventListener('click', loadVideos);
playPauseBtn.addEventListener('click', togglePlayback);
prevVideoBtn.addEventListener('click', playPreviousVideo);
nextVideoBtn.addEventListener('click', playNextVideo);
muteBtn.addEventListener('click', toggleMute);
volumeSlider.addEventListener('input', updateVolume);
currentVideo.addEventListener('ended', handleVideoEnded);

// Add mouse activity tracking to notify main window
document.addEventListener('mousemove', notifyMainWindowOfActivity);
document.addEventListener('click', notifyMainWindowOfActivity);

// Init
ipcRenderer.on('init-widget', (event, data) => {
  widgetId = data.id;
  
  if (data.settings) {
    widgetSettings = { ...widgetSettings, ...data.settings };
    
    // Apply settings
    modeSelect.value = widgetSettings.mode;
    
    // Load videos if available
    if (widgetSettings.sources && widgetSettings.sources.length > 0) {
      displayVideo(widgetSettings.sources[widgetSettings.currentIndex]);
    }
  }
});

// Add immersive mode listener
ipcRenderer.on('immersive-mode-update', (event, data) => {
  const { isImmersive } = data;
  toggleImmersiveMode(isImmersive);
});

// Functions
async function loadVideos() {
  const mode = modeSelect.value;
  widgetSettings.mode = mode;
  
  // Select video files
  const videoPaths = await ipcRenderer.invoke('select-videos');
  
  if (videoPaths.length > 0) {
    widgetSettings.sources = videoPaths;
    widgetSettings.currentIndex = 0;
    
    // Display first video
    displayVideo(videoPaths[0]);
    
    // Enable/disable navigation buttons
    updateNavigationButtons();
  }
}

function displayVideo(videoPath) {
  if (!videoPath) return;
  
  // Remember current volume and play state
  const wasPlaying = !currentVideo.paused;
  const volume = currentVideo.volume;
  
  // Update video source
  currentVideo.src = videoPath;
  currentVideo.volume = volume;
  
  // Set loop for single video mode
  currentVideo.loop = (widgetSettings.mode === 'single');
  
  // Start playing if it was playing before
  if (wasPlaying) {
    currentVideo.play().catch(err => console.error('Failed to play video:', err));
  }
}

function updateMode(event) {
  const mode = event.target.value;
  widgetSettings.mode = mode;
  
  // Update loop setting based on mode
  currentVideo.loop = (mode === 'single');
  
  // Update navigation buttons
  updateNavigationButtons();
}

function togglePlayback() {
  if (currentVideo.paused) {
    currentVideo.play()
      .then(() => {
        isPlaying = true;
        playPauseBtn.textContent = '⏸';
      })
      .catch(err => console.error('Failed to play video:', err));
  } else {
    currentVideo.pause();
    isPlaying = false;
    playPauseBtn.textContent = '⏯';
  }
}

function playPreviousVideo() {
  if (widgetSettings.sources.length <= 1) return;
  
  widgetSettings.currentIndex = (widgetSettings.currentIndex - 1 + widgetSettings.sources.length) 
    % widgetSettings.sources.length;
  
  displayVideo(widgetSettings.sources[widgetSettings.currentIndex]);
  updateNavigationButtons();
}

function playNextVideo() {
  if (widgetSettings.sources.length <= 1) return;
  
  widgetSettings.currentIndex = (widgetSettings.currentIndex + 1) % widgetSettings.sources.length;
  
  displayVideo(widgetSettings.sources[widgetSettings.currentIndex]);
  updateNavigationButtons();
}

function handleVideoEnded() {
  if (widgetSettings.mode === 'playlist' && widgetSettings.sources.length > 1) {
    playNextVideo();
  }
}

function toggleMute() {
  currentVideo.muted = !currentVideo.muted;
  muteBtn.textContent = currentVideo.muted ? '🔇' : '🔊';
  
  // Update volume slider
  volumeSlider.value = currentVideo.muted ? 0 : currentVideo.volume;
}

function updateVolume() {
  const volume = parseFloat(volumeSlider.value);
  currentVideo.volume = volume;
  
  // Update mute button
  if (volume === 0) {
    currentVideo.muted = true;
    muteBtn.textContent = '🔇';
  } else if (currentVideo.muted) {
    currentVideo.muted = false;
    muteBtn.textContent = '🔊';
  }
}

function updateNavigationButtons() {
  // Enable/disable navigation buttons based on playlist length
  const hasMultipleVideos = widgetSettings.sources.length > 1;
  prevVideoBtn.disabled = !hasMultipleVideos;
  nextVideoBtn.disabled = !hasMultipleVideos;
}

// Function to toggle immersive mode
function toggleImmersiveMode(enable) {
  isImmersiveMode = enable;
  const widgetHeader = document.querySelector('.widget-header');
  const widgetFooter = document.querySelector('.widget-footer');
  const widgetContent = document.querySelector('.widget-content');
  
  if (enable) {
    // Hide controls
    widgetHeader.style.opacity = '0';
    widgetFooter.style.opacity = '0';
    widgetHeader.style.pointerEvents = 'none';
    widgetFooter.style.pointerEvents = 'none';
    document.body.style.backgroundColor = 'transparent';
    widgetContent.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    document.body.style.cursor = 'none';
  } else {
    // Show controls
    widgetHeader.style.opacity = '1';
    widgetFooter.style.opacity = '1';
    widgetHeader.style.pointerEvents = 'auto';
    widgetFooter.style.pointerEvents = 'auto';
    document.body.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    widgetContent.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    document.body.style.cursor = 'default';
  }
}

// Function to notify main window of activity in this widget
function notifyMainWindowOfActivity() {
  ipcRenderer.send('widget-activity', { widgetId });
}