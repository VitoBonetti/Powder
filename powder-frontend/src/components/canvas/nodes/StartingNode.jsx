import React from 'react';
import { Handle, Position } from '@xyflow/react';

export default function StartingNode({ id, data, selected }) {
  // Read scope info from markdown frontmatter if it exists
  const scope = data.scope || 'Target Scope';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: '160px' }}>
      {/* Box */}
      <div style={{
          width: '72px', height: '72px', backgroundColor: '#ffffff',
          border: `2px solid ${selected ? '#000' : '#0ea5e9'}`, borderRadius: '14px',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          boxShadow: selected ? '0 0 0 4px rgba(14,165,233,0.2)' : '0 4px 6px -1px rgba(0,0,0,0.05)',
          color: '#0ea5e9', position: 'relative'
      }}>
        {/* Planning Icon */}
        <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="M9 14h6"></path><path d="M9 18h6"></path><path d="M9 10h.01"></path></svg>

        {/* Only has a Source Handle (it's the start!) */}
        <Handle type="source" position={Position.Right} style={{ width: '8px', height: '8px', background: '#fff', border: '2px solid #94a3b8', right: '-5px' }} />
      </div>

      <div style={{ marginTop: '8px', textAlign: 'center' }}>
        <div style={{ fontWeight: '700', fontSize: '13px', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
          {data.title.replace('.md', '').replace(/_/g, ' ')}
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>
          {scope}
        </div>
      </div>
    </div>
  );
}