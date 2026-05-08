import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { ReactFlow, Background, Controls, Panel, MiniMap, useReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import StartingNode from './nodes/StartingNode';
import ActionNode from './nodes/ActionNode';
import StickyNoteNode from './nodes/StickyNoteNode';
import CustomEdge from './edges/CustomEdge';
import ResultDrawer from './ui/ResultDrawer';
import ToolsLibraryModal from './ui/ToolsLibraryModal';
import { useCanvas } from '../hooks/useCanvas';
import { useProjectImport } from '../hooks/useProjectImport';

function CanvasInner({ onNodeOpen, onBack, onFlowChange, engagementId, theme }) {
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const reactFlowInstance = useReactFlow();

  const {
    nodes, edges, selectedNode, deleteModal, edgeModal,
    onNodesChange, onEdgesChange, onNodeClick, onNodeDragStop,
    onNodesDelete, onEdgesDelete, onConnect, onEdgeDoubleClick,
    setSelectedNode, setDeleteModal, setEdgeModal, saveEdgeLabel, handleDeleteEdge,
    handleUpdateNode, handleDeleteNode, executeDelete, createStickyNote,
    handleExportZip, handleTidyGraph, onSelectionDragStop, handleDuplicate,
    handleGenerateReport, handleExportSingleNode, setNodes, setEdges
  } = useCanvas(engagementId, onFlowChange);

  const { importFileRef, handleImportZip } = useProjectImport(() => {
    window.location.reload();
  });

  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const nodeTypes = useMemo(() => ({ triggerNode: StartingNode, actionNode: ActionNode, stickyNote: StickyNoteNode }), []);
  const edgeTypes = useMemo(() => ({ custom: CustomEdge }), []);

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

  // Expanded Theme Dictionary
  const t = theme === 'dark' ? {
    bg: '#0d1117',
    panelBg: '#161b22',
    border: '#30363d',
    text: '#c9d1d9',
    textMuted: '#8b949e',
    inputBg: '#010409',
    hover: '#1f2428',
    activeBg: '#1f6feb',
    activeText: '#ffffff',
    dangerText: '#f85149',
    overlay: 'rgba(0, 0, 0, 0.7)',
    shadow: '0 4px 6px -1px rgba(0,0,0,0.5)'
  } : {
    bg: '#f8fafc',
    panelBg: '#ffffff',
    border: '#e2e8f0',
    text: '#0f172a',
    textMuted: '#64748b',
    inputBg: '#f8fafc',
    hover: '#f1f5f9',
    activeBg: '#e0f2fe',
    activeText: '#0369a1',
    dangerText: '#ef4444',
    overlay: 'rgba(15, 23, 42, 0.5)',
    shadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
  };

  const menuButtonStyle = { width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px', backgroundColor: t.panelBg, color: t.text, display: 'block', transition: 'background-color 0.2s ease' };

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: t.bg, position: 'relative', transition: 'background-color 0.2s' }}>

      <ToolsLibraryModal isOpen={isToolsModalOpen} onClose={() => setIsToolsModalOpen(false)} />

      <ReactFlow
        colorMode={theme}
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
        <Background color={theme === 'dark' ? '#30363d' : '#cbd5e1'} variant="dots" />
        <Controls style={{ backgroundColor: t.panelBg, color: t.text, border: `1px solid ${t.border}`, boxShadow: t.shadow }} />

        <MiniMap nodeStrokeWidth={3} zoomable pannable style={{ backgroundColor: t.panelBg, border: `1px solid ${t.border}`, borderRadius: '8px', boxShadow: t.shadow }} nodeColor={(node) => { if (node.data?.status === 'vulnerability') return '#fca5a5'; if (node.data?.status === 'path') return '#86efac'; if (node.data?.status === 'rabbit_hole') return '#cbd5e1'; return '#fde047'; }} />

        <Panel position="top-left" style={{ margin: '15px' }}>
          <button onClick={onBack} style={{ backgroundColor: t.panelBg, color: t.text, border: `1px solid ${t.border}`, padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', boxShadow: t.shadow, fontWeight: '600' }}>
            Back to Dashboard
          </button>
        </Panel>

        <Panel position="top-center" style={{ margin: '15px' }}>
          <div style={{ display: 'flex', gap: '10px', backgroundColor: t.panelBg, padding: '8px', borderRadius: '8px', border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
            <input type="text" placeholder="Search IPs, tools..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ backgroundColor: t.inputBg, color: t.text, border: `1px solid ${t.border}`, padding: '8px 12px', borderRadius: '6px', outline: 'none', width: '250px' }} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ backgroundColor: t.inputBg, color: t.text, border: `1px solid ${t.border}`, padding: '8px 12px', borderRadius: '6px', outline: 'none', cursor: 'pointer', fontWeight: '500' }}>
              <option value="all">Show All</option>
              <option value="vulnerability">Vulnerabilities Only</option>
              <option value="path">Attack Paths Only</option>
              <option value="action">Actions Only</option>
            </select>
          </div>
        </Panel>

        <Panel position="top-right" style={{ margin: '15px'}}>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} style={{ backgroundColor: t.panelBg, color: t.text, border: `1px solid ${t.border}`, padding: '10px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', boxShadow: t.shadow, display: 'block', fontSize: '14px' }}>
              {isMenuOpen ? 'Close Menu' : 'Menu'}
            </button>
            {isMenuOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', backgroundColor: t.panelBg, border: `1px solid ${t.border}`, borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px', boxShadow: t.shadow, zIndex: 1000, width: '180px' }}>
                <button onClick={() => { setIsToolsModalOpen(true); setIsMenuOpen(false); }} style={menuButtonStyle} onMouseOver={(e) => e.target.style.backgroundColor = t.hover} onMouseOut={(e) => e.target.style.backgroundColor = t.panelBg}><span style={{marginRight: '6px'}}></span> Tools Library</button>
                <div style={{ height: '1px', backgroundColor: t.border, margin: '4px 0' }} />
                <button onClick={() => { handleTidyGraph('LR'); setIsMenuOpen(false); }} style={menuButtonStyle} onMouseOver={(e) => e.target.style.backgroundColor = t.hover} onMouseOut={(e) => e.target.style.backgroundColor = t.panelBg}>Tidy Graph</button>
                <button onClick={() => { handleGenerateReport('full'); setIsMenuOpen(false); }} style={menuButtonStyle} onMouseOver={(e) => e.target.style.backgroundColor = t.hover} onMouseOut={(e) => e.target.style.backgroundColor = t.panelBg}>Full Report (PDF)</button>
                <button onClick={() => { handleGenerateReport('vulns'); setIsMenuOpen(false); }} style={{...menuButtonStyle, color: t.dangerText}} onMouseOver={(e) => e.target.style.backgroundColor = theme === 'dark' ? 'rgba(248, 81, 73, 0.1)' : '#fee2e2'} onMouseOut={(e) => e.target.style.backgroundColor = t.panelBg}>Vulns Only (PDF)</button>
                <div style={{ height: '1px', backgroundColor: t.border, margin: '4px 0' }} />
                <button onClick={() => { handleExportZip(); setIsMenuOpen(false); }} style={menuButtonStyle} onMouseOver={(e) => e.target.style.backgroundColor = t.hover} onMouseOut={(e) => e.target.style.backgroundColor = t.panelBg}>Export Project</button>
                <input type="file" ref={importFileRef} style={{ display: 'none' }} onChange={(e) => { handleImportZip(e); setIsMenuOpen(false); }} accept=".zip" />
                <button onClick={() => { importFileRef.current.click(); }} style={menuButtonStyle} onMouseOver={(e) => e.target.style.backgroundColor = t.hover} onMouseOut={(e) => e.target.style.backgroundColor = t.panelBg}>Import Project</button>
              </div>
            )}
          </div>
        </Panel>

        <Panel position="bottom-center" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '5px', backgroundColor: t.panelBg, padding: '6px', borderRadius: '10px', boxShadow: t.shadow, border: `1px solid ${t.border}`, alignItems: 'center' }}>
            <button onClick={() => setIsSelectMode(false)} style={{ backgroundColor: !isSelectMode ? t.activeBg : 'transparent', color: !isSelectMode ? t.activeText : t.textMuted, border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}>Pan</button>
            <button onClick={() => setIsSelectMode(true)} style={{ backgroundColor: isSelectMode ? t.activeBg : 'transparent', color: isSelectMode ? t.activeText : t.textMuted, border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}>Select</button>
            <div style={{ width: '1px', height: '20px', backgroundColor: t.border, margin: '0 4px' }} />
            <button onClick={() => createStickyNote(reactFlowInstance)} style={{ backgroundColor: 'transparent', color: '#0ea5e9', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = t.hover} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              Add Note
            </button>
          </div>
        </Panel>
      </ReactFlow>

      {edgeModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: t.overlay, display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ backgroundColor: t.panelBg, padding: '25px', borderRadius: '12px', width: '350px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', border: `1px solid ${t.border}` }}>
            <h3 style={{ marginTop: 0, color: t.text }}>Edit Connection</h3>
            <input autoFocus type="text" placeholder="e.g., Exploited via SQLi" value={edgeModal.label} onChange={(e) => setEdgeModal(prev => ({ ...prev, label: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') saveEdgeLabel(edgeModal.edgeId, edgeModal.label); }} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: `1px solid ${t.border}`, backgroundColor: t.inputBg, color: t.text, boxSizing: 'border-box', marginTop: '10px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
              <button onClick={() => handleDeleteEdge(edgeModal.edgeId)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: theme === 'dark' ? '#b91c1c' : '#fee2e2', color: theme === 'dark' ? '#ffffff' : '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>Delete</button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setEdgeModal({ isOpen: false, edgeId: null, label: '' })} style={{ padding: '8px 16px', borderRadius: '6px', border: `1px solid ${t.border}`, backgroundColor: t.panelBg, color: t.textMuted, cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
                <button onClick={() => saveEdgeLabel(edgeModal.edgeId, edgeModal.label)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#0ea5e9', color: '#ffffff', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: t.overlay, display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ backgroundColor: t.panelBg, padding: '25px', borderRadius: '12px', width: '350px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', border: `1px solid ${t.border}` }}>
            <h3 style={{ marginTop: 0, color: t.dangerText }}>Delete Action Node?</h3>
            <p style={{ color: t.textMuted, fontSize: '14px', lineHeight: '1.5' }}>Are you sure you want to delete this node? This action cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setDeleteModal({ isOpen: false, nodeId: null })} style={{ padding: '8px 16px', borderRadius: '6px', border: `1px solid ${t.border}`, backgroundColor: t.panelBg, color: t.textMuted, cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
              <button onClick={() => executeDelete(deleteModal.nodeId)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#ef4444', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div onPointerDown={(e) => e.stopPropagation()}>
        <ResultDrawer selectedNode={selectedNode} onClose={() => setSelectedNode(null)} onUpdateNode={handleUpdateNode} onDeleteNode={handleDeleteNode} onExportNode={handleExportSingleNode} theme={theme} />
      </div>

    </div>
  );
}

export default function CanvasPage({ onNodeOpen, onBack, onFlowChange, engagementId = "default-flow", theme }) {
  return (
    <ReactFlowProvider>
      <CanvasInner onNodeOpen={onNodeOpen} onBack={onBack} onFlowChange={onFlowChange} engagementId={engagementId} theme={theme} />
    </ReactFlowProvider>
  );
}