// src/App.js
import React, { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';
import Toolbar from './Toolbar';
import Canvas from './Canvas';
import { startP2P } from './p2p/startP2P'
// --- App Name & Slogan ---
const APP_NAME = "Teach Bound";
const APP_SUBTITLE = "Digital White Board";

function App() {
  useEffect(() => {
    const host = process.env.REACT_APP_P2P_HOST
    if (!host) {
      console.warn('No REACT_APP_P2P_HOST set')
      return
    }
    startP2P(host).catch(console.error)
  }, [])
  
  const [selectedTool, setSelectedTool] = useState('pen');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [fillColor, setFillColor] = useState('transparent');
  const [lineWidth, setLineWidth] = useState(5);
  const [fontSize, setFontSize] = useState(16);
  const [stickyNoteColor, setStickyNoteColor] = useState('#FFFACD'); // Default yellow
  const [toolbarDisplayMode, setToolbarDisplayMode] = useState('icons-text'); // Changed from 'icons' to 'icons-text'

  // Initialize history from localStorage if available
  const loadFromLocalStorage = () => {
    try {
      const saved = localStorage.getItem('teachbound-canvas-data');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.history && Array.isArray(data.history)) {
          return {
            history: data.history,
            historyStep: data.historyStep || 0
          };
        }
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error);
    }
    return { history: [[]], historyStep: 0 };
  };

  const initialState = loadFromLocalStorage();
  const [history, setHistory] = useState(initialState.history);
  const [historyStep, setHistoryStep] = useState(initialState.historyStep);
  const [lastSaveTime, setLastSaveTime] = useState(Date.now());
  const [showSaveIndicator, setShowSaveIndicator] = useState(false);
  const elements = history[historyStep] || [];

  const canvasRef = useRef(null);

  const [editingElement, setEditingElement] = useState(null);
  const [textAreaPosition, setTextAreaPosition] = useState({ x: 0, y: 0 });
  const textAreaRef = useRef(null);
  
  // Clipboard state for copy/paste
  const [clipboard, setClipboard] = useState([]);

  // Image drag state
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const updateElementsAndHistory = useCallback((newElementsOrUpdater) => {
    setHistory((prevHistory) => {
      const currentElementsState = prevHistory[historyStep] || [];
      const updatedElements = typeof newElementsOrUpdater === 'function'
        ? newElementsOrUpdater(currentElementsState)
        : newElementsOrUpdater;

      const newHistorySlice = prevHistory.slice(0, historyStep + 1);
      return [...newHistorySlice, updatedElements];
    });
    setHistoryStep((prevStep) => prevStep + 1);
  }, [historyStep]);

  const handleDrawingOrElementComplete = useCallback((newElement) => {
    updateElementsAndHistory((prevElements) => {
        if (newElement.type === 'sticky' && !newElement.text) {
            setEditingElement({ id: newElement.id, text: newElement.text || "Note..." });
        }
        if (newElement.type === 'text' && !newElement.text) {
            setEditingElement({ id: newElement.id, text: newElement.text || "", isText: true });
        }
        return [...prevElements, newElement];
    });
  }, [updateElementsAndHistory]);

  const activateStickyNoteEditing = useCallback((element) => {
    if (element && element.type === 'sticky') {
        setEditingElement({ id: element.id, text: element.text });
        const canvasGlobalRect = canvasRef.current?.getCanvasGlobalRect();
        if (canvasGlobalRect) {
            setTextAreaPosition({
                x: canvasGlobalRect.left + element.x,
                y: canvasGlobalRect.top + element.y,
            });
        }
        setTimeout(() => {
            textAreaRef.current?.focus();
            textAreaRef.current?.select();
        }, 0);
    }
  }, []);

  const activateTextEditing = useCallback((element) => {
    if (element && element.type === 'text') {
        setEditingElement({ id: element.id, text: element.text, isText: true });
        const canvasGlobalRect = canvasRef.current?.getCanvasGlobalRect();
        if (canvasGlobalRect) {
            setTextAreaPosition({
                x: canvasGlobalRect.left + element.x,
                y: canvasGlobalRect.top + element.y,
            });
        }
        setTimeout(() => {
            textAreaRef.current?.focus();
            textAreaRef.current?.select();
        }, 0);
    }
  }, []);

  const handleTextAreaBlur = useCallback(() => {
    if (editingElement) {
      updateElementsAndHistory((prevElements) =>
        prevElements.map((el) =>
          el.id === editingElement.id ? { ...el, text: editingElement.text } : el
        )
      );
      setEditingElement(null);
    }
  }, [editingElement, updateElementsAndHistory]);

  const handleTextAreaChange = (event) => {
    if (editingElement) {
      setEditingElement((prev) => ({ ...prev, text: event.target.value }));
    }
  };
  
  const handleTextAreaKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleTextAreaBlur();
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        setEditingElement(null);
    }
  };

  const handleUndo = () => historyStep > 0 && setHistoryStep(historyStep - 1);
  const handleRedo = () => historyStep < history.length - 1 && setHistoryStep(historyStep + 1);
  
  // Enhanced Clear function with sound alert
  const handleClearFrame = () => {
    // Play sound alert
    try {
      // Create a simple beep sound using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800; // Frequency in Hz
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.log('Audio not supported or blocked:', error);
    }
    
    // Show confirmation dialog
    const confirmed = window.confirm("⚠️ CLEAR CANVAS WARNING ⚠️\n\nThis will permanently delete everything on the canvas and cannot be undone.\n\nAre you sure you want to continue?");
    if (confirmed) {
      setHistory([[]]);
      setHistoryStep(0);
    }
  };
  
  const handleDownloadPNG = (scale = 1) => canvasRef.current?.downloadAsPNG(scale);
  const handleDownloadPDF = () => canvasRef.current?.downloadAsPDF();

  const handleDeleteSelected = useCallback(() => {
    canvasRef.current?.deleteSelectedElements();
  }, []);

  // Auto-save to localStorage
  const saveToLocalStorage = useCallback(() => {
    try {
      const dataToSave = {
        history: history,
        historyStep: historyStep,
        timestamp: Date.now()
      };
      localStorage.setItem('teachbound-canvas-data', JSON.stringify(dataToSave));
      setLastSaveTime(Date.now());
      setShowSaveIndicator(true);
      setTimeout(() => setShowSaveIndicator(false), 2000);
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      // If localStorage is full, try to clear old data
      if (error.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded, clearing old data');
        localStorage.removeItem('teachbound-canvas-data');
      }
    }
  }, [history, historyStep]);

  // Auto-save effect - saves every 5 seconds if there are changes
  useEffect(() => {
    const saveInterval = setInterval(() => {
      if (Date.now() - lastSaveTime > 5000 && history.length > 0) {
        saveToLocalStorage();
      }
    }, 5000);

    return () => clearInterval(saveInterval);
  }, [lastSaveTime, history, saveToLocalStorage]);

  // Save immediately when history changes (debounced)
  useEffect(() => {
    const saveTimer = setTimeout(() => {
      if (history.length > 0 && history[0].length > 0) {
        saveToLocalStorage();
      }
    }, 1000);

    return () => clearTimeout(saveTimer);
  }, [history, historyStep, saveToLocalStorage]);

  // Manual save function
  const handleManualSave = () => {
    saveToLocalStorage();
  };

  // Clear saved data
  const handleClearSaved = () => {
    if (window.confirm('This will clear your saved work from browser storage. Are you sure?')) {
      localStorage.removeItem('teachbound-canvas-data');
      setShowSaveIndicator(true);
      setTimeout(() => setShowSaveIndicator(false), 2000);
    }
  };

  // Handle image upload - creates image element that fits within canvas
  const handleImageUpload = useCallback((imageData) => {
    const img = new window.Image();

    img.onload = () => {
      // Get canvas dimensions
      const canvasRect = canvasRef.current?.getCanvasGlobalRect();
      const maxWidth = (canvasRect?.width || 800) * 0.6; // Max 60% of canvas width
      const maxHeight = (canvasRect?.height || 600) * 0.6; // Max 60% of canvas height

      // Calculate size to fit within bounds while maintaining aspect ratio
      let width = img.width || 200;
      let height = img.height || 200;

      // Handle edge case where dimensions might be 0
      if (width === 0) width = 200;
      if (height === 0) height = 200;

      const aspectRatio = width / height;

      if (width > maxWidth) {
        width = maxWidth;
        height = width / aspectRatio;
      }
      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }

      // Center the image on canvas
      const x = ((canvasRect?.width || 800) - width) / 2;
      const y = ((canvasRect?.height || 600) - height) / 2;

      const newImage = {
        type: 'image',
        id: Date.now(),
        x,
        y,
        width,
        height,
        rotation: 0,
        imageData
      };

      updateElementsAndHistory(prev => [...prev, newImage]);
      setSelectedTool('select'); // Switch to select tool after adding image
    };

    img.onerror = () => {
      console.error('Failed to load image');
      alert('Could not load this image format. Please try converting it to PNG or JPEG first.');
    };

    // Set crossOrigin for potential CORS issues
    img.crossOrigin = 'anonymous';
    img.src = imageData;
  }, [updateElementsAndHistory]);

  // Handle file drop - supports all common image formats
  const handleDrop = useCallback((event) => {
    event.preventDefault();
    setIsDraggingFile(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    // Check if it's an image file (by type or extension)
    const isImage = file.type.startsWith('image/') ||
      /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff?|heic|heif|avif)$/i.test(file.name);

    if (isImage) {
      // For HEIC/HEIF files, try to convert using canvas if browser doesn't support
      const isHeic = /\.(heic|heif)$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';

      if (isHeic) {
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
            handleImageUpload(pngDataUrl);
          };
          img.onerror = () => {
            alert('HEIC/HEIF format is not supported by your browser. Please convert the image to PNG or JPEG first.');
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          handleImageUpload(e.target.result);
        };
        reader.readAsDataURL(file);
      }
    }
  }, [handleImageUpload]);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDraggingFile(true);
  }, []);

  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    setIsDraggingFile(false);
  }, []);

  // Copy selected elements
  const handleCopy = useCallback(() => {
    const selectedElements = canvasRef.current?.getSelectedElements();
    if (selectedElements && selectedElements.length > 0) {
      setClipboard([...selectedElements]);
      // Show copy feedback
      setShowSaveIndicator(true);
      setTimeout(() => setShowSaveIndicator(false), 1000);
    }
  }, []);

  // Paste elements
  const handlePaste = useCallback(() => {
    if (clipboard.length > 0) {
      const offset = 20; // Offset pasted elements
      const pastedElements = clipboard.map(el => ({
        ...el,
        id: Date.now() + Math.random(), // New unique ID
        x: el.x + offset,
        y: el.y + offset,
        // Adjust end coordinates for shapes
        ...(el.endX !== undefined && { endX: el.endX + offset }),
        ...(el.endY !== undefined && { endY: el.endY + offset }),
        // Adjust path for strokes
        ...(el.path && { 
          path: el.path.map(point => ({ 
            x: point.x + offset, 
            y: point.y + offset 
          })) 
        })
      }));
      
      updateElementsAndHistory((prevElements) => [
        ...prevElements,
        ...pastedElements
      ]);
    }
  }, [clipboard, updateElementsAndHistory]);

  // Duplicate selected elements
  const handleDuplicate = useCallback(() => {
    handleCopy();
    setTimeout(() => handlePaste(), 100);
  }, [handleCopy, handlePaste]);

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Don't trigger shortcuts when typing in textarea
      if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

      // Tool selection shortcuts
      if (!cmdOrCtrl && !event.shiftKey && !event.altKey) {
        switch (event.key.toLowerCase()) {
          case 'v':
            setSelectedTool('select');
            event.preventDefault();
            break;
          case 'p':
            setSelectedTool('pen');
            event.preventDefault();
            break;
          case 'e':
            setSelectedTool('eraser');
            event.preventDefault();
            break;
          case 'n':
            setSelectedTool('sticky');
            event.preventDefault();
            break;
          case 't':
            setSelectedTool('text');
            event.preventDefault();
            break;
          case 'h':
            setSelectedTool('highlighter');
            event.preventDefault();
            break;
          case 'r':
            setSelectedTool('rectangle');
            event.preventDefault();
            break;
          case 'c':
            setSelectedTool('circle');
            event.preventDefault();
            break;
          case 'l':
            setSelectedTool('line');
            event.preventDefault();
            break;
          case 'a':
            setSelectedTool('arrow');
            event.preventDefault();
            break;
          case 'i':
            // Trigger image upload (same as clicking image tool)
            document.querySelector('input[type="file"][accept="image/*"]')?.click();
            event.preventDefault();
            break;
          case 'escape':
            // Deselect all
            canvasRef.current?.clearSelection();
            event.preventDefault();
            break;
          case 'delete':
          case 'backspace':
            // Delete selected elements
            handleDeleteSelected();
            event.preventDefault();
            break;
        }
      }

      // Cmd/Ctrl shortcuts
      if (cmdOrCtrl) {
        switch (event.key.toLowerCase()) {
          case 'z':
            if (event.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
            event.preventDefault();
            break;
          case 'y':
            handleRedo();
            event.preventDefault();
            break;
          case 'c':
            handleCopy();
            event.preventDefault();
            break;
          case 'v':
            handlePaste();
            event.preventDefault();
            break;
          case 'd':
            handleDuplicate();
            event.preventDefault();
            break;
          case 's':
            handleManualSave();
            event.preventDefault();
            break;
          case 'a':
            // Select all
            canvasRef.current?.selectAll();
            event.preventDefault();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTool, handleUndo, handleRedo, handleCopy, handlePaste, 
      handleDuplicate, handleDeleteSelected, handleManualSave]);

  return (
    <div className="App">
      <header className="app-header">
        <div className="app-title-container">
          <h1 className="app-title">{APP_NAME}</h1>
          <span className="app-subtitle">{APP_SUBTITLE}</span>
        </div>
        <p className="app-slogan">
          <a href="https://github.com/sai-educ/TeachBound" target="_blank" rel="noopener noreferrer">Open source</a>, ad-free, and 100% free to use. {' '}
          <a href="https://forms.gle/WShMfsvVaLc34QeaA" target="_blank" rel="noopener noreferrer">Please provide feedback or suggestions!</a>
        </p>
      </header>
      <div
        className={`main-content-wrapper ${isDraggingFile ? 'dragging-file' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <Toolbar
          selectedTool={selectedTool}
          setSelectedTool={setSelectedTool}
          strokeColor={strokeColor}
          setStrokeColor={setStrokeColor}
          fillColor={fillColor}
          setFillColor={setFillColor}
          lineWidth={lineWidth}
          setLineWidth={setLineWidth}
          fontSize={fontSize}
          setFontSize={setFontSize}
          stickyNoteColor={stickyNoteColor}
          setStickyNoteColor={setStickyNoteColor}
          toolbarDisplayMode={toolbarDisplayMode}
          setToolbarDisplayMode={setToolbarDisplayMode}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClearFrame={handleClearFrame}
          canUndo={historyStep > 0}
          canRedo={historyStep < history.length - 1}
          onDownloadPNG={handleDownloadPNG}
          onDownloadPDF={handleDownloadPDF}
          onDeleteSelected={handleDeleteSelected}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onDuplicate={handleDuplicate}
          onSave={handleManualSave}
          onClearSaved={handleClearSaved}
          hasClipboard={clipboard.length > 0}
          onImageUpload={handleImageUpload}
        />
        <Canvas
          ref={canvasRef}
          selectedTool={selectedTool}
          strokeColor={strokeColor}
          fillColor={fillColor}
          lineWidth={lineWidth}
          fontSize={fontSize}
          stickyNoteColor={stickyNoteColor}
          elements={elements}
          onDrawingOrElementComplete={handleDrawingOrElementComplete}
          updateElementsAndHistory={updateElementsAndHistory}
          editingElementId={editingElement?.id}
          activateStickyNoteEditing={activateStickyNoteEditing}
          activateTextEditing={activateTextEditing}
        />
      </div>

      {editingElement && (
        <textarea
          ref={textAreaRef}
          className="sticky-note-textarea"
          style={{
            position: 'absolute',
            top: `${textAreaPosition.y}px`,
            left: `${textAreaPosition.x}px`,
            width: editingElement.isText ? '300px' : '150px', 
            height: editingElement.isText ? 'auto' : '100px',
            minHeight: editingElement.isText ? '30px' : '100px',
            fontSize: editingElement.isText ? `${fontSize}px` : '14px',
            backgroundColor: editingElement.isText ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 250, 205, 0.95)',
          }}
          value={editingElement.text}
          onChange={handleTextAreaChange}
          onBlur={handleTextAreaBlur}
          onKeyDown={handleTextAreaKeyDown}
        />
      )}
      
      {/* Save Indicator */}
      {showSaveIndicator && (
        <div className="save-indicator">
          ✓ Saved
        </div>
      )}
    </div>
  );
}

export default App;
