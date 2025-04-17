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
  if (scrollTimer) clearInterval(scrollTimer);
  
  // Set up scrolling based on reading mode
  scrollTimer = setInterval(() => {
    if (mode === 'vertical-scroll') {
      container.scrollTop += speed;
      // Loop back to top when reached bottom
      if (container.scrollTop >= content.offsetHeight - container.offsetHeight) {
        container.scrollTop = 0;
      }
    } else if (mode === 'horizontal-scroll') {
      container.scrollLeft += speed;
      // Loop back to start when reached end
      if (container.scrollLeft >= content.offsetWidth - container.offsetWidth) {
        container.scrollLeft = 0;
      }
    } else if (mode === 'book-mode') {
      // Book mode behavior - flip pages
      if (container.scrollLeft % container.offsetWidth === 0) {
        container.scrollLeft += container.offsetWidth;
      }
      // Loop back to start when reached end
      if (container.scrollLeft >= content.offsetWidth - container.offsetWidth) {
        container.scrollLeft = 0;
      }
    }
  }, 50); // Update every 50ms for smooth scrolling
}

function stopScrolling() {
  isScrolling = false;
  if (scrollTimer) {
    clearInterval(scrollTimer);
    scrollTimer = null;
  }
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

// Initialize application
function init() {
  // Set default font
  fontSelect.value = currentLayout.fontFamily;
  applyFontSettings();
}

init();