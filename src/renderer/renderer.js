const { ipcRenderer } = require('electron');
const uuid = require('uuid');
const path = require('path');

// DOM Elements
const openDocumentBtn = document.getElementById('open-document-btn');
const createImageWidgetBtn = document.getElementById('create-image-widget-btn');
const createVideoWidgetBtn = document.getElementById('create-video-widget-btn');
const saveLayoutBtn = document.getElementById('save-layout-btn');
const loadLayoutBtn = document.getElementById('load-layout-btn');
const readingModeSelect = document.getElementById('reading-mode-select');
const scrollSpeedInput = document.getElementById('scroll-speed');
const scrollSpeedValue = document.getElementById('scroll-speed-value');
const playPauseBtn = document.getElementById('play-pause-btn');
const decreaseFontBtn = document.getElementById('decrease-font-btn');
const increaseFontBtn = document.getElementById('increase-font-btn');
const fontSelect = document.getElementById('font-select');
const readerContent = document.getElementById('reader-content');

// State
let currentDocument = null;
let isScrolling = false;
let scrollTimer = null;
let currentFontSize = 16;
let widgets = new Map();
let currentLayout = {
  document: null,
  readingMode: 'vertical-scroll',
  scrollSpeed: 2,
  fontSize: 16,
  fontFamily: 'Arial',
  widgets: []
};

// Track current line position in the document
let currentLineNumber = 0;
let lineCount = 0;
let documentLines = [];

// Add variables for immersive reading mode
let isImmersiveMode = false;
let inactivityTimer = null;
let inactivityDelay = 3000; // 3 seconds of inactivity before hiding UI

// Event Listeners
openDocumentBtn.addEventListener('click', openDocument);
createImageWidgetBtn.addEventListener('click', () => createWidget('image'));
createVideoWidgetBtn.addEventListener('click', () => createWidget('video'));
saveLayoutBtn.addEventListener('click', saveLayout);
loadLayoutBtn.addEventListener('click', loadLayout);
readingModeSelect.addEventListener('change', changeReadingMode);
scrollSpeedInput.addEventListener('input', updateScrollSpeed);
playPauseBtn.addEventListener('click', toggleScrolling);
decreaseFontBtn.addEventListener('click', () => changeFontSize(-1));
increaseFontBtn.addEventListener('click', () => changeFontSize(1));
fontSelect.addEventListener('change', changeFontFamily);

// Functions
async function openDocument() {
  const result = await ipcRenderer.invoke('open-document');
  if (result) {
    currentDocument = result;
    displayDocument(result.fileContent);
    currentLayout.document = result.filePath;
  }
}

function displayDocument(content) {
  if (!content) return;
  
  // Clear the reader content
  readerContent.innerHTML = '';
  
  // Apply reading mode and styling
  readerContent.className = `mode-${currentLayout.readingMode}`;
  
  // Split content into lines for position tracking
  documentLines = content.split('\n');
  lineCount = documentLines.length;
  currentLineNumber = 0;
  
  // Create paragraphs for simple text
  const paragraphs = content.split('\n\n');
  let lineCounter = 0;
  
  paragraphs.forEach(paragraph => {
    if (paragraph.trim()) {
      const p = document.createElement('p');
      p.textContent = paragraph;
      p.dataset.startLine = lineCounter;
      
      // Calculate how many lines this paragraph takes up
      const paragraphLines = paragraph.split('\n').length;
      lineCounter += paragraphLines;
      p.dataset.endLine = lineCounter - 1;
      
      readerContent.appendChild(p);
    }
  });
  
  // Apply font settings
  applyFontSettings();
  
  // Set up scroll position tracking
  setupScrollPositionTracking();
}

function setupScrollPositionTracking() {
  const container = document.getElementById('reader-container');
  
  // Track scroll position to determine current line
  container.addEventListener('scroll', () => {
    updateCurrentLineNumber();
  });
}

