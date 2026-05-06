import React from 'react';
import { Handle, Position } from '@xyflow/react';

// YOUR EXACT ICONS FROM PENTESTFLOW
const PhaseIcons = {
  Reconnaissance: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
  Enumeration: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>,
  Exploitation: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>,
  PostExploitation: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>,
  Reporting: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
};

const PhaseColors = {
  Reconnaissance: '#8b5cf6', // Purple
  Enumeration: '#3b82f6',    // Blue
  Exploitation: '#ef4444',   // Red
  PostExploitation: '#f97316',// Orange
  Reporting: '#10b981'       // Green
};

export default function ActionNode({ id, data, selected }) {
  // Read the phase from the Markdown frontmatter, fallback to Enumeration
  const phase = data.phase || 'Enumeration';
  const color = PhaseColors[phase] || '#94a3b8';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: '160px' }}>
      {/* YOUR EXACT BOX DESIGN */}
      <div style={{
          width: '72px', height: '72px', backgroundColor: '#ffffff',
          border: `2px solid ${selected ? '#000' : color}`, borderRadius: '14px',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          boxShadow: selected ? `0 0 0 4px ${color}33` : '0 4px 6px -1px rgba(0,0,0,0.05)',
          color: color, position: 'relative'
      }}>
        {PhaseIcons[phase] || PhaseIcons.Enumeration}

        {/* Handles */}
        <Handle type="target" position={Position.Left} style={{ width: '8px', height: '8px', background: '#fff', border: '2px solid #94a3b8', left: '-5px' }} />
        <Handle type="source" position={Position.Right} style={{ width: '8px', height: '8px', background: '#fff', border: '2px solid #94a3b8', right: '-5px' }} />
      </div>

      {/* YOUR EXACT TEXT DESIGN */}
      <div style={{ marginTop: '8px', textAlign: 'center' }}>
        <div style={{ fontWeight: '700', fontSize: '13px', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
          {data.title.replace('.md', '').replace(/_/g, ' ')}
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>
          {phase}
        </div>
      </div>
    </div>
  );
}