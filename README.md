# PictureStory Reader

An immersive reading application for enjoying fiction stories with images and videos across multiple monitors.

## Features

- **Document Support**: Read stories from TXT, DOCX, PDF, and PPTX files
- **Auto-Scrolling**: Adjustable speed, smooth scrolling for an immersive reading experience
- **Multiple Reading Modes**: Vertical scrolling, horizontal scrolling, and book mode
- **Image Widgets**: Display images alongside your story with multiple loading modes:
  - Single image display
  - Random images from a folder with configurable timing
  - Sequential image list display with configurable timing
  - Script-based image display that changes based on reading position
- **Video Widgets**: Play videos alongside your story:
  - Single video loop mode
  - Playlist mode with multiple videos
- **Multi-Monitor Support**: Arrange widgets across multiple monitors
- **Image Manipulation**: Zoom and pan capabilities for images
- **Layout Management**: Save and load custom layouts including document, widgets, and their positions
- **Font Controls**: Change font size and family for comfortable reading

## Installation

1. Make sure you have [Node.js](https://nodejs.org/) installed on your system
2. Clone this repository or download the source code
3. Open a terminal in the project folder and run:

```bash
npm install
```

## Usage

To start the application:

```bash
npm start
```

### Basic Workflow

1. Click "Open Document" to load your story file
2. Add image or video widgets as needed
3. Configure each widget by selecting its mode and loading media
4. Adjust the reading mode and font settings to your preference
5. Use the scroll speed slider and start/pause button to control auto-scrolling
6. Save your layout when you're happy with it
7. Load your saved layout the next time you run the application

### Image Widget Modes

- **Single Image**: Display a single static image
- **Random from Folder**: Randomly selects images from a folder, changing at the specified interval
- **Image List**: Shows a sequence of selected images, changing at the specified interval
- **Script-based**: Displays images based on your current reading position using an image script file

### Creating an Image Script

For script-based image display, create a text file named `<document-name>.imagescript` in an `imagescripts` folder in the same directory as your document. Each line should have the format:

```
<start-line>,<end-line>,<image-path>
```

Example:

```
0,10,images/scene1.jpg
11,20,images/scene2.jpg
21,30,images/scene3.jpg
```

This will display scene1.jpg when reading lines 0-10, scene2.jpg for lines 11-20, etc.

## Customization

You can modify the application's appearance by editing the CSS files in the `src/styles` directory.

## Development

For development with DevTools enabled:

```bash
npm run dev
```

## License

This project is licensed under the ISC License.
