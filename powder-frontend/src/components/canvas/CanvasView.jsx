import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ReactFlow, Background, Controls, applyNodeChanges, applyEdgeChanges, addEdge, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getApiUrl } from '../../config';
import StickyNoteNode from './nodes/StickyNoteNode';
import ActionNode from './nodes/ActionNode';
import StartingNode from './nodes/StartingNode';
import Editor from '../Editor';
import { X, ExternalLink, FolderGit2 } from 'lucide-react';

export default function CanvasView({ activeFile, setActiveFile }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [modalConfig, setModalConfig] = useState({ isOpen: false, type: '', title: '' });
  const [newNodeName, setNewNodeName] = useState("");

  const nodeTypes = useMemo(() => ({
    sticky_note: StickyNoteNode,
    action: ActionNode,
    starting_node: StartingNode
  }), []);

  const currentFolder = useMemo(() => {
    if (!activeFile || !activeFile.startsWith('10 - Assessments/')) return null;
    const parts = activeFile.split('/');
    if (parts.length >= 3) return `${parts[0]}/${parts[1]}`;
    return null;
  }, [activeFile]);

  const fetchCanvasData = useCallback(() => {
    if (!currentFolder) { setNodes([]); setEdges([]); return; }
    fetch(getApiUrl(`/canvas/data?folder=${encodeURIComponent(currentFolder)}`), { credentials: 'include' })
      .then(res => res.json())
      .then(data => { setNodes(data.nodes); setEdges(data.edges); })
      .catch(err => console.error("Failed to load canvas data", err));
  }, [currentFolder]);

  useEffect(() => { fetchCanvasData(); }, [fetchCanvasData]);

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

  const isValidConnection = useCallback((connection) => {
    const targetNode = nodes.find(n => n.id === connection.target);
    if (targetNode && targetNode.type === 'starting_node') return false;
    return true;
  }, [nodes]);

  // OPTIMISTIC EDITOR UPDATE ON CONNECT
  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' }, style: { stroke: "#3b82f6", strokeWidth: 2 } }, eds));

    // Instantly write the WikiLink into the open text editor to prevent sync delays!
    if (selectedFile === params.source) {
      const targetNode = nodes.find(n => n.id === params.target);
      if (targetNode) {
        const linkTitle = targetNode.data.title.replace('.md', '').replace(/_/g, ' ');
        setFileContent(prev => prev + `\n[[${linkTitle}]]\n`);
      }
    }

    fetch(getApiUrl('/canvas/edge'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ source: params.source, target: params.target })
    }).catch(err => console.error("Failed to save edge:", err));
  }, [selectedFile, nodes]);

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

  // TRIGGER MODAL INSTEAD OF DIRECT CREATION
  const openSpawnModal = (nodeType, defaultTitle) => {
    if (nodeType !== 'starting_node' && !currentFolder) {
      alert("Please select a file inside an Assessment folder first!");
      return;
    }
    setModalConfig({ isOpen: true, type: nodeType, title: defaultTitle });
    setNewNodeName(""); // Clear previous input
  };

  // CONFIRM MODAL AND CREATE FILE
  const confirmCreateNode = () => {
    if (!newNodeName.trim()) return;

    const safeName = newNodeName.trim().replace(/\s+/g, '_');
    const nodeType = modalConfig.type;
    let targetPath = "";

    if (nodeType === 'starting_node') {
      targetPath = `10 - Assessments/${safeName}/${safeName}_Scope.md`;
    } else {
      // Append a small timestamp just to prevent accidental overwrites of identically named actions
      targetPath = `${currentFolder}/${safeName}_${Date.now().toString().slice(-4)}.md`;
    }

    let frontmatter = `---\ntype: pentest_node\nnode_type: ${nodeType}\nx: 100\ny: 100\n`;
    if (nodeType === 'starting_node') frontmatter += `scope: "Black Box"\n`;
    if (nodeType === 'action') frontmatter += `phase: "Reconnaissance"\n`;
    if (nodeType === 'sticky_note') frontmatter += `color: "#fef08a"\n`;
    frontmatter += `---\n# ${newNodeName.trim()}\n`;

    fetch(getApiUrl(`/notes/${targetPath}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content: frontmatter })
    }).then(() => {
      setModalConfig({ isOpen: false, type: '', title: '' });
      if (nodeType === 'starting_node') {
        if (setActiveFile) setActiveFile(targetPath);
        else window.location.reload();
      } else {
        fetchCanvasData();
      }
    });
  };

  const updateNodeMetadata = (key, value) => {
    setNodes(nds => nds.map(n => n.id === selectedFile ? { ...n, data: { ...n.data, [key]: value } } : n));
    setFileContent(prev => {
      const yamlRegex = /^---\n([\s\S]*?)\n---/;
      const match = prev.match(yamlRegex);
      if (match) {
        let yaml = match[1];
        const keyRegex = new RegExp(`^${key}:.*$`, 'm');
        if (keyRegex.test(yaml)) yaml = yaml.replace(keyRegex, `${key}: "${value}"`);
        else yaml += `\n${key}: "${value}"`;
        const newContent = prev.replace(yamlRegex, `---\n${yaml}\n---`);
        fetch(getApiUrl(`/notes/${selectedFile}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ content: newContent }) });
        return newContent;
      }
      return prev;
    });
  };

  const selectedNodeData = selectedFile ? nodes.find(n => n.id === selectedFile) : null;

  useEffect(() => {
    if (!selectedFile || !fileContent) return;
    const wikiLinkRegex = /\[\[(.*?)\]\]/g;
    const foundLinks = [];
    let match;
    while ((match = wikiLinkRegex.exec(fileContent)) !== null) {
      foundLinks.push(match[1].trim().toLowerCase());
    }

    setEdges(currentEdges => {
      let newEdges = [...currentEdges];
      let edgesChanged = false;
      foundLinks.forEach(cleanLink => {
        const targetNode = nodes.find(n => n.data.title.toLowerCase() === cleanLink || n.data.title.replace(/_/g, ' ').toLowerCase() === cleanLink);
        if (targetNode) {
          const edgeId = `e-${selectedFile}-${targetNode.id}`;
          if (!newEdges.some(e => e.id === edgeId)) {
            newEdges.push({ id: edgeId, source: selectedFile, target: targetNode.id, animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' }, style: { stroke: "#3b82f6", strokeWidth: 2 } });
            edgesChanged = true;
          }
        }
      });
      return edgesChanged ? newEdges : currentEdges;
    });
  }, [fileContent, selectedFile, nodes, setEdges]);

  const onEdgesDelete = useCallback((edgesToDelete) => {
    edgesToDelete.forEach(edge => {
      const targetNode = nodes.find(n => n.id === edge.target);
      if (targetNode) {
        const title = targetNode.data.title.replace('.md', '').replace(/_/g, ' ');
        const linkRegex = new RegExp(`\\[\\[${title}\\]\\]\\n?`, 'gi');

        // If the file we are deleting the edge from is currently OPEN in the drawer,
        // we MUST update the text editor instantly, or the Phase 7 hook will resurrect the edge!
        if (selectedFile === edge.source) {
          setFileContent(prev => {
            const updatedText = prev.replace(linkRegex, '');
            // Send the patched text to the backend
            fetch(getApiUrl(`/notes/${edge.source}`), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ content: updatedText })
            });
            return updatedText;
          });
        } else {
          // If the file is NOT open in the editor, just modify it in the background normally
          fetch(getApiUrl(`/notes/${edge.source}`), { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
              const newContent = data.content.replace(linkRegex, '');
              fetch(getApiUrl(`/notes/${edge.source}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ content: newContent })
              });
            });
        }
      }
    });
  }, [nodes, selectedFile]);

  const saveStickyNote = async (nodeId, newText, newColor) => {
    try {
      const res = await fetch(getApiUrl(`/notes/${nodeId}`), { credentials: 'include' });
      const data = await res.json();

      const match = data.content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        let yaml = match[1];

        // Update Color in YAML
        if (/^color:.*$/m.test(yaml)) {
          yaml = yaml.replace(/^color:.*$/m, `color: "${newColor}"`);
        } else {
          yaml += `\ncolor: "${newColor}"`;
        }

        // Combine new YAML with new Text
        const newContent = `---\n${yaml}\n---\n${newText}`;

        // Save safely!
        await fetch(getApiUrl(`/notes/${nodeId}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content: newContent })
        });
      }
    } catch (err) {
      console.error("Failed to save sticky note", err);
    }
  };

  // We map over the nodes to inject this save function into them!
  const nodesWithCallbacks = nodes.map(n => ({
    ...n,
    data: { ...n.data, onUpdate: saveStickyNote }
  }));

  return (
    <div className="w-full h-full relative flex bg-[#010409] rounded-xl overflow-hidden border border-gray-800">

      {/* UNIVERSAL CREATION MODAL */}
      {modalConfig.isOpen && (
        <div className="absolute inset-0 z-[100] bg-black/60 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#161b22] border border-gray-700 p-6 rounded-xl shadow-2xl w-96 flex flex-col gap-4">
            <h3 className="text-white font-bold text-lg">
              {modalConfig.type === 'starting_node' ? 'Create New Assessment' : `Create ${modalConfig.title}`}
            </h3>
            <p className="text-sm text-gray-400 -mt-2">Enter the name below.</p>
            <input
              autoFocus
              type="text"
              placeholder={modalConfig.type === 'starting_node' ? "e.g., Acme Corp Pentest" : "e.g., Nmap Quick Scan"}
              value={newNodeName}
              onChange={(e) => setNewNodeName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmCreateNode()}
              className="bg-[#0d1117] border border-gray-700 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-500"
            />
            <div className="flex justify-end gap-3 mt-2">
              <button onClick={() => setModalConfig({ isOpen: false, type: '', title: '' })} className="px-4 py-2 text-gray-400 hover:text-white font-medium transition-colors">Cancel</button>
              <button onClick={confirmCreateNode} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-colors">Create</button>
            </div>
          </div>
        </div>
      )}

      {!currentFolder ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
          <FolderGit2 className="w-16 h-16 text-gray-600 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">No Assessment Selected</h2>
          <p className="mb-6">Select a file inside '10 - Assessments' or start a new one.</p>
          <button onClick={() => openSpawnModal('starting_node', 'Target Scope')} className="bg-[#0ea5e9] text-white px-6 py-3 rounded-lg shadow-lg hover:bg-sky-400 font-bold">
            + Create New Assessment
          </button>
        </div>
      ) : (
        <div className="flex-1 h-full flex">
          <div className="flex-1 h-full relative">
            <ReactFlow
              nodes={nodesWithCallbacks}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStop={onNodeDragStop}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onNodeDoubleClick={onNodeClick}
              onEdgesDelete={onEdgesDelete}
              proOptions={{ hideAttribution: true }}
              fitView
              theme="dark"
            >
              <Background color="#30363d" gap={16} />
              <Controls className="bg-gray-800 border-gray-700 fill-white" />
              <div className="absolute top-4 left-4 z-50 flex gap-2">
                <button onClick={() => openSpawnModal('starting_node', 'Target Scope')} className="bg-[#0ea5e9] text-white px-2 py-1 rounded-lg shadow-lg hover:bg-sky-400 transition flex items-center gap-1 text-sm font-bold">+ Target Scope</button>
                <button onClick={() => openSpawnModal('action', 'Action Node')} className="bg-[#161b22] border border-gray-700 text-gray-300 px-2 py-1 rounded-lg shadow-lg hover:text-white transition flex items-center gap-1 text-sm font-bold">+ Action Node</button>
                <button onClick={() => openSpawnModal('sticky_note', 'Sticky Note')} className="bg-[#fef08a] text-yellow-900 px-2 py-1 rounded-lg shadow-lg hover:bg-yellow-300 transition flex items-center gap-1 text-sm font-bold">+ Sticky Note</button>
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

              {selectedNodeData && (
                <div className="bg-[#111827] border-b border-gray-800 px-4 py-2 flex items-center gap-3">
                  <span className="text-xs text-gray-500 font-bold">SETTINGS:</span>
                  {selectedNodeData.type === 'starting_node' && (
                    <select value={selectedNodeData.data.scope || 'Black Box'} onChange={(e) => updateNodeMetadata('scope', e.target.value)} className="bg-[#161b22] text-sky-400 text-xs px-2 py-1.5 rounded border border-gray-700 outline-none cursor-pointer hover:border-gray-500 transition-colors">
                      <option value="White Box">White Box</option>
                      <option value="Black Box">Black Box</option>
                      <option value="Adversary Simulation">Adversary Simulation</option>
                    </select>
                  )}
                  {selectedNodeData.type === 'action' && (
                    <select value={selectedNodeData.data.phase || 'Enumeration'} onChange={(e) => updateNodeMetadata('phase', e.target.value)} className="bg-[#161b22] text-emerald-400 text-xs px-2 py-1.5 rounded border border-gray-700 outline-none cursor-pointer hover:border-gray-500 transition-colors">
                      <option value="Reconnaissance">Reconnaissance</option>
                      <option value="Enumeration">Enumeration</option>
                      <option value="Exploitation">Exploitation</option>
                      <option value="PostExploitation">PostExploitation</option>
                      <option value="Reporting">Reporting</option>
                    </select>
                  )}
                  {selectedNodeData.type === 'sticky_note' && (
                    <div className="flex gap-1.5 ml-2">
                      {['#fef08a', '#bbf7d0', '#bae6fd', '#fbcfe8', '#e9d5ff', '#e2e8f0'].map(color => (
                        <button key={color} onClick={() => updateNodeMetadata('color', color)} className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${selectedNodeData.data.color === color ? 'border-white' : 'border-gray-700'}`} style={{ backgroundColor: color }} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-6 py-4 hide-scroll bg-[#0d1117]">
                <Editor content={fileContent} onChange={handleEditorChange} onLinkClick={() => {}} onTagClick={() => {}} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}