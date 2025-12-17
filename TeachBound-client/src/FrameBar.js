// src/FrameBar.js
import React from 'react';
import './FrameBar.css'; // You'll create this CSS file

const FrameBar = () => {
  return (
    <div className="framebar-container">
      <button>Prev</button>
      <span>Frame 1 / 1</span>
      <button>Next</button>
      <button>+</button> {/* Add Frame */}
    </div>
  );
};

export default FrameBar;