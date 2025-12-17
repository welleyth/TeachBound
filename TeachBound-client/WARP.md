# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Teach Bound is a React-based digital whiteboard application designed for education and collaboration. It provides drawing tools, sticky notes, shapes, text, and export capabilities in a browser-based canvas interface.

## Development Commands

### Setup and Run
```bash
# Install dependencies
npm install

# Start development server (runs on http://localhost:3000)
npm start

# Build for production
npm build

# Run tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run a specific test file
npm test -- src/App.test.js
```

## Architecture

### Component Hierarchy
The application follows a top-down data flow pattern with centralized state management in App.js:

1. **App.js** - Root component managing global state including:
   - Tool selection and configuration (pen, eraser, shapes, etc.)
   - History management for undo/redo functionality
   - Element lifecycle (creation, editing, deletion)
   - Coordinates sticky note and text editing states

2. **Canvas.js** - Core drawing surface implementing:
   - High-resolution canvas setup with device pixel ratio handling
   - Drawing logic for pen strokes, shapes, and elements
   - Selection and manipulation of elements
   - Export functionality (PNG with 1x/2x/3x scaling, PDF generation)
   - Real-time dragging and positioning updates

3. **Toolbar.js** - Tool selection and configuration panel providing:
   - Main tools (select, pen, eraser, sticky notes, text)
   - Shape tools dropdown (rectangle, circle, triangle, line, arrow)
   - Color pickers for stroke and fill
   - Line width and font size selectors
   - Action buttons (undo, redo, delete, clear)
   - Export options dropdown

### State Management Pattern
The application uses a custom history-based state management for undo/redo:
- Elements are stored in a history array at `history[historyStep]`
- Each user action creates a new history entry
- Navigation through history is done via `historyStep` index
- The `updateElementsAndHistory` function ensures immutable updates

### Canvas Rendering Strategy
- Uses 2D canvas context with high DPI support
- Elements are redrawn on each update rather than using retained mode
- Implements double buffering for smooth interactions
- Separate rendering contexts for screen display vs. export

## Key Implementation Details

### High-Resolution Canvas
The canvas implements device pixel ratio scaling to ensure crisp rendering on high-DPI displays. The `setupHighResCanvas` function in Canvas.js handles this by:
- Scaling the canvas buffer by devicePixelRatio
- Maintaining CSS size for proper display
- Applying the scale transform to the drawing context

### Element Types
Each drawable element has a consistent structure:
- `id`: Unique identifier (timestamp-based)
- `type`: pen, sticky, text, rectangle, circle, triangle, line, arrow
- `x`, `y`: Position coordinates
- Additional type-specific properties (paths, text content, dimensions, colors)

### Export Functionality
- **PNG Export**: Creates offscreen canvas at specified scale (1x, 2x, 3x)
- **PDF Export**: Generates print-friendly HTML with embedded image data

### Sticky Note and Text Editing
Uses a floating textarea positioned absolutely over the canvas element during editing. The editing flow:
1. Element creation triggers edit mode
2. Textarea positioned at element coordinates
3. Blur or Enter key commits the text
4. Escape key cancels editing

## Testing Approach

The project uses React Testing Library with Jest. When writing tests:
- Focus on user interactions rather than implementation details
- Test the complete user flow (tool selection → drawing → export)
- Mock canvas context methods as needed
- Verify state changes through rendered output

## Deployment

The application is deployed on Vercel and configured as a single-page React app. The production build optimizes bundle size and enables service worker for offline capability.

## Important Conventions

### Color Accessibility
The application uses a curated set of accessible colors defined in Toolbar.js:
- High contrast colors for drawing tools
- Distinct sticky note colors for visual organization
- Transparent fill option for shapes

### Responsive Design
- Toolbar adapts display mode (icons only, text only, or both)
- Canvas fills available space while maintaining aspect ratio
- Mobile touch events are supported alongside mouse events

### Performance Considerations
- Debounced canvas redrawing during drag operations
- Efficient element selection using bounding box calculations
- Lazy loading of export functionality

## Current Features (Phase 1 - Implemented)

### Auto-Save & Recovery
- Work automatically saves to localStorage every 5 seconds and on changes
- Recovers canvas state on page reload
- Manual save with Cmd/Ctrl+S
- Save indicator shows confirmation

### Copy/Paste/Duplicate
- Copy selected elements (Cmd/Ctrl+C)
- Paste elements (Cmd/Ctrl+V) with 20px offset
- Duplicate selected elements (Cmd/Ctrl+D)
- Clipboard state persists during session

### Keyboard Shortcuts
**Tool Selection:**
- `V` - Selection tool
- `P` - Pen tool
- `H` - Highlighter tool
- `E` - Eraser tool
- `N` - Sticky note
- `T` - Text tool
- `R` - Rectangle
- `C` - Circle
- `L` - Line
- `A` - Arrow

**Actions:**
- `Cmd/Ctrl+Z` - Undo
- `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y` - Redo
- `Cmd/Ctrl+A` - Select all
- `Delete/Backspace` - Delete selected
- `Escape` - Clear selection

### Highlighter Tool
- Semi-transparent drawing (30% opacity)
- 3x line width for highlighting effect
- Uses multiply blend mode for realistic highlighting
- Preserves color selection

