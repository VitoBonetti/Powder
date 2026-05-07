import React, { useState, useEffect } from 'react';
import { NodeResizer, Handle, Position } from '@xyflow/react';

const STICKY_COLORS = ['#fef08a', '#bbf7d0', '#bae6fd', '#fbcfe8', '#e9d5ff', '#e2e8f0'];

export default function StickyNoteNode({ id, data, selected }) {
  // If text is blank, hide the "# Title" that comes from the markdown default
  const cleanInitialText = data.note ? data.note.replace(/^# .*\n/g, '').trim() : '';

  const [text, setText] = useState(cleanInitialText);
  const [color, setColor] = useState(data.color || '#fef08a');

  useEffect(() => {
    setText(data.note ? data.note.replace(/^# .*\n/g, '').trim() : '');
    if (data.color) setColor(data.color);
  }, [data.note, data.color]);

  const handleBlur = () => {
    // Save to backend when you click away!
    if (data.onUpdate) data.onUpdate(id, text, color);
  };

  const handleColorChange = (newColor) => {
    setColor(newColor);
    // Save to backend instantly when color changes!
    if (data.onUpdate) data.onUpdate(id, text, newColor);
  };

  return (
    <div style={{
      width: '100%', height: '100%', minWidth: '200px', minHeight: '150px',
      backgroundColor: color, padding: '12px', borderRadius: '8px',
      boxShadow: selected ? '0 0 0 2px #3b82f6' : '0 4px 6px -1px rgba(0,0,0,0.1)',
      display: 'flex', flexDirection: 'column'
    }}>
      <NodeResizer color="#3b82f6" isVisible={selected} minWidth={200} minHeight={150} />

      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        placeholder="Type your notes here..."
        className="nodrag nopan"
        style={{ flex: 1, width: '100%', height: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontSize: '15px', color: '#334155' }}
      />

      {selected && (
        <div className="flex gap-1 mt-2 justify-center p-1 bg-white/40 rounded-md nodrag">
          {STICKY_COLORS.map((c) => (
            <div key={c} onClick={(e) => { e.stopPropagation(); handleColorChange(c); }} style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: c, cursor: 'pointer', border: color === c ? '2px solid #334155' : '1px solid rgba(0,0,0,0.1)' }} />
          ))}
        </div>
      )}
    </div>
  );
}