// src/App.js
import React, { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';
import Toolbar from './Toolbar';
import Canvas from './Canvas';
import {
  addP2PEventListener,
  getP2PNode,
  publishP2PEvent,
  scheduleStopP2P,
  startP2P,
} from './p2p/startP2P';
import { P2P_EVENT_TYPES } from './p2p/protocol';
import { generateElementId } from './utils/ids';
// --- App Name & Slogan ---
const APP_NAME = 'Teach Bound';
const APP_SUBTITLE = 'Digital White Board';

// --- P2P Configuration from localStorage ---
const P2P_CONFIG_KEY = 'teachbound-p2p-config';

function getP2PConfig() {
  try {
    const saved = localStorage.getItem(P2P_CONFIG_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load P2P config from localStorage:', e);
  }
  return null;
}

function setP2PConfig(config) {
  try {
    localStorage.setItem(P2P_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save P2P config to localStorage:', e);
  }
}

function promptForP2PConfig(existingConfig = null) {
  try {
    const defaultAddr = existingConfig?.signalingAddr || '';
    const defaultRoom = existingConfig?.room || '';

    const signalingAddr = window.prompt(
      'Enter P2P signaling server address:\n(e.g. /ip4/127.0.0.1/tcp/9090/ws/p2p/12D3KooW...)',
      defaultAddr
    );

    if (signalingAddr === null) {
      return null; // User cancelled
    }

    if (!signalingAddr.trim()) {
      window.alert('Signaling address is required for P2P mode.');
      return null;
    }

    const room = window.prompt(
      'Enter room name (optional, leave empty for default):',
      defaultRoom
    );

    if (room === null) {
      return null; // User cancelled
    }

    const config = {
      signalingAddr: signalingAddr.trim(),
      room: room.trim() || null,
    };

    setP2PConfig(config);
    return config;
  } catch (e) {
    console.warn('Failed to prompt for P2P config:', e);
    return null;
  }
}

function App() {
  const [p2pConfig, setP2pConfigState] = useState(() => getP2PConfig());
  const [p2pConfigVersion, setP2pConfigVersion] = useState(0);
  const [p2pStatus, setP2pStatus] = useState({
    state: 'disabled', // disabled | starting | running | error
    peerId: null,
    peers: 0,
    error: null,
    room: null,
    topic: null,
    sync: 'idle', // idle | requesting | synced
    lastSyncAt: null,
  });

  // Handler to change P2P settings
  const handleChangeP2PSettings = useCallback(() => {
    const newConfig = promptForP2PConfig(p2pConfig);
    if (newConfig) {
      setP2pConfigState(newConfig);
      setP2pConfigVersion((v) => v + 1); // Force reconnection
    }
  }, [p2pConfig]);

  const isApplyingRemoteRef = useRef(false);
  const suppressBroadcastOnceRef = useRef(false);
  const hasLocalEditsSinceP2PStartRef = useRef(false);
  const hasAppliedSnapshotRef = useRef(false);
  const didRequestSnapshotRef = useRef(false);
  const snapshotCandidateRef = useRef(null); // { elements: any[], count: number }
  const snapshotTimerRef = useRef(null);
  const elementsRef = useRef([]);

  // Keep a ref to the latest updateElementsAndHistory to avoid stale closures in p2p listeners.
  const updateElementsAndHistoryRef = useRef(null);

  const applyRemoteP2PEvent = useCallback((evt) => {
    const node = getP2PNode();
    const myPeerId = node?.peerId?.toString?.() ?? (node?.peerId ? String(node.peerId) : null);
    if (myPeerId && evt?.from === myPeerId) return;

    if (!evt || typeof evt.type !== 'string') return;

    switch (evt.type) {
      case P2P_EVENT_TYPES.SNAPSHOT_REQUEST: {
        // Broadcast response with the current board state.
        try {
          publishP2PEvent(P2P_EVENT_TYPES.SNAPSHOT_RESPONSE, {
            elements: Array.isArray(elementsRef.current) ? elementsRef.current : [],
          });
        } catch (err) {
          console.debug('[P2P] failed to publish snapshot response', err);
        }
        return;
      }

      case P2P_EVENT_TYPES.SNAPSHOT_RESPONSE: {
        if (hasAppliedSnapshotRef.current) return;
        if (hasLocalEditsSinceP2PStartRef.current) return;

        const incoming = evt?.payload?.elements;
        if (!Array.isArray(incoming)) return;

        const candidate = { elements: incoming, count: incoming.length };
        const best = snapshotCandidateRef.current;
        if (!best || candidate.count > best.count) snapshotCandidateRef.current = candidate;

        if (snapshotTimerRef.current == null) {
          snapshotTimerRef.current = window.setTimeout(() => {
            snapshotTimerRef.current = null;

            // If the user made local edits while we waited, don't overwrite them.
            if (hasLocalEditsSinceP2PStartRef.current) {
              snapshotCandidateRef.current = null;
              return;
            }
            if (hasAppliedSnapshotRef.current) {
              snapshotCandidateRef.current = null;
              return;
            }

            const chosen = snapshotCandidateRef.current;
            snapshotCandidateRef.current = null;
            if (!chosen) return;

            hasAppliedSnapshotRef.current = true;
            didRequestSnapshotRef.current = true;

            isApplyingRemoteRef.current = true;
            try {
              setHistory([chosen.elements]);
              setHistoryStep(0);
              canvasRef.current?.clearSelection?.();
              setP2pStatus((prev) => ({
                ...prev,
                sync: 'synced',
                lastSyncAt: Date.now(),
              }));
            } finally {
              isApplyingRemoteRef.current = false;
            }
          }, 1000);
        }

        return;
      }

      case P2P_EVENT_TYPES.ELEMENT_UPSERT: {
        const incoming = evt?.payload?.elements;
        if (!Array.isArray(incoming) || incoming.length === 0) return;

        suppressBroadcastOnceRef.current = true;
        updateElementsAndHistoryRef.current?.((prevElements) => {
          const indexById = new Map(prevElements.map((el, idx) => [String(el.id), idx]));
          const next = [...prevElements];

          for (const el of incoming) {
            if (!el || el.id == null) continue;
            const key = String(el.id);
            const idx = indexById.get(key);
            if (idx == null) {
              indexById.set(key, next.length);
              next.push(el);
            } else {
              next[idx] = el;
            }
          }

          return next;
        });
        return;
      }

      case P2P_EVENT_TYPES.ELEMENT_DELETE: {
        const ids = evt?.payload?.ids;
        if (!Array.isArray(ids) || ids.length === 0) return;
        const idsSet = new Set(ids.map((id) => String(id)));

        suppressBroadcastOnceRef.current = true;
        updateElementsAndHistoryRef.current?.((prevElements) =>
          prevElements.filter((el) => !idsSet.has(String(el.id)))
        );
        return;
      }

      case P2P_EVENT_TYPES.CANVAS_CLEAR: {
        isApplyingRemoteRef.current = true;
        try {
          setHistory([[]]);
          setHistoryStep(0);
          canvasRef.current?.clearSelection?.();
        } finally {
          isApplyingRemoteRef.current = false;
        }
        return;
      }

      default:
        return;
    }
  }, []);

  useEffect(() => {
    // If no config is set, show disabled state (user can click Configure button)
    if (!p2pConfig?.signalingAddr) {
      console.warn('No P2P signaling address configured - click Configure to set up');
      setP2pStatus((prev) => ({ ...prev, state: 'disabled' }));
      return;
    }

    const bootstrapAddr = p2pConfig.signalingAddr;
    const room = p2pConfig.room;
    const topic = room ? `teachbound/${room}` : undefined;

    let isActive = true;
    let intervalId = null;
    let removeEventListener = null;

    setP2pStatus({
      state: 'starting',
      peerId: null,
      peers: 0,
      error: null,
      room: room ?? null,
      topic: topic ?? null,
      sync: 'idle',
      lastSyncAt: null,
    });

    startP2P(bootstrapAddr, { topic })
      .then((node) => {
        if (!isActive) return;
        setP2pStatus((prev) => ({
          ...prev,
          state: 'running',
          peerId: node.peerId?.toString?.() ?? String(node.peerId),
        }));

        // Reset snapshot negotiation state for this session.
        hasLocalEditsSinceP2PStartRef.current = false;
        hasAppliedSnapshotRef.current = false;
        didRequestSnapshotRef.current = false;
        snapshotCandidateRef.current = null;
        if (snapshotTimerRef.current != null) {
          window.clearTimeout(snapshotTimerRef.current);
          snapshotTimerRef.current = null;
        }

        removeEventListener = addP2PEventListener(applyRemoteP2PEvent);

        const updatePeers = () => {
          const n = getP2PNode();
          if (!n) return;

          const conns = typeof n.getConnections === 'function' ? n.getConnections() : [];
          const peerSet = new Set();
          for (const c of conns) {
            const rp = c?.remotePeer?.toString?.();
            if (rp) peerSet.add(rp);
          }

          setP2pStatus((prev) => ({
            ...prev,
            peers: peerSet.size,
          }));

          // Late-join sync: request a snapshot once we have at least one peer.
          if (
            peerSet.size > 0 &&
            !didRequestSnapshotRef.current &&
            !hasAppliedSnapshotRef.current &&
            !hasLocalEditsSinceP2PStartRef.current
          ) {
            try {
              setP2pStatus((prev) => ({ ...prev, sync: 'requesting' }));
              publishP2PEvent(P2P_EVENT_TYPES.SNAPSHOT_REQUEST, {});
              didRequestSnapshotRef.current = true;
            } catch (err) {
              console.debug('[P2P] failed to publish snapshot request', err);
            }
          }
        };

        updatePeers();
        intervalId = window.setInterval(updatePeers, 1000);
      })
      .catch((err) => {
        console.error(err);
        if (!isActive) return;
        setP2pStatus({
          state: 'error',
          peerId: null,
          peers: 0,
          error: err?.message ?? String(err),
        });
      });

    return () => {
      isActive = false;
      if (intervalId != null) window.clearInterval(intervalId);
      removeEventListener?.();
      if (snapshotTimerRef.current != null) {
        window.clearTimeout(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
      }
      snapshotCandidateRef.current = null;
      scheduleStopP2P(0);
    };
  }, [applyRemoteP2PEvent, p2pConfig, p2pConfigVersion]);

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
            historyStep: data.historyStep || 0,
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
  // Keep current elements available to p2p listeners without re-subscribing.
  elementsRef.current = elements;

  const canvasRef = useRef(null);

  const [editingElement, setEditingElement] = useState(null);
  const [textAreaPosition, setTextAreaPosition] = useState({ x: 0, y: 0 });
  const textAreaRef = useRef(null);

  // Clipboard state for copy/paste
  const [clipboard, setClipboard] = useState([]);

  // Image drag state
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const updateElementsAndHistory = useCallback(
    (newElementsOrUpdater) => {
      setHistory((prevHistory) => {
        const currentElementsState = prevHistory[historyStep] || [];
        const updatedElementsRaw =
          typeof newElementsOrUpdater === 'function'
            ? newElementsOrUpdater(currentElementsState)
            : newElementsOrUpdater;

        const updatedElements = Array.isArray(updatedElementsRaw) ? updatedElementsRaw : [];

        // Broadcast minimal diffs (upsert/delete) for collaborative mode.
        const suppressBroadcast = suppressBroadcastOnceRef.current || isApplyingRemoteRef.current;
        suppressBroadcastOnceRef.current = false;

        if (!suppressBroadcast && getP2PNode()) {
          try {
            hasLocalEditsSinceP2PStartRef.current = true;
            // If we're about to broadcast local edits, don't allow a pending snapshot to overwrite them.
            if (snapshotTimerRef.current != null) {
              window.clearTimeout(snapshotTimerRef.current);
              snapshotTimerRef.current = null;
            }
            snapshotCandidateRef.current = null;

            setP2pStatus((prev) => (prev.sync === 'synced' ? { ...prev, sync: 'idle' } : prev));

            const before = Array.isArray(currentElementsState) ? currentElementsState : [];
            const after = updatedElements;

            const beforeById = new Map();
            for (const el of before) {
              if (el?.id == null) continue;
              beforeById.set(String(el.id), el);
            }

            const afterById = new Map();
            for (const el of after) {
              if (el?.id == null) continue;
              afterById.set(String(el.id), el);
            }

            const upserts = [];
            for (const el of after) {
              if (el?.id == null) continue;
              const key = String(el.id);
              const prevEl = beforeById.get(key);
              // Compare by content, not reference, to avoid rebroadcasting received elements
              if (!prevEl) {
                upserts.push(el);
              } else if (prevEl !== el) {
                // Only upsert if content actually changed
                const prevJson = JSON.stringify(prevEl);
                const currJson = JSON.stringify(el);
                if (prevJson !== currJson) {
                  upserts.push(el);
                }
              }
            }

            const deletes = [];
            for (const el of before) {
              if (el?.id == null) continue;
              const key = String(el.id);
              if (!afterById.has(key)) deletes.push(el.id);
            }

            if (upserts.length > 0) {
              publishP2PEvent(P2P_EVENT_TYPES.ELEMENT_UPSERT, { elements: upserts });
            }
            if (deletes.length > 0) {
              publishP2PEvent(P2P_EVENT_TYPES.ELEMENT_DELETE, { ids: deletes });
            }
          } catch (err) {
            console.debug('[P2P] failed to publish element diff', err);
          }
        }

        const newHistorySlice = prevHistory.slice(0, historyStep + 1);
        return [...newHistorySlice, updatedElements];
      });
      setHistoryStep((prevStep) => prevStep + 1);
    },
    [historyStep]
  );

  // Assign during render so it's available before effects (avoids missing early p2p events).
  updateElementsAndHistoryRef.current = updateElementsAndHistory;

  const handleP2PResync = useCallback(() => {
    if (!getP2PNode()) return;
    if (p2pStatus.peers <= 0) {
      window.alert('No peers connected yet.');
      return;
    }

    const confirmed = window.confirm(
      'Resync will overwrite your current board with a snapshot from peers. Continue?'
    );
    if (!confirmed) return;

    hasLocalEditsSinceP2PStartRef.current = false;
    hasAppliedSnapshotRef.current = false;
    didRequestSnapshotRef.current = true;
    snapshotCandidateRef.current = null;
    if (snapshotTimerRef.current != null) {
      window.clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }

    setP2pStatus((prev) => ({
      ...prev,
      sync: 'requesting',
    }));

    try {
      publishP2PEvent(P2P_EVENT_TYPES.SNAPSHOT_REQUEST, { reason: 'manual' });
    } catch (err) {
      console.debug('[P2P] failed to publish snapshot request', err);
    }
  }, [p2pStatus.peers]);

  const handleDrawingOrElementComplete = useCallback(
    (newElement) => {
      updateElementsAndHistory((prevElements) => {
        if (newElement.type === 'sticky' && !newElement.text) {
          setEditingElement({ id: newElement.id, text: newElement.text || 'Note...' });
        }
        if (newElement.type === 'text' && !newElement.text) {
          setEditingElement({ id: newElement.id, text: newElement.text || '', isText: true });
        }
        return [...prevElements, newElement];
      });
    },
    [updateElementsAndHistory]
  );

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
    const confirmed = window.confirm(
      '⚠️ CLEAR CANVAS WARNING ⚠️\n\nThis will permanently delete everything on the canvas and cannot be undone.\n\nAre you sure you want to continue?'
    );
    if (confirmed) {
      setHistory([[]]);
      setHistoryStep(0);
      canvasRef.current?.clearSelection?.();

      if (!isApplyingRemoteRef.current && getP2PNode()) {
        try {
          publishP2PEvent(P2P_EVENT_TYPES.CANVAS_CLEAR, {});
        } catch (err) {
          console.debug('[P2P] failed to publish clear event', err);
        }
      }
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
        timestamp: Date.now(),
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
  const handleImageUpload = useCallback(
    (imageData) => {
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
          id: generateElementId(),
          x,
          y,
          width,
          height,
          rotation: 0,
          imageData,
        };

        updateElementsAndHistory((prev) => [...prev, newImage]);
        setSelectedTool('select'); // Switch to select tool after adding image
      };

      img.onerror = () => {
        console.error('Failed to load image');
        alert('Could not load this image format. Please try converting it to PNG or JPEG first.');
      };

      // Set crossOrigin for potential CORS issues
      img.crossOrigin = 'anonymous';
      img.src = imageData;
    },
    [updateElementsAndHistory]
  );

  // Handle file drop - supports all common image formats
  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      setIsDraggingFile(false);

      const file = event.dataTransfer.files?.[0];
      if (!file) return;

      // Check if it's an image file (by type or extension)
      const isImage =
        file.type.startsWith('image/') ||
        /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff?|heic|heif|avif)$/i.test(file.name);

      if (isImage) {
        // For HEIC/HEIF files, try to convert using canvas if browser doesn't support
        const isHeic =
          /\.(heic|heif)$/i.test(file.name) ||
          file.type === 'image/heic' ||
          file.type === 'image/heif';

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
              alert(
                'HEIC/HEIF format is not supported by your browser. Please convert the image to PNG or JPEG first.'
              );
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
    },
    [handleImageUpload]
  );

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
      const pastedElements = clipboard.map((el) => ({
        ...el,
        id: generateElementId(), // New unique ID
        x: el.x + offset,
        y: el.y + offset,
        // Adjust end coordinates for shapes
        ...(el.endX !== undefined && { endX: el.endX + offset }),
        ...(el.endY !== undefined && { endY: el.endY + offset }),
        // Adjust path for strokes
        ...(el.path && {
          path: el.path.map((point) => ({
            x: point.x + offset,
            y: point.y + offset,
          })),
        }),
      }));

      updateElementsAndHistory((prevElements) => [...prevElements, ...pastedElements]);
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
  }, [
    selectedTool,
    handleUndo,
    handleRedo,
    handleCopy,
    handlePaste,
    handleDuplicate,
    handleDeleteSelected,
    handleManualSave,
  ]);

  return (
    <div className="App">
      <header className="app-header">
        <div className="app-title-container">
          <h1 className="app-title">{APP_NAME}</h1>
          <span className="app-subtitle">{APP_SUBTITLE}</span>
        </div>
        <div className="p2p-status">
          <span className="p2p-status-label">P2P:</span>{' '}
          {p2pStatus.state === 'disabled' && (
            <>
              disabled{' '}
              <button
                type="button"
                className="p2p-settings-button"
                onClick={handleChangeP2PSettings}
                title="Configure P2P connection"
              >
                Configure
              </button>
            </>
          )}
          {p2pStatus.state === 'starting' && 'starting…'}
          {p2pStatus.state === 'running' && (
            <>
              running ({p2pStatus.peers} peers){' '}
              {p2pStatus.room && (
                <>
                  · room <code>{p2pStatus.room}</code>{' '}
                </>
              )}
              {p2pStatus.sync && (
                <>
                  · sync <code>{p2pStatus.sync}</code>{' '}
                </>
              )}
              <button
                type="button"
                className="p2p-resync-button"
                onClick={handleP2PResync}
                disabled={p2pStatus.peers <= 0}
                title={
                  p2pStatus.peers <= 0 ? 'No peers connected' : 'Request snapshot from peers'
                }
              >
                Resync
              </button>{' '}
              <button
                type="button"
                className="p2p-settings-button"
                onClick={handleChangeP2PSettings}
                title="Change P2P server settings"
              >
                Settings
              </button>{' '}
              {p2pStatus.peerId && (
                <span className="p2p-status-peerid">
                  peerId <code>{p2pStatus.peerId}</code>
                </span>
              )}
              <span className="p2p-status-peerid">
                · elements <code>{elements.length}</code>
              </span>
            </>
          )}
          {p2pStatus.state === 'error' && (
            <>
              error <code>{p2pStatus.error}</code>{' '}
              <button
                type="button"
                className="p2p-settings-button"
                onClick={handleChangeP2PSettings}
                title="Change P2P server settings"
              >
                Settings
              </button>
            </>
          )}
        </div>
        <p className="app-slogan">
          <a
            href="https://github.com/sai-educ/TeachBound"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open source
          </a>
          , ad-free, and 100% free to use.{' '}
          <a href="https://forms.gle/WShMfsvVaLc34QeaA" target="_blank" rel="noopener noreferrer">
            Please provide feedback or suggestions!
          </a>
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
            backgroundColor: editingElement.isText
              ? 'rgba(255, 255, 255, 0.95)'
              : 'rgba(255, 250, 205, 0.95)',
          }}
          value={editingElement.text}
          onChange={handleTextAreaChange}
          onBlur={handleTextAreaBlur}
          onKeyDown={handleTextAreaKeyDown}
        />
      )}

      {/* Save Indicator */}
      {showSaveIndicator && <div className="save-indicator">✓ Saved</div>}
    </div>
  );
}

export default App;
