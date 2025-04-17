const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
// Fix the electron-store import
const Store = require('electron-store').default || require('electron-store');
const fs = require('fs');
const mammoth = require('mammoth');
const { PDFDocument } = require('pdf-lib');

// Initialize store for app settings and layouts
const store = new Store();

// Keep a global reference of the window objects
let mainWindow = null;
const widgetWindows = new Map();

function createMainWindow() {
  // Create the browser window for the main reader
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'PictureStory Reader',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // Load the main HTML file
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development mode
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Close all widget windows when main window is closed
    widgetWindows.forEach((window) => {
      if (!window.isDestroyed()) window.close();
    });
    widgetWindows.clear();
  });
}

function createWidgetWindow(options = {}) {
  const { id, type, x, y, width, height, displayId, settings } = options;
  
  const widgetWindow = new BrowserWindow({
    width: width || 400,
    height: height || 300,
    x, y,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // Load the appropriate widget HTML based on type
  const widgetType = type || 'image';
  widgetWindow.loadFile(path.join(__dirname, `../renderer/${widgetType}-widget.html`));
  
  // Set window ID and store it
  widgetWindow.id = id;
  widgetWindows.set(id, widgetWindow);
  
  // Send initial settings to the widget
  widgetWindow.webContents.on('did-finish-load', () => {
    widgetWindow.webContents.send('init-widget', { id, type, settings });
  });

  widgetWindow.on('closed', () => {
    widgetWindows.delete(id);
  });

  return widgetWindow;
}

// Open document file dialog
ipcMain.handle('open-document', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['docx', 'pdf', 'txt', 'pptx'] }
    ]
  });
  
  if (!canceled && filePaths.length > 0) {
    const filePath = filePaths[0];
    const fileContent = await readDocumentFile(filePath);
    return { filePath, fileContent };
  }
  return null;
});

// Select folder or files for images
ipcMain.handle('select-images', async (event, { mode }) => {
  const properties = mode === 'folder' 
    ? ['openDirectory']
    : ['openFile', 'multiSelections'];
    
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties,
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
    ]
  });
  
  if (!canceled && filePaths.length > 0) {
    if (mode === 'folder') {
      // Read all images from the folder
      const files = fs.readdirSync(filePaths[0])
        .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
        .map(file => path.join(filePaths[0], file));
      return files;
    }
    return filePaths;
  }
  return [];
});

// Select video files
ipcMain.handle('select-videos', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'webm', 'ogg', 'mov'] }
    ]
  });
  
  if (!canceled && filePaths.length > 0) {
    return filePaths;
  }
  return [];
});

// Handle script-based image loading
ipcMain.handle('parse-image-script', (event, { documentPath }) => {
  if (!documentPath) return null;
  
  // Get the directory and base name of the document
  const documentDir = path.dirname(documentPath);
  const documentName = path.basename(documentPath, path.extname(documentPath));
  
  // Look for image script file
  const imageScriptPath = path.join(documentDir, 'imagescripts', `${documentName}.imagescript`);
  
  try {
    if (fs.existsSync(imageScriptPath)) {
      // Parse the image script file
      const scriptContent = fs.readFileSync(imageScriptPath, 'utf8');
      const scriptLines = scriptContent.split('\n')
        .filter(line => line.trim() && !line.startsWith('#'));
      
      const scriptEntries = [];
      
      // Parse each line of the script
      scriptLines.forEach(line => {
        const parts = line.split(',').map(part => part.trim());
        if (parts.length >= 3) {
          const [startLine, endLine, imagePath] = parts;
          const fullImagePath = path.resolve(documentDir, imagePath);
          
          if (fs.existsSync(fullImagePath)) {
            scriptEntries.push({
              startLine: parseInt(startLine, 10),
              endLine: parseInt(endLine, 10),
              imagePath: fullImagePath
            });
          }
        }
      });
      
      return {
        scriptPath: imageScriptPath,
        entries: scriptEntries
      };
    }
  } catch (error) {
    console.error('Error parsing image script:', error);
  }
  
  return null;
});

// Handle reader position updates and forward to widgets
ipcMain.on('update-widgets-position', (event, data) => {
  const { lineNumber, documentPath, widgetIds } = data;
  
  // Send position update to each specified widget
  widgetIds.forEach(widget => {
    const widgetWindow = widgetWindows.get(widget.id);
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('reader-position-update', {
        lineNumber,
        documentPath
      });
    }
  });
});

// Create new widget window
ipcMain.handle('create-widget', async (event, options) => {
  const widgetWindow = createWidgetWindow(options);
  return widgetWindow.id;
});

// Save layout
ipcMain.handle('save-layout', (event, layout) => {
  store.set('layout', layout);
  return true;
});

// Load layout
ipcMain.handle('load-layout', () => {
  return store.get('layout');
});

// Read document file content based on file type
async function readDocumentFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  try {
    // Handle different file types
    switch (ext) {
      case '.txt':
        // Simple text file reading
        return fs.readFileSync(filePath, 'utf8');
        
      case '.docx':
        // DOCX parsing using mammoth
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
        
      case '.pdf':
        // Very basic PDF text extraction
        // Note: For a production app, you'd use a more robust PDF parsing library
        const pdfBytes = fs.readFileSync(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pageCount = pdfDoc.getPageCount();
        let content = `PDF Document (${pageCount} pages)\n\n`;
        
        // This is a placeholder - for a real implementation, 
        // you'd use pdf.js or another library to extract text properly
        content += "PDF content would be extracted here using a proper PDF parsing library.";
        return content;
      
      case '.pptx':
        // Placeholder for PPTX support
        // In a real implementation, you'd use a library like officegen to parse PPTX files
        return `PPTX file detected: ${path.basename(filePath)}\n\nPPTX parsing would be implemented here.`;
        
      default:
        return `Unsupported file format: ${ext}`;
    }
  } catch (error) {
    console.error('Error reading document:', error);
    return `Error reading document: ${error.message}`;
  }
}

// Application initialization
app.whenReady().then(() => {
  createMainWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});