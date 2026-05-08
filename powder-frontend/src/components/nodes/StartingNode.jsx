import React from 'react';
import { Handle, Position } from '@xyflow/react';

export default function StartingNode({ id, data, positionAbsoluteX, positionAbsoluteY }) {
  const meta = data.meta_tags || {};
  const testType = meta.test_type || 'Unknown Scope';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: '160px' }}>

      {/* Box */}
      <div style={{
          width: '72px', height: '72px', backgroundColor: '#ffffff',
          border: '2px solid #0ea5e9', borderRadius: '14px',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', color: '#0ea5e9', position: 'relative'
      }}>
        {/* Planning Icon */}
        <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="M9 14h6"></path><path d="M9 18h6"></path><path d="M9 10h.01"></path></svg>
        <Handle type="source" position={Position.Right} style={{ width: '8px', height: '8px', background: '#fff', border: '2px solid #94a3b8', right: '-5px' }} />
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); if (data.onAddNode) data.onAddNode(id, positionAbsoluteX, positionAbsoluteY); }}
        style={{
          position: 'absolute', right: '35px', top: '25px', zIndex: 20, width: '22px', height: '22px',
          backgroundColor: '#ffffff', color: '#0ea5e9', border: '1px solid #e2e8f0', borderRadius: '50%', cursor: 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
        title="Add Action"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>

      {/* Text Below */}
      <div style={{ marginTop: '8px', textAlign: 'center' }}>
        <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>{data.title}</div>
        <div style={{ fontSize: '11px', color: '#0ea5e9', fontWeight: '600', marginTop: '2px' }}>{testType}</div>
      </div>
    </div>
  );
}