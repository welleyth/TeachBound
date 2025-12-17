// src/Canvas.js
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import './Canvas.css';

const STICKY_NOTE_WIDTH = 150;
const STICKY_NOTE_HEIGHT = 100;

// Image handle constants for Canva-style controls
const HANDLE_SIZE = 10;
const ROTATION_HANDLE_OFFSET = 25;

const Canvas = forwardRef(({
  selectedTool, strokeColor, fillColor, lineWidth, fontSize, stickyNoteColor, elements,
  onDrawingOrElementComplete,
  updateElementsAndHistory,
  editingElementId,
  activateStickyNoteEditing,
  activateTextEditing
}, ref) => {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const devicePixelRatioRef = useRef(1);

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);

  const [draggingElement, setDraggingElement] = useState(null);
  const [draggedElementsPositions, setDraggedElementsPositions] = useState({}); // New state for real-time positions
  const [isResizingCanvas, setIsResizingCanvas] = useState(false);

  const [shapeStartPoint, setShapeStartPoint] = useState(null);
  const [currentShape, setCurrentShape] = useState(null);

  const [selectedElements, setSelectedElements] = useState([]);
  const [selectionRect, setSelectionRect] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Image manipulation states
  const [imageCache, setImageCache] = useState({}); // Cache loaded images
  const [resizingImage, setResizingImage] = useState(null); // { id, handle, startX, startY, startWidth, startHeight }
  const [rotatingImage, setRotatingImage] = useState(null); // { id, startAngle, startRotation }

  // High-resolution canvas setup
  const setupHighResCanvas = (canvas, context) => {
    const rect = canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    devicePixelRatioRef.current = devicePixelRatio;
    
    // Set the actual size in memory (scaled up for high DPI)
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    
    // Scale the canvas back down using CSS
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    // Scale the drawing context so everything draws at the correct size
    context.scale(devicePixelRatio, devicePixelRatio);
    
    // Set context properties for crisp rendering
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.textBaseline = 'top';
    context.textAlign = 'left';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    
    return devicePixelRatio;
  };

  useImperativeHandle(ref, () => ({
    getSelectedElements: () => {
      return elements.filter(el => selectedElements.includes(el.id));
    },
    
    clearSelection: () => {
      setSelectedElements([]);
    },
    
    selectAll: () => {
      setSelectedElements(elements.map(el => el.id));
    },
    
    downloadAsPNG: (scale = 1) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const exportScale = scale * (window.devicePixelRatio || 1);
      
      // Create high-resolution offscreen canvas
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = rect.width * exportScale;
      offscreenCanvas.height = rect.height * exportScale;
      
      const offscreenCtx = offscreenCanvas.getContext('2d');
      offscreenCtx.scale(exportScale, exportScale);
      
      // Set high-quality rendering properties
      offscreenCtx.imageSmoothingEnabled = true;
      offscreenCtx.imageSmoothingQuality = 'high';
      offscreenCtx.textBaseline = 'top';
      offscreenCtx.textAlign = 'left';
      offscreenCtx.lineCap = 'round';
      offscreenCtx.lineJoin = 'round';
      
      // Fill with white background
      offscreenCtx.fillStyle = '#FFFFFF';
      offscreenCtx.fillRect(0, 0, rect.width, rect.height);
      
      // Redraw all elements at high resolution
      redrawAllElements(offscreenCtx, rect.width, rect.height, true);
      
      // Download the image
      offscreenCanvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `teachbound-whiteboard-${scale}x.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 'image/png', 1.0);
    },
    
    downloadAsPDF: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      const rect = canvas.getBoundingClientRect();
      
      // Create high-resolution canvas for PDF
      const pdfCanvas = document.createElement('canvas');
      const pdfScale = 2; // High resolution for PDF
      pdfCanvas.width = rect.width * pdfScale;
      pdfCanvas.height = rect.height * pdfScale;
      
      const pdfCtx = pdfCanvas.getContext('2d');
      pdfCtx.scale(pdfScale, pdfScale);
      
      // Set high-quality rendering properties
      pdfCtx.imageSmoothingEnabled = true;
      pdfCtx.imageSmoothingQuality = 'high';
      pdfCtx.textBaseline = 'top';
      pdfCtx.textAlign = 'left';
      pdfCtx.lineCap = 'round';
      pdfCtx.lineJoin = 'round';
      
      // Fill with white background
      pdfCtx.fillStyle = '#FFFFFF';
      pdfCtx.fillRect(0, 0, rect.width, rect.height);
      
      // Redraw all elements
      redrawAllElements(pdfCtx, rect.width, rect.height, true);
      
      // Get the image data
      const imageDataUrl = pdfCanvas.toDataURL('image/png', 1.0);
      
      // Create HTML content for PDF printing
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Teach Bound Whiteboard</title>
          <style>
            @page {
              margin: 0;
              size: A4 landscape;
            }
            body {
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              background: white;
            }
            img {
              max-width: 100%;
              max-height: 100vh;
              object-fit: contain;
            }
            @media print {
              body {
                background: white;
              }
              img {
                max-width: 100%;
                max-height: 100vh;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <img src="${imageDataUrl}" alt="Teach Bound Whiteboard" />
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
                setTimeout(() => {
                  window.close();
                }, 1000);
              }, 500);
            };
          </script>
        </body>
        </html>
      `;
      
      // Write content to new window and trigger print
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    },
    
    getCanvasGlobalRect: () => canvasRef.current?.getBoundingClientRect(),
    
    deleteSelectedElements: () => {
      if (selectedElements.length > 0) {
        updateElementsAndHistory(prevElements =>
          prevElements.filter(el => !selectedElements.includes(el.id))
        );
        setSelectedElements([]);
      }
    }
  }));

  const getMousePosition = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const clientX = event.clientX || (event.touches && event.touches[0].clientX);
    const clientY = event.clientY || (event.touches && event.touches[0].clientY);
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const newMousePos = { x: Math.round(x), y: Math.round(y) };
    setMousePosition(newMousePos);
    return newMousePos;
  };

  // Get element position (either current or dragged position)
  const getElementDisplayPosition = (element) => {
    if (draggedElementsPositions[element.id]) {
      return draggedElementsPositions[element.id];
    }
    return element;
  };

  const drawShape = (context, type, startX, startY, endX, endY, options = {}) => {
    context.strokeStyle = options.strokeColor || strokeColor;
    context.fillStyle = options.fillColor || fillColor;
    context.lineWidth = options.lineWidth || lineWidth;
    
    const originalGCO = context.globalCompositeOperation;
    context.globalCompositeOperation = 'source-over';

    context.beginPath();
    
    switch (type) {
      case 'rectangle':
        const rectWidth = endX - startX;
        const rectHeight = endY - startY;
        context.rect(startX, startY, rectWidth, rectHeight);
        if (options.fillColor && options.fillColor !== 'transparent') {
          context.fill();
        }
        context.stroke();
        break;
        
      case 'circle':
        // Use radius if provided in options, otherwise calculate from points
        const radius = options.radius !== undefined 
          ? options.radius 
          : Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        context.arc(startX, startY, radius, 0, 2 * Math.PI);
        if (options.fillColor && options.fillColor !== 'transparent') {
          context.fill();
        }
        context.stroke();
        break;
        
      case 'triangle':
        // Draw an equilateral triangle with base horizontal
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);
        const triangleHeight = Math.max(height, width * 0.866); // Maintain proportion
        
        // Calculate triangle points
        const centerX = (startX + endX) / 2;
        const baseY = Math.max(startY, endY);
        const apexY = baseY - triangleHeight;
        
        context.moveTo(startX, baseY); // Bottom left
        context.lineTo(endX, baseY);   // Bottom right
        context.lineTo(centerX, apexY); // Top center
        context.closePath();
        
        if (options.fillColor && options.fillColor !== 'transparent') {
          context.fill();
        }
        context.stroke();
        break;
        
      case 'line':
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();
        break;
        
      case 'arrow':
        // Draw the main line
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();
        
        // Draw arrowhead
        const angle = Math.atan2(endY - startY, endX - startX);
        const arrowLength = Math.min(25, Math.max(15, (options.lineWidth || lineWidth) * 3));
        const arrowAngle = Math.PI / 6; // 30 degrees
        
        context.beginPath();
        context.moveTo(endX, endY);
        context.lineTo(
          endX - arrowLength * Math.cos(angle - arrowAngle),
          endY - arrowLength * Math.sin(angle - arrowAngle)
        );
        context.moveTo(endX, endY);
        context.lineTo(
          endX - arrowLength * Math.cos(angle + arrowAngle),
          endY - arrowLength * Math.sin(angle + arrowAngle)
        );
        context.stroke();
        break;
        
      default: 
        break;
    }
    
    context.globalCompositeOperation = originalGCO;
  };

  const drawText = (context, text, x, y, font, color, isExport = false) => {
    if (!text || (editingElementId && !isExport)) return;
    
    context.fillStyle = color || '#000000';
    context.font = font || `${fontSize}px "Open Sans", Arial, sans-serif`;
    
    // Handle multi-line text
    const lines = text.split('\n');
    const lineHeight = parseInt(font || fontSize) * 1.2;
    
    lines.forEach((line, index) => {
      context.fillText(line, x, y + (index * lineHeight));
    });
  };

  const drawStickyNote = (context, element, isExport = false) => {
    const displayElement = getElementDisplayPosition(element);
    const { x, y } = displayElement;
    const { text, backgroundColor, id } = element;
    const noteColor = backgroundColor || stickyNoteColor;
    
    // Draw sticky note background
    context.fillStyle = noteColor;
    context.strokeStyle = '#333333';
    context.lineWidth = 1;
    
    context.beginPath();
    context.roundRect(x, y, STICKY_NOTE_WIDTH, STICKY_NOTE_HEIGHT, 4);
    context.fill();
    context.stroke();
    
    // Draw text if not currently editing or if exporting
    if ((editingElementId !== id || isExport) && text) {
      context.fillStyle = '#000000';
      context.font = '14px "Open Sans", Arial, sans-serif';
      
      const textPadding = 10;
      const maxWidth = STICKY_NOTE_WIDTH - 2 * textPadding;
      let textY = y + textPadding + 14;
      
      const lines = text.split('\n');
      
      lines.forEach(currentLineText => {
        let textToProcess = currentLineText;
        while (textToProcess.length > 0 && textY < y + STICKY_NOTE_HEIGHT - textPadding) {
          let segment = '';
          for (let i = 0; i < textToProcess.length; i++) {
            const testSegment = segment + textToProcess[i];
            if (context.measureText(testSegment).width > maxWidth) break;
            segment = testSegment;
          }
          
          if (segment) {
            context.fillText(segment, x + textPadding, textY);
            textY += 16;
            textToProcess = textToProcess.substring(segment.length);
          } else {
            textY += 16;
            break;
          }
        }
      });
    }
  };

  // Draw image element with Canva-style controls
  const drawImage = (context, element, isExport = false) => {
    const displayElement = getElementDisplayPosition(element);
    const { x, y, width, height, rotation = 0, imageData, id } = { ...element, ...displayElement };

    // Get cached image or create new one
    let img = imageCache[id];
    if (!img || img.src !== imageData) {
      img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setImageCache(prev => ({ ...prev, [id]: img }));
      };
      img.onerror = () => {
        console.error('Failed to load image in canvas:', id);
        // Still cache it to prevent repeated load attempts
        setImageCache(prev => ({ ...prev, [id]: null }));
      };
      img.src = imageData;

      // Draw placeholder while loading
      context.save();
      context.fillStyle = '#f0f0f0';
      context.strokeStyle = '#ccc';
      context.lineWidth = 2;
      context.fillRect(x, y, width, height);
      context.strokeRect(x, y, width, height);
      context.fillStyle = '#999';
      context.font = '14px "Open Sans", Arial, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('Loading...', x + width / 2, y + height / 2);
      context.restore();
      return;
    }

    // If image failed to load, show error placeholder
    if (img === null) {
      context.save();
      context.fillStyle = '#ffebee';
      context.strokeStyle = '#f44336';
      context.lineWidth = 2;
      context.fillRect(x, y, width, height);
      context.strokeRect(x, y, width, height);
      context.fillStyle = '#f44336';
      context.font = '12px "Open Sans", Arial, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('Image failed to load', x + width / 2, y + height / 2);
      context.restore();
      return;
    }

    if (!img.complete) {
      // Draw placeholder while loading
      context.save();
      context.fillStyle = '#f0f0f0';
      context.strokeStyle = '#ccc';
      context.lineWidth = 2;
      context.fillRect(x, y, width, height);
      context.strokeRect(x, y, width, height);
      context.fillStyle = '#999';
      context.font = '14px "Open Sans", Arial, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('Loading...', x + width / 2, y + height / 2);
      context.restore();
      return;
    }

    context.save();

    // Move to image center for rotation
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    context.translate(centerX, centerY);
    context.rotate((rotation * Math.PI) / 180);
    context.translate(-centerX, -centerY);

    // Draw the image
    context.drawImage(img, x, y, width, height);

    context.restore();

    // Draw selection handles if selected and not exporting
    if (!isExport && selectedElements.includes(id)) {
      context.save();

      // Move to image center for rotation
      context.translate(centerX, centerY);
      context.rotate((rotation * Math.PI) / 180);
      context.translate(-centerX, -centerY);

      // Draw border
      context.strokeStyle = '#0066ff';
      context.lineWidth = 2;
      context.setLineDash([]);
      context.strokeRect(x, y, width, height);

      // Draw corner handles
      const handles = [
        { name: 'nw', x: x, y: y },
        { name: 'ne', x: x + width, y: y },
        { name: 'se', x: x + width, y: y + height },
        { name: 'sw', x: x, y: y + height },
      ];

      context.fillStyle = '#ffffff';
      context.strokeStyle = '#0066ff';
      context.lineWidth = 2;

      handles.forEach(handle => {
        context.beginPath();
        context.arc(handle.x, handle.y, HANDLE_SIZE / 2, 0, 2 * Math.PI);
        context.fill();
        context.stroke();
      });

      // Draw rotation handle
      const rotationHandleY = y - ROTATION_HANDLE_OFFSET;

      // Line from top center to rotation handle
      context.beginPath();
      context.strokeStyle = '#0066ff';
      context.lineWidth = 1;
      context.moveTo(x + width / 2, y);
      context.lineTo(x + width / 2, rotationHandleY);
      context.stroke();

      // Rotation handle circle
      context.beginPath();
      context.fillStyle = '#0066ff';
      context.arc(x + width / 2, rotationHandleY, HANDLE_SIZE / 2 + 2, 0, 2 * Math.PI);
      context.fill();

      context.restore();
    }
  };

  const redrawAllElements = (context, canvasWidth, canvasHeight, isExport = false) => {
    if (!context) return;
    
    elements.forEach(element => {
      const originalGCO = context.globalCompositeOperation;
      const displayElement = getElementDisplayPosition(element);
      
      if (element.type === 'stroke') {
        if (element.isEraser) {
          context.globalCompositeOperation = 'destination-out';
          context.strokeStyle = 'rgba(0,0,0,1)';
        } else if (element.isHighlighter) {
          context.globalCompositeOperation = 'multiply';
          context.strokeStyle = element.color;
          context.globalAlpha = 0.3;
        } else {
          context.globalCompositeOperation = 'source-over';
          context.strokeStyle = element.color;
        }
        context.lineWidth = element.lineWidth;
        
        if (element.path && element.path.length > 0) {
          // For strokes, we need to apply offset to the entire path if being dragged
          const offsetX = displayElement.x !== undefined ? displayElement.x - element.x : 0;
          const offsetY = displayElement.y !== undefined ? displayElement.y - element.y : 0;
          
          context.beginPath();
          element.path.forEach((point, index) => {
            const adjustedX = point.x + offsetX;
            const adjustedY = point.y + offsetY;
            if (index === 0) {
              context.moveTo(adjustedX, adjustedY);
            } else {
              context.lineTo(adjustedX, adjustedY);
            }
          });
          context.stroke();
          
          if (element.isHighlighter) {
            context.globalAlpha = 1;
          }
        }
        
      } else if (element.type === 'sticky') {
        context.globalCompositeOperation = 'source-over';
        drawStickyNote(context, element, isExport);
        
      } else if (['rectangle', 'circle', 'triangle', 'line', 'arrow'].includes(element.type)) {
        context.globalCompositeOperation = 'source-over';
        
        // Handle different shape types properly
        if (element.type === 'rectangle') {
          const endX = displayElement.x + element.width;
          const endY = displayElement.y + element.height;
          drawShape(context, element.type, displayElement.x, displayElement.y, endX, endY, {
            strokeColor: element.strokeColor,
            fillColor: element.fillColor,
            lineWidth: element.lineWidth
          });
        } else if (element.type === 'circle') {
          // For circles, use the stored radius and center point
          drawShape(context, element.type, displayElement.x, displayElement.y, 0, 0, {
            strokeColor: element.strokeColor,
            fillColor: element.fillColor,
            lineWidth: element.lineWidth,
            radius: element.radius
          });
        } else if (element.type === 'triangle') {
          // For triangles, use stored endX and endY with offset
          const endX = displayElement.endX !== undefined ? displayElement.endX : element.endX;
          const endY = displayElement.endY !== undefined ? displayElement.endY : element.endY;
          drawShape(context, element.type, displayElement.x, displayElement.y, endX, endY, {
            strokeColor: element.strokeColor,
            fillColor: element.fillColor,
            lineWidth: element.lineWidth
          });
        } else if (element.type === 'line' || element.type === 'arrow') {
          // For lines and arrows, use stored endX and endY with offset
          const endX = displayElement.endX !== undefined ? displayElement.endX : element.endX;
          const endY = displayElement.endY !== undefined ? displayElement.endY : element.endY;
          drawShape(context, element.type, displayElement.x, displayElement.y, endX, endY, {
            strokeColor: element.strokeColor,
            fillColor: element.fillColor,
            lineWidth: element.lineWidth
          });
        }
        
      } else if (element.type === 'text') {
        context.globalCompositeOperation = 'source-over';
        if ((editingElementId !== element.id || isExport) && element.text) {
          drawText(context, element.text, displayElement.x, displayElement.y,
                  `${element.fontSize}px "Open Sans", Arial, sans-serif`, element.color, isExport);
        }
      } else if (element.type === 'image') {
        context.globalCompositeOperation = 'source-over';
        drawImage(context, element, isExport);
      }

      context.globalCompositeOperation = originalGCO;

      // Draw selection indicators (not for export) - skip images as they have custom handles
      if (!isExport && selectedElements.includes(element.id) && element.type !== 'image') {
        context.save();
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = '#007bff';
        context.lineWidth = 2;
        context.setLineDash([5, 5]);

        if (element.type === 'sticky') {
          context.strokeRect(displayElement.x - 2, displayElement.y - 2, 
                           STICKY_NOTE_WIDTH + 4, STICKY_NOTE_HEIGHT + 4);
        } else if (element.type === 'text') {
          const tempFont = context.font;
          context.font = `${element.fontSize}px "Open Sans", Arial, sans-serif`;
          const textWidth = context.measureText(element.text || '').width;
          context.font = tempFont;
          context.strokeRect(displayElement.x - 2, displayElement.y - element.fontSize - 2, 
                           textWidth + 4, element.fontSize + 8);
        } else if (element.type === 'rectangle') {
          context.strokeRect(displayElement.x - 2, displayElement.y - 2, 
                           element.width + 4, element.height + 4);
        } else if (element.type === 'circle') {
          context.beginPath();
          context.arc(displayElement.x, displayElement.y, element.radius + 2, 0, 2 * Math.PI);
          context.stroke();
        } else if (element.type === 'triangle') {
          // Draw selection rectangle around triangle bounds
          const endX = displayElement.endX !== undefined ? displayElement.endX : element.endX;
          const endY = displayElement.endY !== undefined ? displayElement.endY : element.endY;
          const minX = Math.min(displayElement.x, endX);
          const maxX = Math.max(displayElement.x, endX);
          const minY = Math.min(displayElement.y, endY);
          const maxY = Math.max(displayElement.y, endY);
          context.strokeRect(minX - 2, minY - 2, maxX - minX + 4, maxY - minY + 4);
        } else if (element.type === 'line' || element.type === 'arrow') {
          const endX = displayElement.endX !== undefined ? displayElement.endX : element.endX;
          const endY = displayElement.endY !== undefined ? displayElement.endY : element.endY;
          context.fillStyle = '#007bff';
          context.fillRect(displayElement.x - 4, displayElement.y - 4, 8, 8);
          context.fillRect(endX - 4, endY - 4, 8, 8);
        }
        
        context.restore();
      }
    });
  };

  const redrawAll = (context) => {
    if (!context || !context.canvas) return;
    
    const rect = context.canvas.getBoundingClientRect();
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;
    
    // Clear and set background
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    context.restore();
    
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw all elements
    redrawAllElements(context, canvasWidth, canvasHeight, false);

    // Draw current live stroke (pen/eraser/highlighter)
    if (isDrawing && (selectedTool === 'pen' || selectedTool === 'eraser' || selectedTool === 'highlighter') && currentPath.length > 0) {
      const originalGCO = context.globalCompositeOperation;
      
      if (selectedTool === 'eraser') {
        context.globalCompositeOperation = 'destination-out';
        context.strokeStyle = 'rgba(0,0,0,1)';
        context.lineWidth = lineWidth * 1.5;
      } else if (selectedTool === 'highlighter') {
        context.globalCompositeOperation = 'multiply';
        context.strokeStyle = strokeColor;
        context.lineWidth = lineWidth * 3;
        context.globalAlpha = 0.3;
      } else {
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = strokeColor;
        context.lineWidth = lineWidth;
      }

      context.beginPath();
      currentPath.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      });
      context.stroke();
      
      if (selectedTool === 'highlighter') {
        context.globalAlpha = 1;
      }
      
      context.globalCompositeOperation = originalGCO;
    }

    // Draw current live shape preview
    if (currentShape && shapeStartPoint) {
      context.save();
      context.globalCompositeOperation = 'source-over';
      drawShape(context, currentShape, shapeStartPoint.x, shapeStartPoint.y, 
               mousePosition.x, mousePosition.y, { strokeColor, fillColor, lineWidth });
      context.restore();
    }

    // Draw selection rectangle
    if (selectionRect && isSelecting) {
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.strokeStyle = '#007bff';
      context.lineWidth = 1;
      context.setLineDash([5, 5]);
      context.strokeRect(
        selectionRect.startX, selectionRect.startY,
        selectionRect.endX - selectionRect.startX,
        selectionRect.endY - selectionRect.startY
      );
      context.restore();
    }

    // Draw canvas info
    context.save();
    context.fillStyle = '#888888';
    context.font = '10px "Open Sans", Arial, sans-serif';
    context.setLineDash([]);
    
    const dimText = `${Math.round(canvasWidth)}x${Math.round(canvasHeight)}`;
    const textWidthDim = context.measureText(dimText).width;
    context.fillText(dimText, canvasWidth - textWidthDim - 5, canvasHeight - 15);
    
    const coordText = `x: ${mousePosition.x}, y: ${mousePosition.y}`;
    context.fillText(coordText, 5, canvasHeight - 15);
    context.restore();
  };

  // Canvas setup and resize handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const context = canvas.getContext('2d');
    contextRef.current = context;
    
    let resizeTimeout;
    const handleResize = () => {
      setIsResizingCanvas(true);
      clearTimeout(resizeTimeout);
      
      resizeTimeout = setTimeout(() => {
        const container = canvas.parentElement;
        if (container && contextRef.current) {
          // Update canvas display size
          canvas.style.width = container.clientWidth + 'px';
          canvas.style.height = container.clientHeight + 'px';
          
          // Setup high-resolution canvas
          setupHighResCanvas(canvas, contextRef.current);
        }
        setIsResizingCanvas(false);
      }, 100);
    };
    
    handleResize(); // Initial setup
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // Redraw when state changes
  useEffect(() => {
    if (contextRef.current && !isResizingCanvas) {
      redrawAll(contextRef.current);
    }
  }, [
    elements, isResizingCanvas, editingElementId, selectedElements,
    currentShape, mousePosition, shapeStartPoint, selectionRect, isSelecting,
    strokeColor, fillColor, lineWidth, fontSize, stickyNoteColor,
    currentPath, isDrawing, selectedTool, draggedElementsPositions, imageCache
  ]);

  // Check if point is on an image handle (for resize/rotate)
  const getImageHandleAtPosition = (x, y, element) => {
    if (element.type !== 'image' || !selectedElements.includes(element.id)) return null;

    const displayElement = getElementDisplayPosition(element);
    const { x: imgX, y: imgY, width, height, rotation = 0 } = { ...element, ...displayElement };

    // Transform click point to image's local coordinate system
    const centerX = imgX + width / 2;
    const centerY = imgY + height / 2;
    const angle = -(rotation * Math.PI) / 180;

    const rotatedX = Math.cos(angle) * (x - centerX) - Math.sin(angle) * (y - centerY) + centerX;
    const rotatedY = Math.sin(angle) * (x - centerX) + Math.cos(angle) * (y - centerY) + centerY;

    // Check rotation handle
    const rotationHandleY = imgY - ROTATION_HANDLE_OFFSET;
    const rotationHandleX = imgX + width / 2;
    if (Math.sqrt(Math.pow(rotatedX - rotationHandleX, 2) + Math.pow(rotatedY - rotationHandleY, 2)) <= HANDLE_SIZE) {
      return 'rotate';
    }

    // Check corner handles
    const handles = [
      { name: 'nw', x: imgX, y: imgY },
      { name: 'ne', x: imgX + width, y: imgY },
      { name: 'se', x: imgX + width, y: imgY + height },
      { name: 'sw', x: imgX, y: imgY + height },
    ];

    for (const handle of handles) {
      if (Math.sqrt(Math.pow(rotatedX - handle.x, 2) + Math.pow(rotatedY - handle.y, 2)) <= HANDLE_SIZE) {
        return handle.name;
      }
    }

    return null;
  };

  const getElementAtPosition = (x, y) => {
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      const displayElement = getElementDisplayPosition(el);
      const ctx = contextRef.current;

      if (el.type === 'sticky') {
        if (x >= displayElement.x && x <= displayElement.x + STICKY_NOTE_WIDTH && 
            y >= displayElement.y && y <= displayElement.y + STICKY_NOTE_HEIGHT) {
          return el;
        }
      } else if (el.type === 'text' && ctx) {
        const originalFont = ctx.font;
        ctx.font = `${el.fontSize}px "Open Sans", Arial, sans-serif`;
        const textWidth = ctx.measureText(el.text || '').width;
        ctx.font = originalFont;
        
        if (x >= displayElement.x && x <= displayElement.x + textWidth && 
            y >= displayElement.y - el.fontSize && y <= displayElement.y) {
          return el;
        }
      } else if (el.type === 'rectangle') {
        if (x >= displayElement.x && x <= displayElement.x + el.width && 
            y >= displayElement.y && y <= displayElement.y + el.height) {
          return el;
        }
      } else if (el.type === 'circle') {
        const distance = Math.sqrt(Math.pow(x - displayElement.x, 2) + Math.pow(y - displayElement.y, 2));
        if (distance <= el.radius) {
          return el;
        }
      } else if (el.type === 'triangle') {
        // Simple bounding box check for triangle
        const endX = displayElement.endX !== undefined ? displayElement.endX : el.endX;
        const endY = displayElement.endY !== undefined ? displayElement.endY : el.endY;
        const minX = Math.min(displayElement.x, endX);
        const maxX = Math.max(displayElement.x, endX);
        const minY = Math.min(displayElement.y, endY);
        const maxY = Math.max(displayElement.y, endY);
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          return el;
        }
      } else if (el.type === 'line' || el.type === 'arrow') {
        const endX = displayElement.endX !== undefined ? displayElement.endX : el.endX;
        const endY = displayElement.endY !== undefined ? displayElement.endY : el.endY;
        const { x: x1, y: y1 } = displayElement;
        const { lineWidth: lw } = el;
        const lenSq = Math.pow(endX - x1, 2) + Math.pow(endY - y1, 2);
        const effectiveLineWidth = Math.max(lw / 2 + 3, 8);

        if (lenSq === 0) {
          if (Math.sqrt(Math.pow(x - x1, 2) + Math.pow(y - y1, 2)) < effectiveLineWidth) {
            return el;
          }
        } else {
          let t = ((x - x1) * (endX - x1) + (y - y1) * (endY - y1)) / lenSq;
          t = Math.max(0, Math.min(1, t));
          const projX = x1 + t * (endX - x1);
          const projY = y1 + t * (endY - y1);

          if (Math.sqrt(Math.pow(x - projX, 2) + Math.pow(y - projY, 2)) < effectiveLineWidth) {
            return el;
          }
        }
      } else if (el.type === 'image') {
        const { width, height, rotation = 0 } = el;
        const imgX = displayElement.x;
        const imgY = displayElement.y;

        // Transform click point to image's local coordinate system (accounting for rotation)
        const centerX = imgX + width / 2;
        const centerY = imgY + height / 2;
        const angle = -(rotation * Math.PI) / 180;

        const rotatedX = Math.cos(angle) * (x - centerX) - Math.sin(angle) * (y - centerY) + centerX;
        const rotatedY = Math.sin(angle) * (x - centerX) + Math.cos(angle) * (y - centerY) + centerY;

        if (rotatedX >= imgX && rotatedX <= imgX + width &&
            rotatedY >= imgY && rotatedY <= imgY + height) {
          return el;
        }
      }
    }
    return null;
  };
  
  const getElementsInRect = (rect) => {
    const { startX, startY, endX, endY } = rect;
    const selLeft = Math.min(startX, endX);
    const selRight = Math.max(startX, endX);
    const selTop = Math.min(startY, endY);
    const selBottom = Math.max(startY, endY);
    const ctx = contextRef.current;
    
    return elements.filter(el => {
      const displayElement = getElementDisplayPosition(el);
      let elLeft, elRight, elTop, elBottom;
      
      if (el.type === 'sticky') {
        elLeft = displayElement.x;
        elRight = displayElement.x + STICKY_NOTE_WIDTH;
        elTop = displayElement.y;
        elBottom = displayElement.y + STICKY_NOTE_HEIGHT;
      } else if (el.type === 'rectangle') {
        elLeft = displayElement.x;
        elRight = displayElement.x + el.width;
        elTop = displayElement.y;
        elBottom = displayElement.y + el.height;
      } else if (el.type === 'circle') {
        elLeft = displayElement.x - el.radius;
        elRight = displayElement.x + el.radius;
        elTop = displayElement.y - el.radius;
        elBottom = displayElement.y + el.radius;
      } else if (el.type === 'triangle') {
        const endX = displayElement.endX !== undefined ? displayElement.endX : el.endX;
        const endY = displayElement.endY !== undefined ? displayElement.endY : el.endY;
        elLeft = Math.min(displayElement.x, endX);
        elRight = Math.max(displayElement.x, endX);
        elTop = Math.min(displayElement.y, endY);
        elBottom = Math.max(displayElement.y, endY);
      } else if (el.type === 'text' && ctx) {
        const originalFont = ctx.font;
        ctx.font = `${el.fontSize}px "Open Sans", Arial, sans-serif`;
        const textWidth = ctx.measureText(el.text || '').width;
        ctx.font = originalFont;
        elLeft = displayElement.x;
        elRight = displayElement.x + textWidth;
        elTop = displayElement.y - el.fontSize;
        elBottom = displayElement.y;
      } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'stroke') {
        if (el.path && el.path.length > 0) {
          elLeft = Math.min(...el.path.map(p => p.x));
          elRight = Math.max(...el.path.map(p => p.x));
          elTop = Math.min(...el.path.map(p => p.y));
          elBottom = Math.max(...el.path.map(p => p.y));
        } else if (el.type === 'line' || el.type === 'arrow') {
          const endX = displayElement.endX !== undefined ? displayElement.endX : el.endX;
          const endY = displayElement.endY !== undefined ? displayElement.endY : el.endY;
          elLeft = Math.min(displayElement.x, endX);
          elRight = Math.max(displayElement.x, endX);
          elTop = Math.min(displayElement.y, endY);
          elBottom = Math.max(displayElement.y, endY);
        } else {
          return false;
        }
      } else if (el.type === 'image') {
        elLeft = displayElement.x;
        elRight = displayElement.x + el.width;
        elTop = displayElement.y;
        elBottom = displayElement.y + el.height;
      } else {
        return false;
      }
      
      return elLeft >= selLeft && elRight <= selRight && 
             elTop >= selTop && elBottom <= selBottom;
    });
  };

  const handleMouseDown = (event) => {
    event.preventDefault();
    if (editingElementId) return;
    
    const { x, y } = getMousePosition(event);

    if (selectedTool === 'pen' || selectedTool === 'eraser' || selectedTool === 'highlighter') {
      setSelectedElements([]);
      setIsDrawing(true);
      setCurrentPath([{ x, y }]);
      
    } else if (selectedTool === 'select') {
      // First check if clicking on image handles
      for (const el of elements) {
        if (el.type === 'image' && selectedElements.includes(el.id)) {
          const handle = getImageHandleAtPosition(x, y, el);
          if (handle) {
            if (handle === 'rotate') {
              // Start rotation
              const centerX = el.x + el.width / 2;
              const centerY = el.y + el.height / 2;
              const startAngle = Math.atan2(y - centerY, x - centerX) * (180 / Math.PI);
              setRotatingImage({
                id: el.id,
                startAngle,
                startRotation: el.rotation || 0
              });
              return;
            } else {
              // Start resizing
              setResizingImage({
                id: el.id,
                handle,
                startX: x,
                startY: y,
                startWidth: el.width,
                startHeight: el.height,
                startElX: el.x,
                startElY: el.y,
                aspectRatio: el.width / el.height
              });
              return;
            }
          }
        }
      }

      const clickedElement = getElementAtPosition(x, y);

      if (clickedElement) {
        if (event.shiftKey) {
          setSelectedElements(prev =>
            prev.includes(clickedElement.id)
              ? prev.filter(id => id !== clickedElement.id)
              : [...prev, clickedElement.id]
          );
        } else if (!selectedElements.includes(clickedElement.id)) {
          setSelectedElements([clickedElement.id]);
        }

        const currentSelectedIds = selectedElements.includes(clickedElement.id)
          ? selectedElements
          : [clickedElement.id];

        const selectedElemsData = elements
          .filter(el => currentSelectedIds.includes(el.id))
          .map(el => ({
            id: el.id,
            x: el.x,
            y: el.y,
            endX: el.endX,
            endY: el.endY,
            width: el.width,
            height: el.height
          }));

        setDraggingElement({
          ids: currentSelectedIds,
          initialMouseX: x,
          initialMouseY: y,
          initialPositions: selectedElemsData
        });
      } else {
        setIsSelecting(true);
        setShapeStartPoint({ x, y });
        if (!event.shiftKey) setSelectedElements([]);
      }
      
    } else if (['rectangle', 'circle', 'triangle', 'line', 'arrow'].includes(selectedTool)) {
      setSelectedElements([]);
      setShapeStartPoint({ x, y });
      setCurrentShape(selectedTool);
      
    } else if (selectedTool === 'text') {
      setSelectedElements([]);
      const newTextId = Date.now();
      const newText = {
        type: 'text',
        x,
        y,
        text: '',
        color: strokeColor,
        fontSize,
        id: newTextId
      };
      onDrawingOrElementComplete(newText);
      setTimeout(() => activateTextEditing(newText), 0);
      
    } else if (selectedTool === 'sticky') {
      setSelectedElements([]);
      const newStickyId = Date.now();
      const newSticky = {
        type: 'sticky',
        x: x - STICKY_NOTE_WIDTH / 2,
        y: y - STICKY_NOTE_HEIGHT / 2,
        text: '',
        backgroundColor: stickyNoteColor,
        id: newStickyId
      };
      onDrawingOrElementComplete(newSticky);
      setTimeout(() => activateStickyNoteEditing(newSticky), 0);
    }

    // Double-click detection for editing
    const clickedElementForEdit = getElementAtPosition(x, y);
    if (clickedElementForEdit) {
      const now = Date.now();
      const lastClickInfo = canvasRef.current._lastClickDetails || {};
      
      if (clickedElementForEdit.id === lastClickInfo.id && (now - lastClickInfo.time < 300)) {
        if (clickedElementForEdit.type === 'sticky') {
          activateStickyNoteEditing(clickedElementForEdit);
        } else if (clickedElementForEdit.type === 'text') {
          activateTextEditing(clickedElementForEdit);
        }
        canvasRef.current._lastClickDetails = {};
        setDraggingElement(null);
      } else {
        canvasRef.current._lastClickDetails = { id: clickedElementForEdit.id, time: now };
      }
    } else {
      canvasRef.current._lastClickDetails = {};
    }
  };

  const handleMouseMove = (event) => {
    event.preventDefault();
    const { x, y } = getMousePosition(event);
    if (editingElementId) return;

    // Handle image rotation
    if (rotatingImage) {
      const element = elements.find(el => el.id === rotatingImage.id);
      if (element) {
        const centerX = element.x + element.width / 2;
        const centerY = element.y + element.height / 2;
        const currentAngle = Math.atan2(y - centerY, x - centerX) * (180 / Math.PI);
        const deltaAngle = currentAngle - rotatingImage.startAngle;
        const newRotation = (rotatingImage.startRotation + deltaAngle + 360) % 360;

        setDraggedElementsPositions(prev => ({
          ...prev,
          [rotatingImage.id]: { ...prev[rotatingImage.id], rotation: newRotation }
        }));
      }
      return;
    }

    // Handle image resizing
    if (resizingImage) {
      const element = elements.find(el => el.id === resizingImage.id);
      if (element) {
        const { handle, startX, startY, startWidth, startHeight, startElX, startElY, aspectRatio } = resizingImage;
        let deltaX = x - startX;
        let deltaY = y - startY;

        let newWidth = startWidth;
        let newHeight = startHeight;
        let newX = startElX;
        let newY = startElY;

        // Maintain aspect ratio during resize
        switch (handle) {
          case 'se':
            newWidth = Math.max(50, startWidth + deltaX);
            newHeight = newWidth / aspectRatio;
            break;
          case 'sw':
            newWidth = Math.max(50, startWidth - deltaX);
            newHeight = newWidth / aspectRatio;
            newX = startElX + startWidth - newWidth;
            break;
          case 'ne':
            newWidth = Math.max(50, startWidth + deltaX);
            newHeight = newWidth / aspectRatio;
            newY = startElY + startHeight - newHeight;
            break;
          case 'nw':
            newWidth = Math.max(50, startWidth - deltaX);
            newHeight = newWidth / aspectRatio;
            newX = startElX + startWidth - newWidth;
            newY = startElY + startHeight - newHeight;
            break;
          default:
            break;
        }

        setDraggedElementsPositions(prev => ({
          ...prev,
          [resizingImage.id]: { x: newX, y: newY, width: newWidth, height: newHeight }
        }));
      }
      return;
    }

    if (isDrawing && (selectedTool === 'pen' || selectedTool === 'eraser' || selectedTool === 'highlighter')) {
      setCurrentPath(prev => [...prev, { x, y }]);
    } else if (isSelecting && shapeStartPoint) {
      setSelectionRect({
        startX: shapeStartPoint.x,
        startY: shapeStartPoint.y,
        endX: x,
        endY: y
      });
    } else if (draggingElement && draggingElement.ids && draggingElement.initialPositions) {
      // Real-time dragging: Update positions as mouse moves
      const deltaX = x - draggingElement.initialMouseX;
      const deltaY = y - draggingElement.initialMouseY;
      
      const newDraggedPositions = {};
      draggingElement.initialPositions.forEach(initialPos => {
        const element = elements.find(el => el.id === initialPos.id);
        if (element) {
          if (element.type === 'line' || element.type === 'arrow' || element.type === 'triangle') {
            newDraggedPositions[initialPos.id] = {
              x: initialPos.x + deltaX,
              y: initialPos.y + deltaY,
              endX: initialPos.endX + deltaX,
              endY: initialPos.endY + deltaY
            };
          } else {
            newDraggedPositions[initialPos.id] = {
              x: initialPos.x + deltaX,
              y: initialPos.y + deltaY
            };
          }
        }
      });
      
      setDraggedElementsPositions(newDraggedPositions);
    }
  };

  const handleMouseUp = (event) => {
    event.preventDefault();
    const { x, y } = getMousePosition(event);

    // Commit image rotation
    if (rotatingImage) {
      const draggedPos = draggedElementsPositions[rotatingImage.id];
      if (draggedPos && draggedPos.rotation !== undefined) {
        updateElementsAndHistory(prevElements =>
          prevElements.map(el =>
            el.id === rotatingImage.id
              ? { ...el, rotation: draggedPos.rotation }
              : el
          )
        );
      }
      setRotatingImage(null);
      setDraggedElementsPositions({});
      return;
    }

    // Commit image resize
    if (resizingImage) {
      const draggedPos = draggedElementsPositions[resizingImage.id];
      if (draggedPos) {
        updateElementsAndHistory(prevElements =>
          prevElements.map(el =>
            el.id === resizingImage.id
              ? { ...el, x: draggedPos.x, y: draggedPos.y, width: draggedPos.width, height: draggedPos.height }
              : el
          )
        );
      }
      setResizingImage(null);
      setDraggedElementsPositions({});
      return;
    }

    if (isDrawing && (selectedTool === 'pen' || selectedTool === 'eraser' || selectedTool === 'highlighter')) {
      setIsDrawing(false);
      if (currentPath.length > 1) {
        onDrawingOrElementComplete({
          type: 'stroke',
          color: selectedTool === 'highlighter' ? strokeColor : (selectedTool === 'pen' ? strokeColor : 'rgba(0,0,0,0)'),
          lineWidth: selectedTool === 'eraser' ? lineWidth * 1.5 : (selectedTool === 'highlighter' ? lineWidth * 3 : lineWidth),
          path: currentPath,
          isEraser: selectedTool === 'eraser',
          isHighlighter: selectedTool === 'highlighter',
          id: Date.now()
        });
      }
      setCurrentPath([]);
      
    } else if (draggingElement && draggingElement.ids && draggingElement.initialPositions) {
      // Commit the dragged positions to the actual elements
      const deltaX = x - draggingElement.initialMouseX;
      const deltaY = y - draggingElement.initialMouseY;
      
      updateElementsAndHistory(prevElements =>
        prevElements.map(el => {
          const initialPos = draggingElement.initialPositions.find(p => p.id === el.id);
          if (initialPos) {
            if (el.type === 'line' || el.type === 'arrow' || el.type === 'triangle') {
              return {
                ...el,
                x: initialPos.x + deltaX,
                y: initialPos.y + deltaY,
                endX: initialPos.endX + deltaX,
                endY: initialPos.endY + deltaY
              };
            }
            return {
              ...el,
              x: initialPos.x + deltaX,
              y: initialPos.y + deltaY
            };
          }
          return el;
        })
      );
      
      // Clear dragging states
      setDraggingElement(null);
      setDraggedElementsPositions({});
      
    } else if (currentShape && shapeStartPoint) {
      const distance = Math.sqrt(Math.pow(x - shapeStartPoint.x, 2) + Math.pow(y - shapeStartPoint.y, 2));
      
      if (distance > 5) { // Minimum size threshold
        let newElement = {
          type: currentShape,
          strokeColor,
          fillColor,
          lineWidth,
          id: Date.now()
        };
        
        if (currentShape === 'rectangle') {
          newElement = {
            ...newElement,
            x: Math.min(shapeStartPoint.x, x),
            y: Math.min(shapeStartPoint.y, y),
            width: Math.abs(x - shapeStartPoint.x),
            height: Math.abs(y - shapeStartPoint.y)
          };
        } else if (currentShape === 'circle') {
          newElement = {
            ...newElement,
            x: shapeStartPoint.x,
            y: shapeStartPoint.y,
            radius: distance
          };
        } else if (currentShape === 'triangle' || currentShape === 'line' || currentShape === 'arrow') {
          newElement = {
            ...newElement,
            x: shapeStartPoint.x,
            y: shapeStartPoint.y,
            endX: x,
            endY: y
          };
        }
        
        onDrawingOrElementComplete(newElement);
      }
      
      setShapeStartPoint(null);
      setCurrentShape(null);
      
    } else if (isSelecting && selectionRect) {
      const elementsInSelection = getElementsInRect(selectionRect);
      
      if (elementsInSelection.length > 0) {
        const newSelectedIds = elementsInSelection.map(el => el.id);
        if (event.shiftKey || (event.touches && event.touches.length > 1)) {
          setSelectedElements(prev => [...new Set([...prev, ...newSelectedIds])]);
        } else {
          setSelectedElements(newSelectedIds);
        }
      }
      
      setIsSelecting(false);
      setSelectionRect(null);
      setShapeStartPoint(null);
    }
  };

  // Cursor styling - Enhanced with dragging states
  let canvasCursor = 'auto';
  if (editingElementId) {
    canvasCursor = 'text';
  } else if (rotatingImage) {
    canvasCursor = 'grabbing';
  } else if (resizingImage) {
    const handle = resizingImage.handle;
    if (handle === 'nw' || handle === 'se') canvasCursor = 'nwse-resize';
    else if (handle === 'ne' || handle === 'sw') canvasCursor = 'nesw-resize';
  } else if (selectedTool === 'pen') {
    canvasCursor = 'crosshair';
  } else if (selectedTool === 'eraser') {
    canvasCursor = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><circle cx='10' cy='10' r='8' fill='white' stroke='black' stroke-width='2'/></svg>") 10 10, auto`;
  } else if (selectedTool === 'sticky') {
    canvasCursor = 'cell';
  } else if (selectedTool === 'select') {
    if (draggingElement) {
      canvasCursor = 'grabbing';
    } else {
      canvasCursor = 'default';
    }
  } else if (['rectangle', 'circle', 'triangle', 'line', 'arrow', 'text'].includes(selectedTool)) {
    canvasCursor = 'crosshair';
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (document.activeElement && 
          (document.activeElement.tagName === 'TEXTAREA' || 
           document.activeElement.tagName === 'INPUT')) {
        return;
      }
      
      if ((event.key === 'Delete' || event.key === 'Backspace') && 
          selectedElements.length > 0 && !editingElementId) {
        event.preventDefault();
        updateElementsAndHistory(prevElements =>
          prevElements.filter(el => !selectedElements.includes(el.id))
        );
        setSelectedElements([]);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElements, editingElementId, updateElementsAndHistory]);

  return (
    <div className="canvas-wrapper">
      <canvas
        ref={canvasRef}
        id="main-canvas"
        style={{ cursor: canvasCursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={(event) => {
          if (isDrawing || draggingElement || isSelecting || currentShape) {
            handleMouseUp({
              preventDefault: () => {},
              clientX: mousePosition.x + (canvasRef.current?.getBoundingClientRect().left || 0),
              clientY: mousePosition.y + (canvasRef.current?.getBoundingClientRect().top || 0),
              touches: event.touches
            });
          }
        }}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
      />
    </div>
  );
});

export default Canvas;