function updateCurrentLineNumber() {
  const container = document.getElementById('reader-container');
  const elements = readerContent.querySelectorAll('p');
  
  // Find the paragraph that's most visible in the viewport
  const containerRect = container.getBoundingClientRect();
  const containerMiddleY = containerRect.top + containerRect.height / 2;
  
  let closestElement = null;
  let closestDistance = Infinity;
  
  elements.forEach(element => {
    const elementRect = element.getBoundingClientRect();
    const elementMiddleY = elementRect.top + elementRect.height / 2;
    const distance = Math.abs(elementMiddleY - containerMiddleY);
    
    if (distance < closestDistance) {
      closestDistance = distance;
      closestElement = element;
    }
  });
  
  if (closestElement) {
    const startLine = parseInt(closestElement.dataset.startLine, 10);
    const endLine = parseInt(closestElement.dataset.endLine, 10);
    
    // Estimate current line based on vertical position within the paragraph
    const elementRect = closestElement.getBoundingClientRect();
    const totalHeight = elementRect.height;
    const relativeY = containerMiddleY - elementRect.top;
    const linePosition = Math.min(endLine - startLine, Math.floor(relativeY / totalHeight * (endLine - startLine + 1)));
    
    currentLineNumber = startLine + linePosition;
    
    // Send position update to all image widgets
    notifyWidgetsOfPosition();
  }
}

function notifyWidgetsOfPosition() {
  // Send current line position to all widgets via main process
  if (widgets.size > 0) {
    ipcRenderer.send('update-widgets-position', {
      lineNumber: currentLineNumber,
      documentPath: currentDocument ? currentDocument.filePath : null,
      widgetIds: Array.from(widgets.values()).map(w => ({ id: w.id, windowId: w.windowId }))
    });
  }
}

async function createWidget(type) {
  // For simplicity, we'll position new widgets in a cascading manner
  const windowPositions = Array.from(widgets.values())
    .map(w => ({ x: w.x, y: w.y }));
  
  // Calculate a position that doesn't exactly overlap existing widgets
  let xPos = 50;
  let yPos = 50;
  
  if (windowPositions.length > 0) {
    xPos = Math.max(...windowPositions.map(p => p.x)) + 20;
    yPos = Math.max(...windowPositions.map(p => p.y)) + 20;
  }
  
  const widgetId = uuid.v4();
  const widgetOptions = {
    id: widgetId,
    type,
    x: xPos,
    y: yPos,
    width: type === 'image' ? 400 : 480,
    height: type === 'image' ? 300 : 320,
    settings: {
      mode: 'single', // Default mode
      interval: 5, // Default interval in seconds
      sources: [],  // Will be populated when the widget is configured
    }
  };
  
  // Create the widget window
  const windowId = await ipcRenderer.invoke('create-widget', widgetOptions);
  
  // Store widget reference
  widgets.set(widgetId, {
    id: widgetId,
    windowId,
    type,
    x: xPos,
    y: yPos,
    ...widgetOptions
  });
  
  // Add to layout
  currentLayout.widgets.push({
    id: widgetId,
    type,
    x: xPos,
    y: yPos,
    width: widgetOptions.width,
    height: widgetOptions.height,
    settings: widgetOptions.settings
  });
  
  return widgetId;
}

function changeReadingMode(event) {
  const mode = event.target.value;
  currentLayout.readingMode = mode;
  
  // Remove old mode classes
  readerContent.classList.remove('mode-vertical-scroll', 'mode-horizontal-scroll', 'mode-book-mode');
  // Add new mode class
  readerContent.classList.add(`mode-${mode}`);
  
  // Reset scrolling if active
  if (isScrolling) {
    stopScrolling();
    startScrolling();
  }
}

function updateScrollSpeed(event) {
  const speed = parseFloat(event.target.value);
  scrollSpeedValue.textContent = speed;
  currentLayout.scrollSpeed = speed;
  
  // Update scrolling if active
  if (isScrolling) {
    stopScrolling();
    startScrolling();
  }
}

