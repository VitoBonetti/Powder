import React, { useState, useEffect, useCallback, useMemo } from 'react';
// ADD addEdge to the import
import { ReactFlow, Background, Controls, applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getApiUrl } from '../../config';

import StickyNoteNode from './nodes/StickyNoteNode';
import ActionNode from './nodes/ActionNode';
import StartingNode from './nodes/StartingNode'; // 1. IMPORT STARTING NODE

import Editor from '../Editor';
import { X, ExternalLink } from 'lucide-react';

export default function CanvasView() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");

  // 2. ADD TO NODE TYPES
  const nodeTypes = useMemo(() => ({
    sticky_note: StickyNoteNode,
    action: ActionNode,
    starting_node: StartingNode
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

  // 3. THE MAGIC TRICK: DRAWING EDGES = WRITING WIKILINKS
  const onConnect = useCallback((params) => {
    // Instantly draw the edge on the screen for the user
    setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: "#3b82f6", strokeWidth: 2 } }, eds));

    // Send to backend to permanently write it into the Markdown file!
    fetch(getApiUrl('/canvas/edge'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ source: params.source, target: params.target })
    }).catch(err => console.error("Failed to save edge:", err));
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

  // Spawns a new Markdown file directly onto the canvas!
  const handleSpawnNode = (nodeType, defaultTitle) => {
    // Generate a unique filename
    const fileName = `${defaultTitle.replace(/\s+/g, '_')}_${Date.now()}.md`;
    const relPath = `Scans/${fileName}`;

    // Create the YAML frontmatter based on what button was clicked
    let frontmatter = `---\ntype: pentest_node\nnode_type: ${nodeType}\nx: 100\ny: 100\n`;

    if (nodeType === 'starting_node') frontmatter += `scope: "Internal Network"\n`;
    if (nodeType === 'action') frontmatter += `phase: "Reconnaissance"\n`;
    if (nodeType === 'sticky_note') frontmatter += `color: "#fef08a"\n`;

    frontmatter += `---\n# ${defaultTitle}\n`;

    // Save it directly to the vault using the exact same logic the Editor uses
    fetch(getApiUrl(`/notes/${relPath}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content: frontmatter })
    }).then(() => {
      // Refresh the canvas to pull the newly created file!
      fetch(getApiUrl('/canvas/data'), { credentials: 'include' })
        .then(res => res.json())
        .then(data => { setNodes(data.nodes); setEdges(data.edges); });
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
          onConnect={onConnect} // 4. WIRE UP THE CONNECTION EVENT
          onNodeClick={onNodeClick}
          fitView
          theme="dark"
        >
          <Background color="#30363d" gap={16} />
          <Controls className="bg-gray-800 border-gray-700 fill-white" />
          <div className="absolute top-4 left-4 z-50 flex gap-2">
            <button
              onClick={() => handleSpawnNode('starting_node', 'New Target Scope')}
              className="bg-[#0ea5e9] text-white px-3 py-2 rounded-lg shadow-lg hover:bg-sky-400 transition flex items-center gap-2 text-sm font-bold"
            >
              + Target Scope
            </button>
            <button
              onClick={() => handleSpawnNode('action', 'New Action')}
              className="bg-[#161b22] border border-gray-700 text-gray-300 px-3 py-2 rounded-lg shadow-lg hover:text-white transition flex items-center gap-2 text-sm font-bold"
            >
              + Action Node
            </button>
            <button
              onClick={() => handleSpawnNode('sticky_note', 'New Note')}
              className="bg-[#fef08a] text-yellow-900 px-3 py-2 rounded-lg shadow-lg hover:bg-yellow-300 transition flex items-center gap-2 text-sm font-bold"
            >
              + Sticky Note
            </button>
          </div>
        </ReactFlow>
      </div>

      {selectedFile && (
        <div className="w-[45%] max-w-[800px] min-w-[500px] h-full bg-[#0d1117] border-l border-gray-800 flex flex-col shadow-2xl z-50 transition-all">
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
          <div className="flex-1 overflow-y-auto px-6 py-4 hide-scroll bg-[#0d1117]">
            <Editor content={fileContent} onChange={handleEditorChange} onLinkClick={() => {}} onTagClick={() => {}} />
          </div>
        </div>
      )}
    </div>
  );
}