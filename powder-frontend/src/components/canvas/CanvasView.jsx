import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ReactFlow, Background, Controls, applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getApiUrl } from '../../config';
import StickyNoteNode from './nodes/StickyNoteNode';
import ActionNode from './nodes/ActionNode';
import StartingNode from './nodes/StartingNode';
import Editor from '../Editor';
import { X, ExternalLink, FolderGit2 } from 'lucide-react';

// 1. ADD activeFile PROP HERE
export default function CanvasView({ activeFile }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");

  const nodeTypes = useMemo(() => ({
    sticky_note: StickyNoteNode,
    action: ActionNode,
    starting_node: StartingNode
  }), []);

  // 2. CALCULATE CURRENT ASSESSMENT FOLDER
  const currentFolder = useMemo(() => {
    if (!activeFile || !activeFile.startsWith('10 - Assessments/')) return null;
    const parts = activeFile.split('/');
    if (parts.length >= 3) {
      return `${parts[0]}/${parts[1]}`; // e.g., "10 - Assessments/Acme_Corp"
    }
    return null;
  }, [activeFile]);

  // 3. THE NEW FETCH LOGIC (Replaces the old global fetch)
  const fetchCanvasData = useCallback(() => {
    if (!currentFolder) {
      setNodes([]); setEdges([]); return;
    }
    fetch(getApiUrl(`/canvas/data?folder=${encodeURIComponent(currentFolder)}`), { credentials: 'include' })
      .then(res => res.json())
      .then(data => { setNodes(data.nodes); setEdges(data.edges); })
      .catch(err => console.error("Failed to load canvas data", err));
  }, [currentFolder]);

  useEffect(() => {
    fetchCanvasData();
  }, [fetchCanvasData]);

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

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: "#3b82f6", strokeWidth: 2 } }, eds));
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

  // 4. THE NEW SPAWN LOGIC (Handles Folders!)
  const handleSpawnNode = (nodeType, defaultTitle) => {
    let targetPath = "";

    // If they click "+ Target Scope", we create a BRAND NEW assessment folder
    if (nodeType === 'starting_node') {
      const projectName = prompt("Enter Assessment Name (e.g., Acme_Corp_Pentest):");
      if (!projectName) return;

      const safeProjectName = projectName.replace(/\s+/g, '_');
      targetPath = `10 - Assessments/${safeProjectName}/Target_Scope.md`;
    } else {
      // If they spawn an Action/Sticky, it MUST go in the current folder
      if (!currentFolder) {
        alert("Please select a file inside an Assessment folder first!");
        return;
      }
      const fileName = `${defaultTitle.replace(/\s+/g, '_')}_${Date.now()}.md`;
      targetPath = `${currentFolder}/${fileName}`;
    }

    let frontmatter = `---\ntype: pentest_node\nnode_type: ${nodeType}\nx: 100\ny: 100\n`;
    if (nodeType === 'starting_node') frontmatter += `scope: "Internal Network"\n`;
    if (nodeType === 'action') frontmatter += `phase: "Reconnaissance"\n`;
    if (nodeType === 'sticky_note') frontmatter += `color: "#fef08a"\n`;
    frontmatter += `---\n# ${defaultTitle}\n`;

    fetch(getApiUrl(`/notes/${targetPath}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content: frontmatter })
    }).then(() => {
      if (nodeType === 'starting_node') {
        window.location.reload(); // Reload to update sidebar with new folder
      } else {
        fetchCanvasData(); // Refresh canvas to show new node
      }
    });
  };

  // 5. BLANK STATE UI
  if (!currentFolder) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#010409] rounded-xl border border-gray-800 text-gray-400">
        <FolderGit2 className="w-16 h-16 text-gray-600 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Assessment Selected</h2>
        <p className="mb-6">Select a file inside '10 - Assessments' or start a new one.</p>
        <button
          onClick={() => handleSpawnNode('starting_node', 'Target Scope')}
          className="bg-[#0ea5e9] text-white px-6 py-3 rounded-lg shadow-lg hover:bg-sky-400 font-bold"
        >
          + Create New Assessment
        </button>
      </div>
    );
  }

  // 6. MAIN RENDER
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
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          fitView
          theme="dark"
        >
          <Background color="#30363d" gap={16} />
          <Controls className="bg-gray-800 border-gray-700 fill-white" />
          <div className="absolute top-4 left-4 z-50 flex gap-2">
            <button
              onClick={() => handleSpawnNode('starting_node', 'New Target Scope')}
              className="bg-[#0ea5e9] text-white px-2 py-1 rounded-lg shadow-lg hover:bg-sky-400 transition flex items-center gap-1 text-sm font-bold"
            >
              + Target Scope
            </button>
            <button
              onClick={() => handleSpawnNode('action', 'New Action')}
              className="bg-[#161b22] border border-gray-700 text-gray-300 px-2 py-1 rounded-lg shadow-lg hover:text-white transition flex items-center gap-1 text-sm font-bold"
            >
              + Action Node
            </button>
            <button
              onClick={() => handleSpawnNode('sticky_note', 'New Note')}
              className="bg-[#fef08a] text-yellow-900 px-2 py-1 rounded-lg shadow-lg hover:bg-yellow-300 transition flex items-center gap-1 text-sm font-bold"
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