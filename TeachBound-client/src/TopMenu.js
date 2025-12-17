// src/TopMenu.js
import React from 'react';
import './TopMenu.css';
import { Undo, Redo, Trash2, Download } from 'lucide-react';

const TopMenu = ({ onUndo, onRedo, onClearFrame, canUndo, canRedo, onDownloadPNG }) => {
  return (
    <div className="top-menu-container">
      <button onClick={onUndo} disabled={!canUndo} className="menu-button" title="Undo">
        <Undo size={18} /> Undo
      </button>
      <button onClick={onRedo} disabled={!canRedo} className="menu-button" title="Redo">
        <Redo size={18} /> Redo
      </button>
      <button onClick={onClearFrame} className="menu-button" title="Clear Frame">
        <Trash2 size={18} /> Clear
      </button>
      <button onClick={onDownloadPNG} className="menu-button" title="Download as PNG">
        <Download size={18} /> Download PNG
      </button>
      {/* Zoom, Background, Frames buttons can be added here later */}
    </div>
  );
};

export default TopMenu;