import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { ReactFlow, Background, Panel, MiniMap, useReactFlow, ReactFlowProvider } from '@xyflow/react';
// Added ZoomIn, ZoomOut, Maximize, Lock, and Unlock icons
import { ArrowLeft, Hand, MousePointer2, StickyNote, Search, Menu, Wrench, Network, FileText, FileWarning, Download, Upload, ZoomIn, ZoomOut, Maximize, Lock, Unlock } from 'lucide-react';
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

  // Toggle states for the unified palettes
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false); // NEW: Canvas Lock State

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

  const menuButtonStyle = { width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px', backgroundColor: t.panelBg, color: t.text, display: 'flex', alignItems: 'center', gap: '8px', transition: 'background-color 0.2s ease' };

  // Reusable Toolbar Button Component
  const ToolButton = ({ icon: Icon, active, onClick, title }) => (
    <button
      onClick={onClick}
      title={title}
      style={{
        backgroundColor: active ? t.activeBg : 'transparent',
        color: active ? t.activeText : t.textMuted,
        border: 'none',
        padding: '10px',
        borderRadius: '8px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s'
      }}
      onMouseOver={(e) => !active && (e.currentTarget.style.backgroundColor = t.hover)}
      onMouseOut={(e) => !active && (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <Icon size={20} strokeWidth={2.5} />
    </button>
  );

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: t.bg, position: 'relative', transition: 'background-color 0.2s' }}>

      <ToolsLibraryModal isOpen={isToolsModalOpen} onClose={() => setIsToolsModalOpen(false)} />

      <ReactFlow
        colorMode={theme}
        proOptions={{ hideAttribution: true }}
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
        onPaneClick={() => {setSelectedNode(null); setIsMenuOpen(false); setIsSearchOpen(false);}}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView fitViewOptions={{ padding: 0.5, maxZoom: 0.8 }}

        // NEW: Map the lock state dynamically to all interactivity props
        panOnDrag={!isLocked && !isSelectMode}
        selectionOnDrag={!isLocked && isSelectMode}
        nodesDraggable={!isLocked}
        zoomOnScroll={!isLocked}
        zoomOnPinch={!isLocked}
        zoomOnDoubleClick={!isLocked}
      >
        <Background color={theme === 'dark' ? '#30363d' : '#cbd5e1'} variant="dots" />

        {/* Make MiniMap respect the lock state too */}
        <MiniMap nodeStrokeWidth={3} zoomable={!isLocked} pannable={!isLocked} style={{ backgroundColor: t.panelBg, border: `1px solid ${t.border}`, borderRadius: '8px', boxShadow: t.shadow }} nodeColor={(node) => { if (node.data?.status === 'vulnerability') return '#fca5a5'; if (node.data?.status === 'path') return '#86efac'; if (node.data?.status === 'rabbit_hole') return '#cbd5e1'; return '#fde047'; }} />

        {/* UNIFIED VERTICAL TOP-LEFT PALETTE */}
        <Panel position="top-left" style={{ margin: '20px', zIndex: 1000 }}>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', backgroundColor: t.panelBg, padding: '8px', borderRadius: '12px', boxShadow: t.shadow, border: `1px solid ${t.border}`, width: 'fit-content' }}>

            <ToolButton onClick={onBack} icon={ArrowLeft} title="Back to Dashboard" />

            {/* Search Toggle */}
            <div style={{ position: 'relative', width: '100%' }}>
              <ToolButton
                active={isSearchOpen}
                onClick={() => { setIsSearchOpen(!isSearchOpen); setIsMenuOpen(false); }}
                icon={Search}
                title="Search & Filter"
              />
              {isSearchOpen && (
                <div style={{ position: 'absolute', top: 0, left: 'calc(100% + 14px)', display: 'flex', gap: '8px', backgroundColor: t.panelBg, padding: '8px', borderRadius: '10px', border: `1px solid ${t.border}`, boxShadow: t.shadow, width: 'max-content', zIndex: 1001 }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search tools, IPs, queries..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ backgroundColor: t.inputBg, color: t.text, border: `1px solid ${t.border}`, padding: '8px 12px', borderRadius: '6px', outline: 'none', width: '250px', fontSize: '13px' }}
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ backgroundColor: t.inputBg, color: t.text, border: `1px solid ${t.border}`, padding: '8px 12px', borderRadius: '6px', outline: 'none', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}
                  >
                    <option value="all">All Nodes</option>
                    <option value="vulnerability">Vulnerabilities</option>
                    <option value="path">Attack Paths</option>
                    <option value="action">Standard Actions</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ width: '24px', height: '1px', backgroundColor: t.border, margin: '4px 0' }} />

            <ToolButton active={!isSelectMode} onClick={() => {setIsSelectMode(false); setIsMenuOpen(false); setIsSearchOpen(false);}} icon={Hand} title="Pan Canvas" />
            <ToolButton active={isSelectMode} onClick={() => {setIsSelectMode(true); setIsMenuOpen(false); setIsSearchOpen(false);}} icon={MousePointer2} title="Select Nodes" />
            <ToolButton onClick={() => {createStickyNote(reactFlowInstance); setIsMenuOpen(false); setIsSearchOpen(false);}} icon={StickyNote} title="Add Sticky Note" />

            <div style={{ width: '24px', height: '1px', backgroundColor: t.border, margin: '4px 0' }} />

            {/* Menu Toggle */}
            <div style={{ position: 'relative', width: '100%' }}>
              <ToolButton
                active={isMenuOpen}
                onClick={() => { setIsMenuOpen(!isMenuOpen); setIsSearchOpen(false); }}
                icon={Menu}
                title="Project Menu"
              />
              {isMenuOpen && (
                <div style={{ position: 'absolute', top: 0, left: 'calc(100% + 14px)', backgroundColor: t.panelBg, border: `1px solid ${t.border}`, borderRadius: '10px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px', boxShadow: t.shadow, minWidth: '220px', zIndex: 1001 }}>
                  <button onClick={() => { setIsToolsModalOpen(true); setIsMenuOpen(false); }} style={menuButtonStyle} onMouseOver={(e) => e.target.style.backgroundColor = t.hover} onMouseOut={(e) => e.target.style.backgroundColor = t.panelBg}>
                    <Wrench size={16} /> Tools Library
                  </button>
                  <div style={{ height: '1px', backgroundColor: t.border, margin: '4px 0' }} />
                  <button onClick={() => { handleTidyGraph('LR'); setIsMenuOpen(false); }} style={menuButtonStyle} onMouseOver={(e) => e.target.style.backgroundColor = t.hover} onMouseOut={(e) => e.target.style.backgroundColor = t.panelBg}>
                    <Network size={16} /> Tidy Graph Layout
                  </button>
                  <button onClick={() => { handleGenerateReport('full'); setIsMenuOpen(false); }} style={menuButtonStyle} onMouseOver={(e) => e.target.style.backgroundColor = t.hover} onMouseOut={(e) => e.target.style.backgroundColor = t.panelBg}>
                    <FileText size={16} /> Full Report (PDF)
                  </button>
                  <button onClick={() => { handleGenerateReport('vulns'); setIsMenuOpen(false); }} style={{...menuButtonStyle, color: t.dangerText}} onMouseOver={(e) => e.target.style.backgroundColor = theme === 'dark' ? 'rgba(248, 81, 73, 0.1)' : '#fee2e2'} onMouseOut={(e) => e.target.style.backgroundColor = t.panelBg}>
                    <FileWarning size={16} /> Vulns Only (PDF)
                  </button>
                  <div style={{ height: '1px', backgroundColor: t.border, margin: '4px 0' }} />
                  <button onClick={() => { handleExportZip(); setIsMenuOpen(false); }} style={menuButtonStyle} onMouseOver={(e) => e.target.style.backgroundColor = t.hover} onMouseOut={(e) => e.target.style.backgroundColor = t.panelBg}>
                    <Download size={16} /> Export Project (ZIP)
                  </button>
                  <input type="file" ref={importFileRef} style={{ display: 'none' }} onChange={(e) => { handleImportZip(e); setIsMenuOpen(false); }} accept=".zip" />
                  <button onClick={() => { importFileRef.current.click(); }} style={menuButtonStyle} onMouseOver={(e) => e.target.style.backgroundColor = t.hover} onMouseOut={(e) => e.target.style.backgroundColor = t.panelBg}>
                    <Upload size={16} /> Import Project (ZIP)
                  </button>
                </div>
              )}
            </div>

          </div>
        </Panel>

        {/* NEW VERTICAL BOTTOM-LEFT PALETTE (Custom Controls) */}
        <Panel position="bottom-left" style={{ margin: '20px', zIndex: 1000 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', backgroundColor: t.panelBg, padding: '8px', borderRadius: '12px', boxShadow: t.shadow, border: `1px solid ${t.border}`, width: 'fit-content' }}>
            <ToolButton onClick={() => reactFlowInstance.zoomIn()} icon={ZoomIn} title="Zoom In" />
            <ToolButton onClick={() => reactFlowInstance.zoomOut()} icon={ZoomOut} title="Zoom Out" />
            <ToolButton onClick={() => reactFlowInstance.fitView({ duration: 800, padding: 0.5 })} icon={Maximize} title="Fit View to Screen" />

            <div style={{ width: '24px', height: '1px', backgroundColor: t.border, margin: '4px 0' }} />

            <ToolButton
              active={isLocked}
              onClick={() => setIsLocked(!isLocked)}
              icon={isLocked ? Lock : Unlock}
              title={isLocked ? "Unlock Canvas" : "Lock Canvas (Disable Pan & Zoom)"}
            />
          </div>
        </Panel>

      </ReactFlow>

      {/* Connection Editor Modal */}
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

      {/* Delete Confirmation Modal */}
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