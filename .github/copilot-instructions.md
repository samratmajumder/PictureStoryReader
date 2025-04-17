<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# PictureStory Reader

This is an Electron-based desktop application for reading fiction stories with image and video support.

## Project Structure

- `src/main/` - Contains Electron main process code
- `src/renderer/` - Contains HTML/JS for renderer processes
- `src/styles/` - CSS styles for the application
- `src/assets/` - Static assets like icons and default images

## Development Guidelines

- The application uses a multi-window architecture with IPC communication
- Widget windows are frameless and support dragging, resizing, and custom controls
- Document parsers should handle different file formats (txt, docx, pdf, pptx)
- All UI elements should support an immersive reading experience to minimize distractions
