import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ReactFlow, Background, Controls, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getApiUrl } from '../../config';

// 1. IMPORT BOTH NODE TYPES
import StickyNoteNode from './nodes/StickyNoteNode';
import ActionNode from './nodes/ActionNode';

import Editor from '../Editor';
import { X, ExternalLink } from 'lucide-react';

export default function CanvasView() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");

  // 2. TELL REACT FLOW HOW TO DRAW THE SCANS
  const nodeTypes = useMemo(() => ({
    sticky_note: StickyNoteNode,
    scan_result: ActionNode
  }), []);

  useEffect(() => {
    fetch(getApiUrl('/canvas/data'), { credentials: 'include' })
      .then(res => res.json())
      .then(data => { setNodes(data.nodes); setEdges(data.edges); })
      .catch(err => console.error("Failed to load canvas data", err));
  }, []);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const onNodeDragStop = useCallback((event, node) => {
    fetch(getApiUrl(`/canvas/node/${encodeURIComponent(node.id)}/position`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ x: Math.round(node.position.x), y: Math.round(node.position.y) })
    });
  }, []);

  const onNodeClick = useCallback((event, node) => {
    setSelectedFile(node.id);
    fetch(getApiUrl(`/notes/${node.id}`), { credentials: 'include' })
      .then(res => res.json())
      .then(data => setFileContent(data.content))
      .catch(err => console.error("Failed to load note content", err));
  }, []);

  const handleEditorChange = (newContent) => {
    setFileContent(newContent);
    fetch(getApiUrl(`/notes/${selectedFile}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content: newContent })
    });
  };

  return (
    <div className="w-full h-full relative flex bg-[#010409] rounded-xl overflow-hidden border border-gray-800">

      <div className="flex-1 h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          fitView
          theme="dark"
        >
          <Background color="#30363d" gap={16} />
          <Controls className="bg-gray-800 border-gray-700 fill-white" />
        </ReactFlow>
      </div>

      {/* 3. FIX THE DRAWER LAYOUT */}
      {selectedFile && (
        <div className="w-[45%] max-w-[800px] min-w-[500px] h-full bg-[#0d1117] border-l border-gray-800 flex flex-col shadow-2xl z-50 transition-all">

          {/* Drawer Header */}
          <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#161b22]">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Editing Node</span>
              <h3 className="text-sm font-medium text-emerald-400 truncate pr-4">{selectedFile.split('/').pop()}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button title="Open in Main Tab" className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors"><ExternalLink className="w-4 h-4"/></button>
              <button onClick={() => setSelectedFile(null)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"><X className="w-5 h-5"/></button>
            </div>
          </div>

          {/* Drawer Body (Given a custom class to tweak editor styles if needed) */}
          <div className="flex-1 overflow-y-auto px-6 py-4 hide-scroll bg-[#0d1117]">
            <Editor
              content={fileContent}
              onChange={handleEditorChange}
              onLinkClick={() => {}}
              onTagClick={() => {}}
            />
          </div>
        </div>
      )}

    </div>
  );
}