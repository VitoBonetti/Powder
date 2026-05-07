import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import { Trash2, Tag } from 'lucide-react';

export default function CustomEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, markerEnd, data, selected
}) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all', zIndex: selected ? 100 : 0 }}>

          {/* NEW: THE VISIBLE LABEL */}
          {data.label && (
            <div className="bg-[#0d1117] text-gray-300 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-gray-700 shadow-sm cursor-pointer hover:border-blue-500 transition-colors" onClick={() => data.onLabel && data.onLabel(id, data.sourceNode, data.targetNode, data.label)}>
              {data.label}
            </div>
          )}

          {/* THE HOVER MENU */}
          <div style={{ opacity: selected ? 1 : 0, transition: 'opacity 0.2s', position: 'absolute', top: data.label ? '100%' : '50%', left: '50%', transform: 'translate(-50%, 4px)' }} className="flex gap-1 bg-[#161b22] border border-gray-700 p-1 rounded-md shadow-xl mt-1">
            <button onClick={(e) => { e.stopPropagation(); data.onLabel && data.onLabel(id, data.sourceNode, data.targetNode, data.label); }} className="text-gray-400 hover:text-blue-400 p-1 rounded hover:bg-gray-800 transition-colors" title="Add Label"><Tag size={12} /></button>
            <button onClick={(e) => { e.stopPropagation(); data.onDelete && data.onDelete(id, data.sourceNode, data.targetNode); }} className="text-gray-400 hover:text-red-400 p-1 rounded hover:bg-gray-800 transition-colors" title="Delete Edge"><Trash2 size={12} /></button>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}