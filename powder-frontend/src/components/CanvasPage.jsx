import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { ReactFlow, Background, Controls, Panel, MiniMap, useReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import StartingNode from './nodes/StartingNode';
import ActionNode from './nodes/ActionNode';
import StickyNoteNode from './nodes/StickyNoteNode';
import CustomEdge from './edges/CustomEdge';
// import ToolsLibraryModal from '../components/ui/ToolsLibraryModal';
import { useCanvas } from '../hooks/useCanvas';
import { useProjectImport } from '../hooks/useProjectImport';
import ResultDrawer from './ui/ResultDrawer';

// ------------------------------------------------------------------
// INNER COMPONENT: Handles all canvas logic and UI
// ------------------------------------------------------------------
function CanvasInner({ onNodeOpen, onBack, engagementId }) {
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Grab the React Flow instance so we can calculate the center of the screen
  const reactFlowInstance = useReactFlow();

  // Destructure everything from our clean hook
  const {
    nodes, edges, selectedNode, deleteModal, edgeModal,
    onNodesChange, onEdgesChange, onNodeClick, onNodeDragStop,
    onNodesDelete, onEdgesDelete, onConnect, onEdgeDoubleClick,
    setSelectedNode, setDeleteModal, setEdgeModal, saveEdgeLabel, handleDeleteEdge,
    handleUpdateNode, handleDeleteNode, executeDelete, createStickyNote,
    handleExportZip, handleTidyGraph, onSelectionDragStop, handleDuplicate,
    handleGenerateReport, handleExportSingleNode, setNodes, setEdges
  } = useCanvas(engagementId);

  // Replaced navigate with a simple window reload to cleanly refresh graph state after import
  const { importFileRef, handleImportZip } = useProjectImport(() => {
    window.location.reload();
  });

  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);

  // Register the visual node and edge types
  const nodeTypes = useMemo(() => ({ triggerNode: StartingNode, actionNode: ActionNode, stickyNote: StickyNoteNode }), []);
  const edgeTypes = useMemo(() => ({ custom: CustomEdge }), []);

  // Wrapper to prevent the drawer from opening when a sticky note is clicked
  const onNodeClickWrapper = useCallback((event, node) => {
    if (node.type === 'stickyNote') {
      setSelectedNode(null);
      return;
    }
    onNodeClick(event, node);
  }, [onNodeClick, setSelectedNode]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedNode(null);
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        handleDuplicate();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelectedNode, handleDuplicate]);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const titleMatch = (n.data?.title || '').toLowerCase().includes(searchTerm.toLowerCase());
        const cmdMatch = (n.data?.command || '').toLowerCase().includes(searchTerm.toLowerCase());
        const searchMatch = titleMatch || cmdMatch;
        const statusMatch = statusFilter === 'all' || n.data?.status === statusFilter;
        return { ...n, hidden: !(searchMatch && statusMatch) };
      })
    );
  }, [searchTerm, statusFilter, setNodes]);

  useEffect(() => {
    setEdges((eds) =>
      eds.map((e) => {
        const sourceNode = nodes.find((n) => n.id === e.source);
        const targetNode = nodes.find((n) => n.id === e.target);
        const isHidden = (sourceNode?.hidden || targetNode?.hidden);
        return { ...e, hidden: isHidden };
      })
    );
  }, [nodes, setEdges]);

  const menuButtonStyle = {
    width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none',
    borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px',
    backgroundColor: '#ffffff', color: '#334155', display: 'block',
    transition: 'background-color 0.2s ease'
  };

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#f8fafc', position: 'relative' }} >

      {/* RESTORED MODAL INVOCATION (Keep commented in your actual file if you haven't copied it yet, or uncomment if you have) */}
      {/* <ToolsLibraryModal isOpen={isToolsModalOpen} onClose={() => setIsToolsModalOpen(false)} /> */}

      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClickWrapper}
        onNodeDoubleClick={(event, node) => {
          event.stopPropagation();
          if (node.data && node.data.file_path) {
            onNodeOpen(node.data.file_path);
          }
        }}
        onNodeDragStop={onNodeDragStop}
        onSelectionDragStop={onSelectionDragStop}
        onNodesDelete={onNodesDelete} onEdgesDelete={onEdgesDelete}
        onConnect={onConnect}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onPaneClick={() => {setSelectedNode(null); setIsMenuOpen(false);}}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView fitViewOptions={{ padding: 0.5, maxZoom: 0.8 }}
        panOnDrag={!isSelectMode}
        selectionOnDrag={isSelectMode}
      >
        <Background color="#cbd5e1" variant="dots" />
        <Controls style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }} />

        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}
          nodeColor={(node) => {
            if (node.data?.status === 'vulnerability') return '#fca5a5';
            if (node.data?.status === 'path') return '#86efac';
            if (node.data?.status === 'rabbit_hole') return '#cbd5e1';
            return '#fde047';
          }}
        />

        <Panel position="top-left" style={{ margin: '15px' }}>
          <button onClick={onBack} style={{ backgroundColor: '#ffffff', color: '#334155', border: '1px solid #e2e8f0', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', fontWeight: '600' }}>
            Back to Dashboard
          </button>
        </Panel>

        <Panel position="top-center" style={{ margin: '15px' }}>
          <div style={{
            display: 'flex', gap: '10px', backgroundColor: '#ffffff',
            padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
          }}>
            <input
              type="text"
              placeholder="Search IPs, tools..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                backgroundColor: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1',
                padding: '8px 12px', borderRadius: '6px', outline: 'none', width: '250px'
              }}
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                backgroundColor: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1',
                padding: '8px 12px', borderRadius: '6px', outline: 'none', cursor: 'pointer', fontWeight: '500'
              }}
            >
              <option value="all">Show All</option>
              <option value="vulnerability">Vulnerabilities Only</option>
              <option value="path">Attack Paths Only</option>
              <option value="action">Actions Only</option>
            </select>
          </div>
        </Panel>

        <Panel position="top-right" style={{ margin: '15px'}}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              style={{
                backgroundColor: '#ffffff', color: '#334155', border: '1px solid #e2e8f0',
                padding: '10px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'block', fontSize: '14px'
              }}
            >
              {isMenuOpen ? 'Close Menu' : 'Menu'}
            </button>

            {isMenuOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px',
                padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', zIndex: 1000, width: '180px'
              }}>
                {/* RESTORED TOOLS LIBRARY BUTTON */}
                <button
                  onClick={() => { setIsToolsModalOpen(true); setIsMenuOpen(false); }}
                  style={menuButtonStyle}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#f1f5f9'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#ffffff'}
                >
                  <span style={{marginRight: '6px'}}></span> Tools Library
                </button>

                <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }} />
                <button
                  onClick={() => { handleTidyGraph('LR'); setIsMenuOpen(false); }}
                  style={menuButtonStyle}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#f1f5f9'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#ffffff'}
                >
                  Tidy Graph
                </button>
                <button
                  onClick={() => { handleGenerateReport('full'); setIsMenuOpen(false); }}
                  style={menuButtonStyle}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#f1f5f9'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#ffffff'}
                >
                  Full Report (PDF)
                </button>
                <button
                  onClick={() => { handleGenerateReport('vulns'); setIsMenuOpen(false); }}
                  style={{...menuButtonStyle, color: '#ef4444'}}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#fee2e2'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#ffffff'}
                >
                  Vulns Only (PDF)
                </button>
                <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }} />
                <button
                  onClick={() => { handleExportZip(); setIsMenuOpen(false); }}
                  style={menuButtonStyle}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#f1f5f9'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#ffffff'}
                >
                  Export Project
                </button>
                <input type="file" ref={importFileRef} style={{ display: 'none' }} onChange={(e) => { handleImportZip(e); setIsMenuOpen(false); }} accept=".zip" />
                <button
                  onClick={() => { importFileRef.current.click(); }}
                  style={menuButtonStyle}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#f1f5f9'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#ffffff'}
                >
                  Import Project
                </button>
              </div>
            )}
          </div>
        </Panel>

        <Panel position="bottom-center" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '5px', backgroundColor: '#ffffff', padding: '6px', borderRadius: '10px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', alignItems: 'center' }}>
            <button
              onClick={() => setIsSelectMode(false)}
              style={{ backgroundColor: !isSelectMode ? '#e0f2fe' : 'transparent', color: !isSelectMode ? '#0369a1' : '#64748b', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
            >
              Pan
            </button>
            <button
              onClick={() => setIsSelectMode(true)}
              style={{ backgroundColor: isSelectMode ? '#e0f2fe' : 'transparent', color: isSelectMode ? '#0369a1' : '#64748b', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
            >
              Select
            </button>

            {/* The Divider */}
            <div style={{ width: '1px', height: '20px', backgroundColor: '#e2e8f0', margin: '0 4px' }} />

            {/* The Sticky Note Button */}
            <button
              onClick={() => createStickyNote(reactFlowInstance)}
              style={{ backgroundColor: 'transparent', color: '#0ea5e9', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              Add Note
            </button>
          </div>
        </Panel>
      </ReactFlow>

      {edgeModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '12px', width: '350px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0, color: '#0f172a' }}>Edit Connection</h3>
            <input
              autoFocus
              type="text"
              placeholder="e.g., Exploited via SQLi"
              value={edgeModal.label}
              onChange={(e) => setEdgeModal(prev => ({ ...prev, label: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdgeLabel(edgeModal.edgeId, edgeModal.label);
              }}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', color: '#0f172a', boxSizing: 'border-box', marginTop: '10px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
              <button onClick={() => handleDeleteEdge(edgeModal.edgeId)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#fee2e2', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>
                Delete
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setEdgeModal({ isOpen: false, edgeId: null, label: '' })} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#475569', cursor: 'pointer', fontWeight: '600' }}>
                  Cancel
                </button>
                <button onClick={() => saveEdgeLabel(edgeModal.edgeId, edgeModal.label)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#0ea5e9', color: '#ffffff', cursor: 'pointer', fontWeight: 'bold' }}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '12px', width: '350px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0, color: '#ef4444' }}>Delete Action Node?</h3>
            <p style={{ color: '#475569', fontSize: '14px', lineHeight: '1.5' }}>
              Are you sure you want to delete this node? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setDeleteModal({ isOpen: false, nodeId: null })} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#475569', cursor: 'pointer', fontWeight: '600' }}>
                Cancel
              </button>
              <button onClick={() => executeDelete(deleteModal.nodeId)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#ef4444', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div onPointerDown={(e) => e.stopPropagation()}>
        <ResultDrawer
          selectedNode={selectedNode}
          onClose={() => setSelectedNode(null)}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
          onExportNode={handleExportSingleNode}
        />
      </div>

    </div>
  );
}

// ------------------------------------------------------------------
// OUTER COMPONENT: Provides ReactFlow context to the Inner component
// ------------------------------------------------------------------
export default function CanvasPage({ onNodeOpen, onBack, engagementId = "default-flow" }) {
  return (
    <ReactFlowProvider>
      <CanvasInner onNodeOpen={onNodeOpen} onBack={onBack} engagementId={engagementId} />
    </ReactFlowProvider>
  );
}