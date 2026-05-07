import React from 'react';
import { Handle, Position } from '@xyflow/react';

export default function StartingNode({ id, data, selected }) {
  // Read scope info from markdown frontmatter if it exists
  const scope = data.scope || 'Target Scope';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: '160px' }}>
      {/* Box */}
      <div style={{
          width: '36px', height: '36px', backgroundColor: '#ffffff',
          border: `2px solid ${selected ? '#000' : '#0ea5e9'}`, borderRadius: '14px',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          boxShadow: selected ? '0 0 0 4px rgba(14,165,233,0.2)' : '0 4px 6px -1px rgba(0,0,0,0.05)',
          color: '#0ea5e9', position: 'relative'
      }}>
        {/* Planning Icon */}
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
        {/* Only has a Source Handle (it's the start!) */}
        <Handle type="source" position={Position.Right} style={{ width: '6px', height: '6px', background: '#fff', border: '2px solid #94a3b8', right: '-4px' }} />
      </div>

      <div style={{ marginTop: '6px', textAlign: 'center' }}>
        <div style={{ fontWeight: '700', fontSize: '11px', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
          {data.title.replace('.md', '').replace(/_/g, ' ')}
        </div>
        <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px', textTransform: 'uppercase',  fontWeight: '600' }}>
          {scope}
        </div>
      </div>
    </div>
  );
}