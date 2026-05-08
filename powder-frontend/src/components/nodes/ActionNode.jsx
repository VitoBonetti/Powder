import React from 'react';
import { Handle, Position } from '@xyflow/react';

// SVG Icons mapping for Pentest Phases
const PhaseIcons = {
  Reconnaissance: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
  Enumeration: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>,
  Exploitation: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>,
  "Post-Exploitation": <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>,
  Reporting: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
  Default: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
};

export default function ActionNode({ id, data, positionAbsoluteX, positionAbsoluteY }) {
  const status = data.status || 'action';
  const meta = data.meta_tags || {};
  const phase = meta.category || 'Reconnaissance';

  // n8n style: Clean white box, color comes from the icon and border stroke
  const getStyles = (nodeStatus) => {
    switch (nodeStatus) {
      case 'path': return { icon: '#16a34a', border: '#22c55e', text: '#166534', subBg: '#dcfce7' };
      case 'rabbit_hole': return { icon: '#64748b', border: '#cbd5e1', text: '#475569', subBg: '#f1f5f9' };
      case 'vulnerability': return { icon: '#dc2626', border: '#ef4444', text: '#991b1b', subBg: '#fee2e2' };
      case 'action':
      default: return { icon: '#0ea5e9', border: '#cbd5e1', text: '#0f172a', subBg: '#f8fafc' };
    }
  };
  const styles = getStyles(status);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: '160px' }}>

      {/* Delete Button */}
      <button
        onClick={(e) => { e.stopPropagation(); if (data.onDeleteNode) data.onDeleteNode(id); }}
        style={{
          position: 'absolute', top: '-10px', left: '35px', zIndex: 20, width: '22px', height: '22px',
          backgroundColor: '#ffffff', color: '#ef4444', border: '1px solid #e2e8f0', borderRadius: '50%', cursor: 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
        title="Delete Node"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>

      {/* Main Square Icon Box (n8n style) */}
      <div style={{
          width: '72px', height: '72px', backgroundColor: '#ffffff',
          border: `2px solid ${styles.border}`, borderRadius: '14px',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', color: styles.icon, position: 'relative'
      }}>
        {PhaseIcons[phase] || PhaseIcons.Default}

        {/* Handles MUST be attached to the box edges */}
        <Handle type="target" position={Position.Left} style={{ width: '8px', height: '8px', background: '#fff', border: '2px solid #94a3b8', left: '-5px' }} />
        <Handle type="source" position={Position.Right} style={{ width: '8px', height: '8px', background: '#fff', border: '2px solid #94a3b8', right: '-5px' }} />
      </div>

      {/* Add Button */}
      <button
        onClick={(e) => { e.stopPropagation(); if (data.onAddNode) data.onAddNode(id, positionAbsoluteX, positionAbsoluteY); }}
        style={{
          position: 'absolute', right: '30px', top: '25px', zIndex: 20, width: '22px', height: '22px',
          backgroundColor: '#ffffff', color: '#0ea5e9', border: '1px solid #e2e8f0', borderRadius: '50%', cursor: 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
        title="Add Action"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>

      {/* Text Below */}
      <div style={{ marginTop: '8px', textAlign: 'center' }}>
        <div style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>{data.title}</div>
        {data.command && (
          <div style={{ fontSize: '11px', color: styles.text, background: styles.subBg, padding: '2px 6px', borderRadius: '4px', marginTop: '4px', fontFamily: 'monospace', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.command}
          </div>
        )}
      </div>
    </div>
  );
}