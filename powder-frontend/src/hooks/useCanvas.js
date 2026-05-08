import { useState, useEffect, useCallback, useRef } from 'react';
import { useNodesState, useEdgesState, MarkerType } from '@xyflow/react';
import { getApiUrl } from '../config';
import toast from 'react-hot-toast';
import dagre from 'dagre';

const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 50 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 260, height: 120 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: { x: nodeWithPosition.x - 260 / 2, y: nodeWithPosition.y - 120 / 2 },
    };
  });

  return { nodes: newNodes, edges };
};

export function useCanvas(engagementId) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, nodeId: null });
  const [edgeModal, setEdgeModal] = useState({ isOpen: false, edgeId: null, label: '' });

  const nodesRef = useRef([]);
  const edgesRef = useRef([]);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  const onNodeClick = useCallback((event, node) => setSelectedNode(node), []);

  const apiCall = async (endpoint, method = 'GET', body = null) => {
    const options = {
      method,
      credentials: 'include', // MUST be included for Powder's JWT sessions!
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(getApiUrl(endpoint), options);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  };

  // ============================================================================
  // 1. BASE HANDLERS (No dependencies on other custom functions)
  // ============================================================================

  const executeDelete = useCallback(async (nodeId) => {
    try {
      await apiCall(`/flow/nodes/${nodeId}`, 'DELETE');
      setNodes((nds) => nds.filter((n) => String(n.id) !== String(nodeId)));
      setEdges((eds) => eds.filter((e) => String(e.source) !== String(nodeId) && String(e.target) !== String(nodeId)));
      setSelectedNode(null);
      setDeleteModal({ isOpen: false, nodeId: null });
      toast.success('Node deleted');
    } catch (error) { toast.error('Failed to delete node'); }
  }, [setNodes, setEdges]);

  const handleDeleteNode = useCallback((nodeId, skipConfirm = false) => {
    if (!skipConfirm) {
      setDeleteModal({ isOpen: true, nodeId });
      return;
    }
    executeDelete(nodeId);
  }, [executeDelete]);

  const handleDeleteEdge = useCallback(async (edgeId) => {
    try {
      await apiCall(`/flow/edges/${edgeId}`, 'DELETE');
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setEdgeModal({ isOpen: false, edgeId: null, label: '' });
      toast.success('Connection removed');
    } catch (error) { toast.error("Failed to remove connection"); }
  }, [setEdges]);

  const handleEdgeEdit = useCallback((edgeId, currentLabel) => {
    setEdgeModal({ isOpen: true, edgeId, label: currentLabel || '' });
  }, []);

  const handleStickyTextChange = useCallback(async (nodeId, newText) => {
    const nodeToUpdate = nodesRef.current.find(n => String(n.id) === String(nodeId));
    if (!nodeToUpdate) return;
    try {
      await apiCall(`/flow/nodes/${nodeId}`, 'PUT', {
        title: nodeToUpdate.data.title, type: nodeToUpdate.type,
        command: nodeToUpdate.data.command, status: nodeToUpdate.data.status,
        markdown_result: nodeToUpdate.data.markdown_result,
        note: newText,
        meta_tags: nodeToUpdate.data.meta_tags,
        position_x: nodeToUpdate.position.x, position_y: nodeToUpdate.position.y
      });
      setNodes(nds => nds.map(n => String(n.id) === String(nodeId) ? { ...n, data: { ...n.data, note: newText } } : n));
    } catch (e) { toast.error("Failed to save note"); }
  }, [setNodes]);

  const handleStickyResize = useCallback(async (nodeId, width, height) => {
    const nodeToUpdate = nodesRef.current.find(n => String(n.id) === String(nodeId));
    if (!nodeToUpdate) return;
    const updatedMeta = { ...nodeToUpdate.data.meta_tags, width, height };
    try {
      await apiCall(`/flow/nodes/${nodeId}`, 'PUT', {
        title: nodeToUpdate.data.title, type: nodeToUpdate.type,
        command: nodeToUpdate.data.command, status: nodeToUpdate.data.status,
        markdown_result: nodeToUpdate.data.markdown_result, note: nodeToUpdate.data.note,
        meta_tags: updatedMeta,
        position_x: nodeToUpdate.position.x, position_y: nodeToUpdate.position.y
      });
      setNodes(nds => nds.map(n => String(n.id) === String(nodeId) ? {
        ...n, style: { ...n.style, width, height }, data: { ...n.data, meta_tags: updatedMeta }
      } : n));
    } catch(e) { console.error(e); }
  }, [setNodes]);

  const handleStickyColorChange = useCallback(async (nodeId, newColor) => {
    const nodeToUpdate = nodesRef.current.find(n => String(n.id) === String(nodeId));
    if (!nodeToUpdate) return;
    const updatedMeta = { ...nodeToUpdate.data.meta_tags, color: newColor };
    try {
      await apiCall(`/flow/nodes/${nodeId}`, 'PUT', {
        title: nodeToUpdate.data.title, type: nodeToUpdate.type, command: nodeToUpdate.data.command, status: nodeToUpdate.data.status,
        markdown_result: nodeToUpdate.data.markdown_result, note: nodeToUpdate.data.note, meta_tags: updatedMeta,
        position_x: nodeToUpdate.position.x, position_y: nodeToUpdate.position.y
      });
      setNodes(nds => nds.map(n => String(n.id) === String(nodeId) ? { ...n, data: { ...n.data, meta_tags: updatedMeta, color: newColor } } : n));
    } catch (e) { toast.error("Failed to save color"); }
  }, [setNodes]);

  const handleUpdateNode = useCallback((nodeId, updatedDbNode) => {
    setNodes((nds) => nds.map((n) => {
      if (String(n.id) === String(nodeId)) {
        return {
          ...n,
          data: {
            ...n.data, title: updatedDbNode.title, command: updatedDbNode.command, status: updatedDbNode.status,
            markdown_result: updatedDbNode.markdown_result, meta_tags: updatedDbNode.meta_tags
          }
        };
      }
      return n;
    }));

    setEdges((eds) => eds.map((e) => {
      if (String(e.target) === String(nodeId)) {
        const isImportant = updatedDbNode.status === 'path' || updatedDbNode.status === 'vulnerability';
        const edgeColor = updatedDbNode.status === 'path' ? '#166534' : (updatedDbNode.status === 'vulnerability' ? '#dc2626' : '#94a3b8');
        return {
          ...e, animated: isImportant,
          style: { ...e.style, strokeWidth: 3, stroke: edgeColor },
          markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: edgeColor }
        };
      }
      return e;
    }));
  }, [setNodes, setEdges]);

  // ============================================================================
  // 2. COMPLEX HANDLERS (Depends on base handlers)
  // ============================================================================

  const createActionNode = useCallback(async (parentId, parentX, parentY) => {
    const newX = parentX + 350;
    const newY = parentY;
    try {
      const newNode = await apiCall('/flow/nodes', 'POST', {
        title: 'New Action', type: 'actionNode', command: '', status: 'action',
        position_x: newX, position_y: newY, meta_tags: { engagement_id: engagementId }
      });

      const edgeId = `e-${parentId}-${newNode.id}`;
      await apiCall('/flow/edges', 'POST', {
        id: edgeId, source: String(parentId), target: String(newNode.id)
      });

      const reactFlowNode = {
        id: String(newNode.id), position: { x: newNode.position_x, y: newNode.position_y }, type: newNode.type,
        data: {
          title: newNode.title, command: newNode.command, status: newNode.status, markdown_result: newNode.markdown_result,
          meta_tags: newNode.meta_tags, file_path: newNode.file_path, // POWDER BRIDGE INJECTION
          onAddNode: createActionNode, onDeleteNode: handleDeleteNode
        }
      };

      const newEdge = {
        id: edgeId, source: String(parentId), target: String(newNode.id), type: 'custom',
        style: { strokeWidth: 3, stroke: '#94a3b8' },
        markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#94a3b8' },
        data: { onEdit: handleEdgeEdit, onDelete: handleDeleteEdge }
      };

      setNodes((nds) => [...nds, reactFlowNode]);
      setEdges((eds) => [...eds, newEdge]);
      setSelectedNode(reactFlowNode);
    } catch (error) { toast.error('Failed to add action'); }
  }, [engagementId, setNodes, setEdges, handleDeleteNode, handleEdgeEdit, handleDeleteEdge]);

  const createStickyNote = useCallback(async (reactFlowInstance) => {
    try {
      let spawnX = 100;
      let spawnY = 100;

      if (reactFlowInstance) {
        const centerPosition = reactFlowInstance.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        spawnX = centerPosition.x - 125;
        spawnY = centerPosition.y - 125;
      }

      const newNode = await apiCall('/flow/nodes', 'POST', {
        title: 'Sticky Note', type: 'stickyNote', command: '', status: 'draft', note: '',
        position_x: spawnX, position_y: spawnY,
        meta_tags: { engagement_id: engagementId, width: 250, height: 250, color: '#fef08a' }
      });

      const reactFlowNode = {
        id: String(newNode.id), position: { x: newNode.position_x, y: newNode.position_y }, type: newNode.type,
        zIndex: -100,
        style: { width: 250, height: 250 },
        data: {
          title: newNode.title, status: newNode.status, note: newNode.note, meta_tags: newNode.meta_tags, color: '#fef08a',
          file_path: newNode.file_path, // POWDER BRIDGE INJECTION
          onDeleteNode: handleDeleteNode, onTextChange: handleStickyTextChange, onResize: handleStickyResize, onColorChange: handleStickyColorChange
        }
      };
      setNodes((nds) => [...nds, reactFlowNode]);
      toast.success('Note Added');
    } catch (error) { toast.error('Failed to add note'); }
  }, [engagementId, setNodes, handleDeleteNode, handleStickyTextChange, handleStickyResize, handleStickyColorChange]);

  const onConnect = useCallback(async (connection) => {
    const edgeId = `e-${connection.source}-${connection.target}`;
    const targetNode = nodesRef.current.find(n => String(n.id) === String(connection.target));
    const status = targetNode?.data?.status || 'action';
    const isImportant = status === 'path' || status === 'vulnerability';
    const edgeColor = status === 'path' ? '#166534' : (status === 'vulnerability' ? '#dc2626' : '#94a3b8');

    try {
      await apiCall('/flow/edges', 'POST', { id: edgeId, source: connection.source, target: connection.target });
      setEdges((eds) => [...eds, {
        id: edgeId, source: connection.source, target: connection.target, type: 'custom', animated: isImportant,
        style: { strokeWidth: 3, stroke: edgeColor },
        markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: edgeColor },
        data: { onEdit: handleEdgeEdit, onDelete: handleDeleteEdge }
      }]);
      toast.success('Connection created!');
    } catch (error) { toast.error('Failed to create connection'); }
  }, [setEdges, handleEdgeEdit, handleDeleteEdge]);

  // ============================================================================
  // 3. FETCH EFFECT (Depends on everything above)
  // ============================================================================

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const [nodesData, edgesData] = await Promise.all([
          apiCall('/flow/nodes'),
          apiCall('/flow/edges')
        ]);

        const projectNodes = nodesData.filter(dbNode =>
          String(dbNode.id) === String(engagementId) || (dbNode.meta_tags && String(dbNode.meta_tags.engagement_id) === String(engagementId))
        );
        const projectNodeIds = projectNodes.map(n => String(n.id));

        const loadedNodes = projectNodes.map(dbNode => {
          const isSticky = dbNode.type === 'stickyNote';
          return {
            id: String(dbNode.id),
            position: { x: dbNode.position_x, y: dbNode.position_y },
            type: dbNode.type,
            zIndex: isSticky ? -100 : 10,
            style: isSticky ? { width: dbNode.meta_tags?.width || 250, height: dbNode.meta_tags?.height || 250 } : undefined,
            data: {
              title: dbNode.title, command: dbNode.command, status: dbNode.status,
              markdown_result: dbNode.markdown_result, meta_tags: dbNode.meta_tags || {},
              note: dbNode.note, color: dbNode.meta_tags?.color || '#fef08a',
              file_path: dbNode.file_path, // POWDER BRIDGE INJECTION
              onAddNode: createActionNode, onDeleteNode: handleDeleteNode,
              onTextChange: handleStickyTextChange, onResize: handleStickyResize,
              onColorChange: handleStickyColorChange
            },
          };
        });

        const loadedEdges = edgesData
          .filter(e => projectNodeIds.includes(e.source) && projectNodeIds.includes(e.target))
          .map(dbEdge => {
            const targetNode = projectNodes.find(n => String(n.id) === dbEdge.target);
            const isImportant = targetNode?.status === 'path' || targetNode?.status === 'vulnerability';
            const edgeColor = targetNode?.status === 'path' ? '#166534' : (targetNode?.status === 'vulnerability' ? '#dc2626' : '#94a3b8');

            return {
              id: dbEdge.id, source: dbEdge.source, target: dbEdge.target,
              type: 'custom', animated: isImportant, label: dbEdge.label,
              style: { strokeWidth: 3, stroke: edgeColor },
              markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: edgeColor },
              data: { onEdit: handleEdgeEdit, onDelete: handleDeleteEdge }
            };
          });

        setNodes(loadedNodes);
        setEdges(loadedEdges);
      } catch (error) { console.error("Error fetching graph:", error); }
    };
    fetchGraph();
  }, [engagementId, setNodes, setEdges, createActionNode, handleDeleteNode, handleEdgeEdit, handleDeleteEdge, handleStickyTextChange, handleStickyResize, handleStickyColorChange]);

  // ============================================================================
  // 4. SECONDARY HANDLERS
  // ============================================================================

  const onNodeDragStop = useCallback(async (event, node) => {
    try {
      await apiCall(`/flow/nodes/${node.id}`, 'PUT', {
        title: node.data.title, type: node.type, command: node.data.command, status: node.data.status,
        markdown_result: node.data.markdown_result, note: node.data.note, meta_tags: node.data.meta_tags,
        position_x: node.position.x, position_y: node.position.y
      });
    } catch (error) { console.error("Failed to save node position:", error); }
  }, []);

  const onSelectionDragStop = useCallback(async (event, draggedNodes) => {
    try {
      await Promise.all(draggedNodes.map(node =>
        apiCall(`/flow/nodes/${node.id}`, 'PUT', {
          title: node.data.title, type: node.type, command: node.data.command, status: node.data.status,
          markdown_result: node.data.markdown_result, note: node.data.note, meta_tags: node.data.meta_tags,
          position_x: node.position.x, position_y: node.position.y
        })
      ));
    } catch (error) { console.error("Failed to save positions:", error); }
  }, []);

  const onNodesDelete = useCallback((deletedNodes) => {
    deletedNodes.forEach(node => {
      if (node.type === 'actionNode' || node.type === 'stickyNote') handleDeleteNode(node.id, true);
    });
  }, [handleDeleteNode]);

  const onEdgesDelete = useCallback((deletedEdges) => {
    deletedEdges.forEach(async (edge) => {
      try { await apiCall(`/flow/edges/${edge.id}`, 'DELETE'); }
      catch (error) {}
    });
  }, []);

  const saveEdgeLabel = useCallback(async (edgeId, newLabel) => {
    try {
      const edgeToUpdate = edges.find(e => e.id === edgeId);
      if (!edgeToUpdate) return;
      await apiCall(`/flow/edges/${edgeId}`, 'PUT', {
        id: edgeId, source: edgeToUpdate.source, target: edgeToUpdate.target, label: newLabel
      });
      setEdges((eds) => eds.map(e => {
        if (e.id === edgeId) {
          return {
            ...e, label: newLabel, labelBgPadding: [8, 4], labelBgBorderRadius: 4,
            labelStyle: { fill: '#1e293b', fontWeight: 700, fontSize: 12 },
            labelBgStyle: { fill: '#f8fafc', stroke: '#94a3b8', strokeWidth: 1 }
          };
        }
        return e;
      }));
      setEdgeModal({ isOpen: false, edgeId: null, label: '' });
    } catch (error) { toast.error("Failed to save label"); }
  }, [edges, setEdges]);

  const handleExportZip = async () => {
    const exportData = {
      nodes: nodesRef.current.map(n => ({
        id: n.id, type: n.type, position_x: n.position.x, position_y: n.position.y,
        title: n.data.title, command: n.data.command, status: n.data.status,
        markdown_result: n.data.markdown_result, meta_tags: n.data.meta_tags
      })),
      edges: edgesRef.current.map(e => ({
        id: e.id, source: e.source, target: e.target, label: e.label || ""
      }))
    };
    const toastId = toast.loading('Packing ZIP file...');
    try {
      const response = await fetch(getApiUrl('/flow/export/'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportData)
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `PentestFlow_${engagementId}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Export successful!', { id: toastId });
    } catch (error) { toast.error('Failed to export', { id: toastId }); }
  };

  const handleTidyGraph = useCallback(async (direction = 'LR') => {
    const toastId = toast.loading(`Organizing nodes (${direction})...`);
    const { nodes: layoutedNodes } = getLayoutedElements(nodesRef.current, edges, direction);
    setNodes([...layoutedNodes]);
    try {
      await Promise.all(layoutedNodes.map(node =>
        apiCall(`/flow/nodes/${node.id}`, 'PUT', {
          title: node.data.title, type: node.type, command: node.data.command, status: node.data.status,
          markdown_result: node.data.markdown_result, meta_tags: node.data.meta_tags,
          position_x: node.position.x, position_y: node.position.y
        })
      ));
      toast.success('Graph organized!', { id: toastId });
    } catch (error) { toast.error('Failed to save layout', { id: toastId }); }
  }, [edges, setNodes]);

  const handleDuplicate = useCallback(async () => {
    const selectedNodes = nodesRef.current.filter(n => n.selected);
    if (selectedNodes.length === 0) return;
    const toastId = toast.loading('Duplicating...');
    try {
      const duplicatedReactNodes = [];
      for (const node of selectedNodes) {
        const newNode = await apiCall('/flow/nodes', 'POST', {
          title: `${node.data.title} (Copy)`, type: node.type, command: node.data.command,
          status: node.data.status, markdown_result: node.data.markdown_result,
          position_x: node.position.x + 50, position_y: node.position.y + 50,
          meta_tags: { ...node.data.meta_tags, parent_id: null }
        });
        duplicatedReactNodes.push({
          id: String(newNode.id), position: { x: newNode.position_x, y: newNode.position_y }, type: newNode.type, selected: true,
          data: { ...node.data, title: newNode.title, file_path: newNode.file_path } // POWDER BRIDGE INJECTION
        });
      }
      setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(duplicatedReactNodes));
      toast.success('Duplicated!', { id: toastId });
    } catch (error) { toast.error('Failed to duplicate', { id: toastId }); }
  }, [setNodes]);

  const handleGenerateReport = async (reportType = "full") => {
    const toastId = toast.loading('Generating PDF Report...');
    try {
      const response = await fetch(getApiUrl(`/flow/report/${engagementId}?type=${reportType}`), {
        method: 'GET',
        credentials: 'include'
      });
      if (!response.ok) throw new Error("Report failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Pentest_Report_${reportType}_${engagementId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Report downloaded!', { id: toastId });
    } catch (error) { toast.error('Failed to generate report', { id: toastId }); }
  };

  const handleExportSingleNode = async (nodeId, nodeTitle) => {
    const toastId = toast.loading('Exporting Node to PDF...');
    try {
      const response = await fetch(getApiUrl(`/flow/report/node/${nodeId}`), {
        method: 'GET',
        credentials: 'include'
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Node_Export_${nodeTitle.replace(/\s+/g, '_')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Node exported!', { id: toastId });
    } catch (error) { toast.error('Failed to export node', { id: toastId }); }
  };

  const onEdgeDoubleClick = useCallback((event, edge) => {
    event.stopPropagation();
    setEdgeModal({ isOpen: true, edgeId: edge.id, label: edge.label || '' });
  }, []);

  return {
    nodes, edges, selectedNode, deleteModal, edgeModal,
    onNodesChange, onEdgesChange, onNodeClick, onNodeDragStop,
    onNodesDelete, onEdgesDelete, onConnect, onEdgeDoubleClick,
    setSelectedNode, setDeleteModal, setEdgeModal, saveEdgeLabel, handleDeleteEdge,
    handleUpdateNode, handleDeleteNode, executeDelete, createStickyNote,
    handleExportZip, handleTidyGraph, onSelectionDragStop, handleDuplicate,
    handleGenerateReport, handleExportSingleNode, setNodes, setEdges
  };
}