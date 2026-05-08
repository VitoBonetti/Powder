import React, { useState, useEffect } from 'react';
import { NodeResizer } from '@xyflow/react';

const STICKY_COLORS = [
  '#fef08a', // Yellow
  '#bbf7d0', // Green
  '#bae6fd', // Blue
  '#fbcfe8', // Pink
  '#e9d5ff', // Purple
  '#e2e8f0', // Slate
];

export default function StickyNoteNode({ id, data, selected }) {
  const [text, setText] = useState(data.note || '');
  const [color, setColor] = useState(data.color || '#fef08a');

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
    // dark:brightness-90 dark:saturate-75 gently dims the pastel colors in dark mode
    <div
      className={`w-full h-full rounded-lg p-4 flex flex-col relative transition-all dark:brightness-90 dark:saturate-[0.85] ${selected ? 'shadow-md border-2 border-slate-400/50' : 'shadow-sm border-2 border-transparent'}`}
      style={{ backgroundColor: color }}
    >
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
        className={`absolute -top-[10px] -right-[10px] z-20 w-[22px] h-[22px] bg-white text-red-500 border border-slate-200 rounded-full cursor-pointer flex justify-center items-center shadow-sm hover:bg-red-50 transition-colors ${selected ? 'flex' : 'hidden'}`}
        title="Delete Sticky Note"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>

      {/* Text Area - Forced to text-slate-800 so it reads clearly on pastels */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        placeholder="Type your notes here..."
        className="nodrag nopan flex-1 w-full bg-transparent border-none outline-none resize-none text-[15px] font-sans text-slate-800 leading-relaxed placeholder:text-slate-500"
      />

      {/* Color Picker */}
      {selected && (
        <div className="flex gap-1.5 mt-2 justify-center p-1 bg-white/40 rounded-md">
          {STICKY_COLORS.map((c) => (
            <div
              key={c}
              onClick={(e) => { e.stopPropagation(); handleColorChange(c); }}
              className={`w-4 h-4 rounded-full cursor-pointer box-border transition-transform hover:scale-110 ${color === c ? 'border-2 border-slate-800' : 'border border-black/10'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}