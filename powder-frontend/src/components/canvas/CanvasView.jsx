import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getApiUrl } from '../../config';
import StickyNoteNode from './nodes/StickyNoteNode';
// Import Powder's native editor!
import Editor from '../Editor';
import { X } from 'lucide-react';

export default function CanvasView() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");

  const nodeTypes = useMemo(() => ({ sticky_note: StickyNoteNode }), []);

  // 1. Fetch nodes from the backend (We will build this backend route next!)
  useEffect(() => {
    fetch(getApiUrl('/canvas/data'), { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setNodes(data.nodes);
        setEdges(data.edges);
      })
      .catch(err => console.error("Failed to load canvas data", err));
  }, []);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  // 2. Handle Node Movement (Save X/Y to Markdown Frontmatter)
  const onNodeDragStop = useCallback((event, node) => {
    fetch(getApiUrl(`/canvas/node/${encodeURIComponent(node.id)}/position`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ x: Math.round(node.position.x), y: Math.round(node.position.y) })
    });
  }, []);

  // 3. Handle Node Clicks (Open the Powder Editor Drawer)
  const onNodeClick = useCallback((event, node) => {
    setSelectedFile(node.id); // In Powder, the node ID is the actual file path!
    fetch(getApiUrl(`/notes/${node.id}`), { credentials: 'include' })
      .then(res => res.json())
      .then(data => setFileContent(data.content))
      .catch(err => console.error("Failed to load note content", err));
  }, []);

  // 4. Handle Drawer Edits (Standard Powder Save logic)
  const handleEditorChange = (newContent) => {
    setFileContent(newContent);
    // In a full implementation, we'd wrap this in your useAutoSave hook!
    fetch(getApiUrl(`/notes/${selectedFile}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content: newContent })
    });
  };

  return (
    <div className="w-full h-full relative flex bg-[#010409] rounded-xl overflow-hidden border border-gray-800">

      {/* REACT FLOW CANVAS */}
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

      {/* THE POWDER EDITOR DRAWER */}
      {selectedFile && (
        <div className="w-1/3 h-full bg-[#0d1117] border-l border-gray-800 flex flex-col shadow-2xl z-50">
          <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#161b22]">
            <h3 className="text-sm font-bold text-blue-400 truncate pr-4">{selectedFile.split('/').pop()}</h3>
            <button onClick={() => setSelectedFile(null)} className="text-gray-500 hover:text-white"><X className="w-5 h-5"/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 hide-scroll">
            {/* BOOM! We drop your main app Editor right into the drawer! */}
            <Editor
              content={fileContent}
              onChange={handleEditorChange}
              onLinkClick={(link) => console.log("Link clicked in drawer:", link)}
              onTagClick={(tag) => console.log("Tag clicked in drawer:", tag)}
            />
          </div>
        </div>
      )}

    </div>
  );
}