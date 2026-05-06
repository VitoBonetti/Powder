import React, { useState, useEffect } from 'react';

const STICKY_COLORS = ['#fef08a', '#bbf7d0', '#bae6fd', '#fbcfe8', '#e9d5ff', '#e2e8f0'];

export default function StickyNoteNode({ id, data, selected }) {
  const [text, setText] = useState(data.note || '');
  const [color, setColor] = useState(data.color || '#fef08a');

  useEffect(() => {
    setText(data.note || '');
    if (data.color) setColor(data.color);
  }, [data.note, data.color]);

  return (
    <div style={{
      width: '200px', minHeight: '150px', backgroundColor: color,
      padding: '12px', borderRadius: '8px', boxShadow: selected ? '0 0 0 2px #3b82f6, 0 10px 15px -3px rgba(0,0,0,0.1)' : '0 4px 6px -1px rgba(0,0,0,0.1)',
      display: 'flex', flexDirection: 'column', position: 'relative', transition: 'all 0.2s ease'
    }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => data.onTextChange && data.onTextChange(id, text)}
        placeholder="Type your notes here..."
        className="nodrag nopan"
        style={{
          flex: 1, width: '100%', background: 'transparent', border: 'none',
          outline: 'none', resize: 'none', fontSize: '15px', color: '#334155'
        }}
      />
      {selected && (
        <div className="flex gap-1 mt-2 justify-center p-1 bg-white/40 rounded-md">
          {STICKY_COLORS.map((c) => (
            <div key={c} onClick={() => setColor(c)} style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: c, cursor: 'pointer', border: color === c ? '2px solid #334155' : '1px solid rgba(0,0,0,0.1)' }} />
          ))}
        </div>
      )}
    </div>
  );
}