## Common Development Tasks

### Adding a New Drawing Tool
1. Add tool definition in Toolbar.js `mainTools` or `shapeTools` array with shortcut
2. Implement drawing logic in Canvas.js `handleMouseDown/Move/Up`
3. Add tool-specific options in Toolbar if needed
4. Update element rendering in `redrawAllElements`
5. Add keyboard shortcut in App.js `handleKeyDown`

### Modifying Export Formats
Export logic is contained in Canvas.js `downloadAsPNG` and `downloadAsPDF` methods. These create offscreen canvases and redraw all elements at the target resolution.

### Updating Styling
- Global styles in index.css
- Component-specific styles in [Component].css files
- Uses CSS variables for theme consistency
- Open Sans font family throughout

## Future Features Roadmap

### Phase 2 - Enhanced Creation (Planned)

#### 🖼️ Image Support
**Implementation approach:**
- Add image upload button to toolbar
- Store images as base64 in element data
- Create new element type 'image' with x, y, width, height properties
- Handle image resize with corner handles
- Add rotation property and transform controls

#### 📏 Grid and Alignment Tools
**Implementation approach:**
- Add grid toggle button in toolbar settings
- Store grid settings in state (show, spacing, snap)
- Render grid lines in Canvas before elements
- Implement snap-to-grid logic in mouse move handlers
- Add alignment buttons (align left/center/right, top/middle/bottom)
- Calculate bounding box for selected elements and adjust positions

#### 🔍 Zoom & Pan
**Implementation approach:**
- Add zoom state (scale factor) and pan offset (x, y) to Canvas
- Implement mouse wheel handler for zoom (Ctrl+scroll)
- Add zoom controls (+/-, fit, 100%) to toolbar
- Transform mouse coordinates based on zoom/pan
- Apply transform matrix to canvas context
- Space+drag for panning or dedicated pan tool

#### 📐 Measurement Tools
**Implementation approach:**
- Add ruler tool to shape tools
- Display dimensions while drawing shapes (temporary overlay)
- Show pixel measurements in real-time
- Add measurement units toggle (pixels, inches, cm)

#### 🎯 Smart Selection
**Implementation approach:**
- Implement lasso selection tool (freehand selection path)
- Add "Select Similar" feature (by type, color, size)
- Group/ungroup functionality with element groups array
- Store group IDs in elements
- Move grouped elements together

#### 💾 Multiple Save Formats
**Implementation approach:**
- JSON export: serialize all elements with properties
- SVG export: convert canvas elements to SVG elements
- Share via URL: compress JSON and encode in URL hash
- Cloud save: integrate with Firebase or similar service

### Phase 3 - Advanced Features (Future)

#### 🎨 Advanced Styling
**Implementation approach:**
- Add gradient picker UI component
- Store gradient data in fillColor as object
- Implement gradient rendering in drawShape
- Add opacity slider (0-100%) for all elements
- Shadow properties (offsetX, offsetY, blur, color)
- Line style selector (solid, dashed, dotted) with pattern arrays

#### 📝 Rich Text Formatting
**Implementation approach:**
- Replace simple text with contenteditable div for editing
- Store formatted text as HTML or Delta format
- Add text toolbar (bold, italic, underline, color)
- Font family dropdown
- Text alignment options
- Bullet/numbering with indent levels

#### 🔄 Transform Tools
**Implementation approach:**
- Add rotation handle to selection box
- Calculate rotation angle from mouse position
- Store rotation property in elements
- Apply rotation transform when rendering
- Flip buttons in toolbar (flip-x, flip-y)
- Transform selected elements' coordinates

#### 📚 Templates & Backgrounds
**Implementation approach:**
- Add background layer separate from main canvas
- Template selector dropdown
- Predefined templates (grid, ruled, graph, music staff)
- Background color/image picker
- Store background settings in app state
- Layer management (background, main, overlay)

#### 👥 Collaboration Features
**Implementation approach:**
- WebRTC for peer-to-peer connection
- Operational Transformation (OT) for conflict resolution
- Cursor position sharing
- User presence indicators
- Chat/comments sidebar
- Version history with snapshots
- Diff visualization for changes

## Technical Debt & Improvements

### Performance Optimizations
- Implement virtual scrolling for large canvases
- Use OffscreenCanvas for better performance
- Debounce rapid state updates
- Optimize redraw with dirty rectangles
- Implement element culling (don't draw off-screen elements)

### Code Quality
- Add TypeScript for better type safety
- Implement proper error boundaries
- Add comprehensive test coverage
- Extract constants to configuration file
- Create custom hooks for complex logic

### Accessibility
- Add ARIA labels to all tools
- Keyboard navigation for all features
- Screen reader support
- High contrast mode
- Configurable shortcuts

## Testing Strategy

### Unit Tests
- Test element creation functions
- Test selection logic
- Test transformation calculations
- Test save/load functionality

### Integration Tests
- Test tool interactions
- Test keyboard shortcuts
- Test copy/paste flow
- Test export functionality

### E2E Tests
- Complete drawing workflow
- Multi-element selection and manipulation
- Save and restore session
- Export in different formats
