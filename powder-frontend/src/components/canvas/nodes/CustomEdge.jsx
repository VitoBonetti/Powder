import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import { Trash2, Tag } from 'lucide-react';

export default function CustomEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, markerEnd, data, selected
}) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      {/* interactionWidth=20 makes the line 20x easier to click without hitting the nodes! */}
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} interactionWidth={20} />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            // The menu appears when you click the edge!
            opacity: selected ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
            zIndex: selected ? 100 : 0
          }}
          className="flex gap-1 bg-[#161b22] border border-gray-700 p-1 rounded-md shadow-xl"
        >
          <button
            onClick={(e) => { e.stopPropagation(); data.onLabel && data.onLabel(id); }}
            className="text-gray-400 hover:text-blue-400 p-1 rounded hover:bg-gray-800 transition-colors"
            title="Add Label"
          >
            <Tag size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); data.onDelete && data.onDelete(id, data.sourceNode, data.targetNode); }}
            className="text-gray-400 hover:text-red-400 p-1 rounded hover:bg-gray-800 transition-colors"
            title="Delete Edge"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}