function toggleScrolling() {
  if (isScrolling) {
    stopScrolling();
    playPauseBtn.textContent = 'Start';
  } else {
    startScrolling();
    playPauseBtn.textContent = 'Pause';
  }
}

function startScrolling() {
  if (!currentDocument) return;
  
  isScrolling = true;
  const speed = currentLayout.scrollSpeed;
  const container = document.getElementById('reader-container');
  const content = document.getElementById('reader-content');
  const mode = currentLayout.readingMode;
  
  // Clear any existing scroll timer
  if (scrollTimer) cancelAnimationFrame(scrollTimer);
  
  // Track the last position and timestamp for smooth animation
  let lastTimestamp = null;
  let scrollPosition = mode === 'vertical-scroll' ? container.scrollTop : container.scrollLeft;
  
  // Use requestAnimationFrame for smoother scrolling
  const scrollFrame = (timestamp) => {
    if (!isScrolling) return;
    
    // Calculate time delta for consistent scrolling regardless of frame rate
    if (!lastTimestamp) lastTimestamp = timestamp;
    const deltaTime = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    
    // Calculate scroll increment based on speed and time delta
    const scrollIncrement = (speed * deltaTime) / 16.67; // Normalize to ~60fps
    
    if (mode === 'vertical-scroll') {
      scrollPosition += scrollIncrement;
      container.scrollTop = scrollPosition;
      
      // Loop back to top when reached bottom
      if (container.scrollTop >= content.offsetHeight - container.offsetHeight) {
        scrollPosition = 0;
        container.scrollTop = 0;
      }
    } else if (mode === 'horizontal-scroll') {
      scrollPosition += scrollIncrement;
      container.scrollLeft = scrollPosition;
      
      // Loop back to start when reached end
      if (container.scrollLeft >= content.offsetWidth - container.offsetWidth) {
        scrollPosition = 0;
        container.scrollLeft = 0;
      }
    } else if (mode === 'book-mode') {
      // Book mode - more discrete paging
      // Only advance to next page when current page is fully visible
      const pageWidth = container.offsetWidth;
      const currentPage = Math.floor(scrollPosition / pageWidth);
      const targetPosition = (currentPage + 1) * pageWidth;
      
      // Smoothly move to the next page
      scrollPosition += Math.min(scrollIncrement, targetPosition - scrollPosition);
      container.scrollLeft = scrollPosition;
      
      // Loop back to start when reached end
      if (container.scrollLeft >= content.offsetWidth - container.offsetWidth) {
        scrollPosition = 0;
        container.scrollLeft = 0;
      }
    }
    
    // Request next frame
    scrollTimer = requestAnimationFrame(scrollFrame);
  };
  
  // Start the animation
  scrollTimer = requestAnimationFrame(scrollFrame);
  
  playPauseBtn.textContent = 'Pause';
}

function stopScrolling() {
  isScrolling = false;
  if (scrollTimer) {
    cancelAnimationFrame(scrollTimer);
    scrollTimer = null;
  }
  playPauseBtn.textContent = 'Start';
}

function changeFontSize(delta) {
  currentFontSize = Math.max(8, Math.min(32, currentFontSize + delta));
  currentLayout.fontSize = currentFontSize;
  applyFontSettings();
}

function changeFontFamily(event) {
  const fontFamily = event.target.value;
  currentLayout.fontFamily = fontFamily;
  applyFontSettings();
}

function applyFontSettings() {
  readerContent.style.fontSize = `${currentLayout.fontSize}px`;
  readerContent.style.fontFamily = currentLayout.fontFamily;
}

async function saveLayout() {
  // Save current layout to electron-store
  const saved = await ipcRenderer.invoke('save-layout', currentLayout);
  if (saved) {
    alert('Layout saved successfully!');
  }
}

