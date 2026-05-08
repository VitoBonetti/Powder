import React, { useState, useEffect } from 'react';
import { NodeResizer } from '@xyflow/react';

// Soft pastel colors matching the new light theme
const STICKY_COLORS = [
  '#fef08a', // Yellow (Default)
  '#bbf7d0', // Green
  '#bae6fd', // Blue
  '#fbcfe8', // Pink
  '#e9d5ff', // Purple
  '#e2e8f0', // Slate/Gray
];

export default function StickyNoteNode({ id, data, selected }) {
  const [text, setText] = useState(data.note || '');
  const [color, setColor] = useState(data.color || '#fef08a');

  // Sync state if it updates externally
  useEffect(() => {
    setText(data.note || '');
    if (data.color) setColor(data.color);
  }, [data.note, data.color]);

  const handleBlur = () => {
     if (text !== data.note && data.onTextChange) {
       data.onTextChange(id, text);
     }
  };

  const handleColorChange = (newColor) => {
    setColor(newColor);
    if (data.onColorChange) {
      data.onColorChange(id, newColor);
    }
  };

  return (
    <div style={{
      width: '100%', height: '100%',
      backgroundColor: color,
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
      border: selected ? '2px solid rgba(0,0,0,0.2)' : '2px solid transparent',
      boxSizing: 'border-box',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <NodeResizer
        color="rgba(0,0,0,0.3)"
        isVisible={selected}
        minWidth={150}
        minHeight={150}
        onResizeStop={(event, params) => {
          if (data.onResize) data.onResize(id, params.width, params.height);
        }}
      />

      {/* Delete Button */}
      <button
        onClick={(e) => { e.stopPropagation(); if (data.onDeleteNode) data.onDeleteNode(id, true); }}
        style={{
          position: 'absolute', top: '-10px', right: '-10px', zIndex: 20, width: '22px', height: '22px',
          backgroundColor: '#ffffff', color: '#ef4444', border: '1px solid #e2e8f0', borderRadius: '50%',
          cursor: 'pointer', display: selected ? 'flex' : 'none', justifyContent: 'center', alignItems: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
        title="Delete Sticky Note"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>

      {/* Text Area */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        placeholder="Type your notes here..."
        className="nodrag nopan"
        style={{
          flex: 1, width: '100%', background: 'transparent', border: 'none',
          outline: 'none', resize: 'none', fontSize: '15px', fontFamily: 'system-ui, sans-serif',
          color: '#334155', lineHeight: '1.5'
        }}
      />

      {/* NEW: Color Picker (Visible only when selected) */}
      {selected && (
        <div style={{
          display: 'flex', gap: '6px', marginTop: '8px',
          justifyContent: 'center', padding: '4px',
          background: 'rgba(255,255,255,0.4)', borderRadius: '6px'
        }}>
          {STICKY_COLORS.map((c) => (
            <div
              key={c}
              onClick={(e) => { e.stopPropagation(); handleColorChange(c); }}
              style={{
                width: '16px', height: '16px', borderRadius: '50%', backgroundColor: c,
                border: color === c ? '2px solid #334155' : '1px solid rgba(0,0,0,0.1)',
                cursor: 'pointer', boxSizing: 'border-box'
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}