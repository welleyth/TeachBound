// src/Toolbar.js
import React, { useState, useRef, useEffect } from 'react';
import './Toolbar.css';
import {
  PenTool, Eraser, StickyNote as StickyNoteIcon,
  Undo, Redo, Trash2, Download, Square, Circle, Triangle,
  Minus, ArrowRight, Type, MousePointer, Trash, ChevronDown, Shapes, Settings,
  Highlighter, Copy, Clipboard, Save, Image
} from 'lucide-react';

const ACCESSIBLE_COLORS = [
  { name: 'Black', value: '#000000' }, 
  { name: 'Red', value: '#D90429' },
  { name: 'Blue', value: '#0077B6' }, 
  { name: 'Green', value: '#06A77D' },
  { name: 'Purple', value: '#7209B7' },
];

const STICKY_NOTE_COLORS = [
  { name: 'Yellow', value: '#FFFACD' }, 
  { name: 'Pink', value: '#FFB6C1' },
  { name: 'Light Blue', value: '#ADD8E6' }, 
  { name: 'Light Green', value: '#90EE90' },
  { name: 'Orange', value: '#FFE4B5' }, 
  { name: 'Lavender', value: '#E6E6FA' },
];

const FILL_COLORS = [
  { name: 'Transparent', value: 'transparent' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Light Gray', value: '#F0F0F0' },
  { name: 'Light Blue', value: '#E3F2FD' },
  { name: 'Light Green', value: '#E8F5E9' },
  { name: 'Light Yellow', value: '#FFFDE7' },
];

const LINE_WIDTHS = [
  { label: 'Thin', value: 2 }, 
  { label: 'Medium', value: 5 },
  { label: 'Thick', value: 10 }, 
  { label: 'Extra Thick', value: 20 },
];

const FONT_SIZES = [
  { label: 'Small', value: 12 },
  { label: 'Medium', value: 16 },
  { label: 'Large', value: 24 },
  { label: 'Extra Large', value: 32 },
];

const Toolbar = ({
  selectedTool, setSelectedTool,
  strokeColor, setStrokeColor,
  fillColor, setFillColor,
  lineWidth, setLineWidth,
  fontSize, setFontSize,
  stickyNoteColor, setStickyNoteColor,
  toolbarDisplayMode, setToolbarDisplayMode,
  onUndo, onRedo, onClearFrame, canUndo, canRedo, onDownloadPNG, onDownloadPDF, onDeleteSelected,
  onCopy, onPaste, onDuplicate, onSave, onClearSaved, hasClipboard,
  onImageUpload
}) => {
  const [showShapesDropdown, setShowShapesDropdown] = useState(false);
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [tempDisplayMode, setTempDisplayMode] = useState(toolbarDisplayMode);
  const [dropdownPositions, setDropdownPositions] = useState({});
  
  const shapesDropdownRef = useRef(null);
  const downloadDropdownRef = useRef(null);
  const settingsPanelRef = useRef(null);
  const shapesButtonRef = useRef(null);
  const downloadButtonRef = useRef(null);
  const settingsButtonRef = useRef(null);
  const imageInputRef = useRef(null);

  // Calculate dropdown position
  const calculateDropdownPosition = (buttonRef, dropdownWidth = 180) => {
    if (!buttonRef.current) return {};
    
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Position above the button by default
    let top = buttonRect.top - 10; // 10px margin above button
    let left = buttonRect.left;
    
    // Adjust if dropdown would go off screen
    if (left + dropdownWidth > viewportWidth) {
      left = viewportWidth - dropdownWidth - 10;
    }
    
    if (top < 10) {
      top = buttonRect.bottom + 10; // Position below if no room above
    }
    
    return { top, left };
  };
  
  const shapeTools = [
    { name: 'rectangle', icon: <Square size={14} className="tool-icon" />, label: 'Rectangle' },
    { name: 'circle', icon: <Circle size={14} className="tool-icon" />, label: 'Circle' },
    { name: 'triangle', icon: <Triangle size={14} className="tool-icon" />, label: 'Triangle' },
    { name: 'line', icon: <Minus size={14} className="tool-icon" />, label: 'Line' },
    { name: 'arrow', icon: <ArrowRight size={14} className="tool-icon" />, label: 'Arrow' },
  ];

  const mainTools = [
    { name: 'select', icon: <MousePointer size={14} className="tool-icon" />, label: 'Select', shortcut: 'V' },
    { name: 'pen', icon: <PenTool size={14} className="tool-icon" />, label: 'Pen', shortcut: 'P' },
    { name: 'highlighter', icon: <Highlighter size={14} className="tool-icon" />, label: 'Highlighter', shortcut: 'H' },
    { name: 'eraser', icon: <Eraser size={14} className="tool-icon" />, label: 'Eraser', shortcut: 'E' },
    { name: 'sticky', icon: <StickyNoteIcon size={14} className="tool-icon" />, label: 'Sticky Note', shortcut: 'N' },
    { name: 'text', icon: <Type size={14} className="tool-icon" />, label: 'Text', shortcut: 'T' },
    { name: 'image', icon: <Image size={14} className="tool-icon" />, label: 'Image', shortcut: 'I' },
  ];

  const actionTools = [
    { name: 'undo', icon: <Undo size={14} />, label: 'Undo', action: onUndo, disabled: !canUndo, shortcut: '⌘Z' },
    { name: 'redo', icon: <Redo size={14} />, label: 'Redo', action: onRedo, disabled: !canRedo, shortcut: '⌘⇧Z' },
    { name: 'copy', icon: <Copy size={14} />, label: 'Copy', action: onCopy, shortcut: '⌘C' },
    { name: 'paste', icon: <Clipboard size={14} />, label: 'Paste', action: onPaste, disabled: !hasClipboard, shortcut: '⌘V' },
    { name: 'delete', icon: <Trash size={14} />, label: 'Delete', action: onDeleteSelected, shortcut: 'Del' },
    { name: 'clear', icon: <Trash2 size={14} />, label: 'Clear', action: onClearFrame },
    { name: 'save', icon: <Save size={14} />, label: 'Save', action: onSave, shortcut: '⌘S' },
  ];

  // Get current shape icon for shapes button
  const getCurrentShapeIcon = () => {
    const currentShape = shapeTools.find(shape => shape.name === selectedTool);
    return currentShape ? currentShape.icon : <Shapes size={14} className="tool-icon" />;
  };

  // Show tool-specific options
  const showShapeOptions = ['rectangle', 'circle', 'triangle', 'line', 'arrow'].includes(selectedTool);
  const showTextOptions = selectedTool === 'text';
  const showStickyOptions = selectedTool === 'sticky';

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is on the button itself
      const isShapesButton = shapesButtonRef.current?.contains(event.target);
      const isDownloadButton = downloadButtonRef.current?.contains(event.target);
      const isSettingsButton = settingsButtonRef.current?.contains(event.target);
      
      // Only close if clicking outside both button and dropdown
      if (!isShapesButton && shapesDropdownRef.current && !shapesDropdownRef.current.contains(event.target)) {
        setShowShapesDropdown(false);
      }
      if (!isDownloadButton && downloadDropdownRef.current && !downloadDropdownRef.current.contains(event.target)) {
        setShowDownloadDropdown(false);
      }
      if (!isSettingsButton && settingsPanelRef.current && !settingsPanelRef.current.contains(event.target)) {
        setShowSettingsPanel(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleShapeSelect = (shapeName) => {
    setSelectedTool(shapeName);
    setShowShapesDropdown(false);
  };

  const handleShapesDropdownToggle = (e) => {
    e.stopPropagation();
    if (!showShapesDropdown) {
      const position = calculateDropdownPosition(shapesButtonRef, 140);
      setDropdownPositions(prev => ({ ...prev, shapes: position }));
    }
    setShowShapesDropdown(!showShapesDropdown);
    // Close other dropdowns
    setShowDownloadDropdown(false);
    setShowSettingsPanel(false);
  };

  const handleDownloadDropdownToggle = (e) => {
    e.stopPropagation();
    if (!showDownloadDropdown) {
      const position = calculateDropdownPosition(downloadButtonRef, 200);
      setDropdownPositions(prev => ({ ...prev, download: position }));
    }
    setShowDownloadDropdown(!showDownloadDropdown);
    // Close other dropdowns
    setShowShapesDropdown(false);
    setShowSettingsPanel(false);
  };

  const handleSettingsPanelToggle = (e) => {
    e.stopPropagation();
    if (!showSettingsPanel) {
      const position = calculateDropdownPosition(settingsButtonRef, 280);
      setDropdownPositions(prev => ({ ...prev, settings: position }));
    }
    setShowSettingsPanel(!showSettingsPanel);
    // Close other dropdowns
    setShowShapesDropdown(false);
    setShowDownloadDropdown(false);
  };

  const handleDownloadSelect = (type, scale = 1) => {
    if (type === 'png') {
      onDownloadPNG(scale);
    } else if (type === 'pdf') {
      onDownloadPDF();
    }
    setShowDownloadDropdown(false);
  };

  const handleSettingsOk = () => {
    setToolbarDisplayMode(tempDisplayMode);
    setShowSettingsPanel(false);
  };

  const handleSettingsCancel = () => {
    setTempDisplayMode(toolbarDisplayMode);
    setShowSettingsPanel(false);
  };

  // Handle image file selection - supports all common formats
  const handleImageFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's an image file (by type or extension)
    const isImage = file.type.startsWith('image/') ||
      /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff?|heic|heif|avif)$/i.test(file.name);

    if (isImage) {
      // For HEIC/HEIF files, try to convert using canvas if browser doesn't support
      const isHeic = /\.(heic|heif)$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';

      if (isHeic) {
        // Try to load HEIC - modern Safari and some browsers support it
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new window.Image();
          img.onload = () => {
            // Convert to PNG using canvas for better compatibility
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const pngDataUrl = canvas.toDataURL('image/png');
            onImageUpload?.(pngDataUrl);
          };
          img.onerror = () => {
            alert('HEIC/HEIF format is not supported by your browser. Please convert the image to PNG or JPEG first using an online converter or your photo app.');
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      } else {
        // Standard image formats
        const reader = new FileReader();
        reader.onload = (e) => {
          onImageUpload?.(e.target.result);
        };
        reader.onerror = () => {
          alert('Failed to read the image file. Please try again.');
        };
        reader.readAsDataURL(file);
      }
    } else {
      alert('Please select a valid image file (PNG, JPEG, GIF, WebP, SVG, etc.)');
    }

    // Reset input so same file can be selected again
    event.target.value = '';
  };

  // Handle tool click - special handling for image tool
  const handleToolClick = (toolName) => {
    if (toolName === 'image') {
      imageInputRef.current?.click();
    } else {
      setSelectedTool(toolName);
    }
  };

  // Render button content based on display mode
  const renderButtonContent = (tool) => {
    switch (toolbarDisplayMode) {
      case 'icons':
        return tool.icon;
      case 'icons-text':
        return (
          <>
            {tool.icon}
            <span className="tool-label">{tool.label}</span>
          </>
        );
      case 'text':
        return <span className="tool-label">{tool.label}</span>;
      default:
        return tool.icon;
    }
  };

  // Create portal for dropdowns
  const DropdownPortal = ({ children, show }) => {
    if (!show) return null;
    return children;
  };

  return (
    <div className="toolbar-wrapper">
      {/* Main Tools Bar */}
      <div className="toolbar-section main-toolbar">
        {/* Hidden image input - supports all common image formats */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*,.heic,.heif,.webp,.avif,.svg,.bmp,.tiff,.tif,.ico"
          onChange={handleImageFileChange}
          style={{ display: 'none' }}
        />

        {/* Main Tools Group */}
        <div className="tool-group main-tools">
          {mainTools.map((tool) => (
            <button
              key={tool.name}
              className={`tool-button ${selectedTool === tool.name ? 'active' : ''} ${toolbarDisplayMode}`}
              onClick={() => handleToolClick(tool.name)}
              title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
            >
              {renderButtonContent(tool)}
            </button>
          ))}

          {/* Shapes Dropdown */}
          <div className="dropdown-container">
            <button
              ref={shapesButtonRef}
              className={`tool-button dropdown-trigger ${showShapeOptions ? 'active' : ''} ${toolbarDisplayMode}`}
              onClick={handleShapesDropdownToggle}
              title="Shapes"
            >
              {toolbarDisplayMode === 'icons' ? (
                <>
                  {getCurrentShapeIcon()} <ChevronDown size={12} />
                </>
              ) : toolbarDisplayMode === 'icons-text' ? (
                <>
                  {getCurrentShapeIcon()} <span className="tool-label">Shapes</span> <ChevronDown size={12} />
                </>
              ) : (
                <>
                  <span className="tool-label">Shapes</span> <ChevronDown size={12} />
                </>
              )}
            </button>
            <DropdownPortal show={showShapesDropdown}>
              <div 
                ref={shapesDropdownRef}
                className="dropdown-menu shapes-dropdown" 
                style={{
                  top: `${dropdownPositions.shapes?.top || 0}px`,
                  left: `${dropdownPositions.shapes?.left || 0}px`,
                }}
              >
                {shapeTools.map((tool) => (
                  <button
                    key={tool.name}
                    className={`dropdown-item ${selectedTool === tool.name ? 'active' : ''}`}
                    onClick={() => handleShapeSelect(tool.name)}
                  >
                    {tool.icon} {tool.label}
                  </button>
                ))}
              </div>
            </DropdownPortal>
          </div>
        </div>

        <div className="separator"></div>

        {/* Stroke Colors */}
        <div className="tool-group stroke-group">
          <span className="options-label">Stroke:</span>
          <div className="color-palette">
            {ACCESSIBLE_COLORS.map((color) => (
              <button
                key={color.value}
                className={`color-button ${strokeColor === color.value ? 'active' : ''}`}
                style={{ backgroundColor: color.value }}
                onClick={() => setStrokeColor(color.value)}
                title={color.name}
                aria-label={`Select stroke color ${color.name}`}
              />
            ))}
          </div>
        </div>

        <div className="separator"></div>

        {/* Line Width */}
        <div className="tool-group line-width-group">
          <span className="options-label">Line Width:</span>
          <div className="line-width-selection">
            {LINE_WIDTHS.map((widthOption) => (
              <button
                key={widthOption.value}
                className={`tool-button line-width-button ${lineWidth === widthOption.value ? 'active' : ''}`}
                onClick={() => setLineWidth(widthOption.value)}
                title={widthOption.label}
              >
                <span 
                  className="line-preview"
                  style={{ 
                    display: 'inline-block', 
                    width: '16px', 
                    height: `${Math.min(widthOption.value, 12)}px`, 
                    backgroundColor: strokeColor === '#ffffff' ? '#cccccc' : strokeColor, 
                    borderRadius: '2px' 
                  }}
                ></span>
              </button>
            ))}
          </div>
        </div>

        <div className="separator"></div>

        {/* Action Tools */}
        <div className="tool-group action-tools">
          {actionTools.map((tool) => (
            <button
              key={tool.name}
              className={`tool-button action-button ${toolbarDisplayMode}`}
              onClick={tool.action}
              disabled={tool.disabled}
              title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
            >
              {renderButtonContent(tool)}
            </button>
          ))}
        </div>

        {/* Download and Settings - Right Aligned */}
        <div className="tool-group download-settings-group">
          {/* Download Button */}
          <div className="dropdown-container">
            <button
              ref={downloadButtonRef}
              className={`tool-button download-button ${toolbarDisplayMode}`}
              onClick={handleDownloadDropdownToggle}
              title="Download"
            >
              {toolbarDisplayMode === 'icons' ? (
                <>
                  <Download size={14} /> <ChevronDown size={12} />
                </>
              ) : toolbarDisplayMode === 'icons-text' ? (
                <>
                  <Download size={14} /> <span className="tool-label">Download</span> <ChevronDown size={12} />
                </>
              ) : (
                <>
                  <span className="tool-label">Download</span> <ChevronDown size={12} />
                </>
              )}
            </button>
            <DropdownPortal show={showDownloadDropdown}>
              <div 
                ref={downloadDropdownRef}
                className="dropdown-menu download-dropdown"
                style={{
                  top: `${dropdownPositions.download?.top || 0}px`,
                  left: `${dropdownPositions.download?.left || 0}px`,
                }}
              >
                <div className="dropdown-section">
                  <div className="dropdown-section-title">High Quality PNG</div>
                  <button className="dropdown-item" onClick={() => handleDownloadSelect('png', 1)}>
                    <Download size={14} /> PNG - Standard (1x)
                  </button>
                  <button className="dropdown-item" onClick={() => handleDownloadSelect('png', 2)}>
                    <Download size={14} /> PNG - High Quality (2x)
                  </button>
                  <button className="dropdown-item" onClick={() => handleDownloadSelect('png', 3)}>
                    <Download size={14} /> PNG - Ultra Quality (3x)
                  </button>
                </div>
                <div className="dropdown-section">
                  <div className="dropdown-section-title">PDF Document</div>
                  <button className="dropdown-item" onClick={() => handleDownloadSelect('pdf')}>
                    <Download size={14} /> Download as PDF
                  </button>
                </div>
              </div>
            </DropdownPortal>
          </div>

          {/* Settings Button */}
          <div className="dropdown-container">
            <button
              ref={settingsButtonRef}
              className={`tool-button settings-button ${toolbarDisplayMode}`}
              onClick={handleSettingsPanelToggle}
              title="Settings"
            >
              <Settings size={14} />
            </button>
            
            <DropdownPortal show={showSettingsPanel}>
              <div 
                ref={settingsPanelRef}
                className="settings-panel"
                style={{
                  top: `${dropdownPositions.settings?.top || 0}px`,
                  left: `${dropdownPositions.settings?.left || 0}px`,
                }}
              >
                <div className="settings-header">
                  <h3>Toolbar Display Settings</h3>
                </div>
                <div className="settings-content">
                  <div className="setting-group">
                    <label className="setting-label">Display Mode:</label>
                    <div className="radio-group">
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="displayMode"
                          value="icons"
                          checked={tempDisplayMode === 'icons'}
                          onChange={(e) => setTempDisplayMode(e.target.value)}
                        />
                        <span>Icons Only (Compact)</span>
                      </label>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="displayMode"
                          value="icons-text"
                          checked={tempDisplayMode === 'icons-text'}
                          onChange={(e) => setTempDisplayMode(e.target.value)}
                        />
                        <span>Icons with Text</span>
                      </label>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="displayMode"
                          value="text"
                          checked={tempDisplayMode === 'text'}
                          onChange={(e) => setTempDisplayMode(e.target.value)}
                        />
                        <span>Text Only</span>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="settings-footer">
                  <button className="settings-btn cancel-btn" onClick={handleSettingsCancel}>
                    Cancel
                  </button>
                  <button className="settings-btn ok-btn" onClick={handleSettingsOk}>
                    OK
                  </button>
                </div>
              </div>
            </DropdownPortal>
          </div>
        </div>
      </div>

      {/* Tool-Specific Options Row */}
      {(showStickyOptions || showShapeOptions || showTextOptions) && (
        <div className="toolbar-section options-section">
          {showStickyOptions && (
            <div className="tool-group tool-options-group">
              <span className="options-label">Note Color:</span>
              <div className="color-palette">
                {STICKY_NOTE_COLORS.map((color) => (
                  <button
                    key={color.value}
                    className={`color-button ${stickyNoteColor === color.value ? 'active' : ''}`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setStickyNoteColor(color.value)}
                    title={color.name}
                    aria-label={`Select sticky note color ${color.name}`}
                  />
                ))}
              </div>
            </div>
          )}

          {showShapeOptions && (
            <div className="tool-group tool-options-group">
              <span className="options-label">Fill:</span>
              <div className="color-palette">
                {FILL_COLORS.map((color) => (
                  <button
                    key={color.value}
                    className={`color-button fill-button ${fillColor === color.value ? 'active' : ''}`}
                    style={{ 
                      backgroundColor: color.value === 'transparent' ? '#ffffff' : color.value,
                      backgroundImage: color.value === 'transparent' 
                        ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)'
                        : 'none',
                      backgroundSize: '6px 6px',
                      backgroundPosition: '0 0, 3px 3px'
                    }}
                    onClick={() => setFillColor(color.value)}
                    title={color.name}
                    aria-label={`Select fill color ${color.name}`}
                  />
                ))}
              </div>
            </div>
          )}

          {showTextOptions && (
            <div className="tool-group tool-options-group">
              <span className="options-label">Font Size:</span>
              <div className="font-size-selection">
                {FONT_SIZES.map((sizeOption) => (
                  <button
                    key={sizeOption.value}
                    className={`tool-button font-size-button ${fontSize === sizeOption.value ? 'active' : ''}`}
                    onClick={() => setFontSize(sizeOption.value)}
                    title={sizeOption.label}
                  >
                    {sizeOption.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Toolbar;