async function loadLayout() {
  // Load saved layout from electron-store
  const layout = await ipcRenderer.invoke('load-layout');
  if (layout) {
    // Apply loaded layout
    currentLayout = layout;
    
    // Restore document if available
    if (layout.document) {
      // Here we'd need to reload the document content
      // For now we'll just set the path
      currentDocument = { filePath: layout.document };
      // In a real app, we'd reload the content here
    }
    
    // Restore reading mode
    readingModeSelect.value = layout.readingMode;
    changeReadingMode({ target: readingModeSelect });
    
    // Restore scroll speed
    scrollSpeedInput.value = layout.scrollSpeed;
    scrollSpeedValue.textContent = layout.scrollSpeed;
    
    // Restore font settings
    currentFontSize = layout.fontSize;
    fontSelect.value = layout.fontFamily;
    applyFontSettings();
    
    // Restore widgets
    await Promise.all(layout.widgets.map(async (widget) => {
      const widgetId = await createWidget(widget.type);
      const createdWidget = widgets.get(widgetId);
      if (createdWidget) {
        // Update with saved settings
        createdWidget.x = widget.x;
        createdWidget.y = widget.y;
        createdWidget.settings = widget.settings;
        // In a real implementation, we'd send this updated info to the widget window
      }
    }));
    
    alert('Layout loaded successfully!');
  } else {
    alert('No saved layout found.');
  }
}

// Setup auto-hiding controls for immersive reading
function setupImmersiveMode() {
  const app = document.getElementById('app');
  const controlsOverlay = document.getElementById('controls-overlay');
  const readerContainer = document.getElementById('reader-container');
  
  // Mouse movement detection
  document.addEventListener('mousemove', () => {
    showUI();
    resetInactivityTimer();
  });
  
  // Mouse click detection
  document.addEventListener('click', (event) => {
    // Only toggle immersive mode if we click on the reader area (not on controls)
    if (!event.target.closest('#controls-overlay')) {
      resetInactivityTimer();
    }
  });
  
  // Keyboard activity detection
  document.addEventListener('keydown', (event) => {
    // Show UI on any key press
    showUI();
    resetInactivityTimer();
    
    // Escape key exits immersive mode completely
    if (event.key === 'Escape') {
      isImmersiveMode = false;
      showUI(true); // Force show UI
    }
  });
  
  // Add listener for widget activity
  ipcRenderer.on('widget-activity-update', () => {
    // Reset inactivity timer when widgets report activity
    showUI();
    resetInactivityTimer();
  });

  // Initial timer setup
  resetInactivityTimer();
  
  // Function to hide UI
  function hideUI() {
    if (!currentDocument) return; // Only hide UI if a document is loaded
    
    isImmersiveMode = true;
    
    // Simply hide the controls overlay without affecting the reader
    controlsOverlay.classList.add('hidden');
    
    // Add immersive mode class to body for cursor handling
    document.body.classList.add('immersive-mode');
    
    // Notify widgets to hide their controls
    notifyWidgetsOfImmersiveMode(true);
  }
  
  // Function to show UI
  function showUI(force = false) {
    if (force) {
      isImmersiveMode = false;
    }
    
    // Show controls overlay
    controlsOverlay.classList.remove('hidden');
    
    // Remove immersive mode class from body
    document.body.classList.remove('immersive-mode');
    
    // Notify widgets to show their controls
    notifyWidgetsOfImmersiveMode(false);
  }
  
  // Reset inactivity timer
  function resetInactivityTimer() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    
    // Only start timer if a document is loaded
    if (currentDocument) {
      inactivityTimer = setTimeout(() => {
        hideUI();
      }, inactivityDelay);
    }
  }
}

// Notify widgets of immersive mode changes
function notifyWidgetsOfImmersiveMode(isImmersive) {
  if (widgets.size > 0) {
    ipcRenderer.send('update-widgets-immersive-mode', {
      isImmersive,
      widgetIds: Array.from(widgets.values()).map(w => ({ id: w.id, windowId: w.windowId }))
    });
  }
}

// Initialize application
function init() {
  // Set default font
  fontSelect.value = currentLayout.fontFamily;
  applyFontSettings();
  
  // Set up UI auto-hiding for immersive reading
  setupImmersiveMode();
}

init();