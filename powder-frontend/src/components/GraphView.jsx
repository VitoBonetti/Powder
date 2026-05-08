import { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { getApiUrl } from '../config';
import { Loader2 } from 'lucide-react';

export default function GraphView({ onNodeClick, theme = 'dark' }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef(null);

  useEffect(() => {
    setIsLoading(true);
    fetch(getApiUrl('/graph'), { credentials: 'include' })
      .then(res => res.json())
      .then(data => setGraphData(data))
      .catch(err => console.error("Failed to load graph:", err))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const resize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', resize);
    resize();
    setTimeout(resize, 50);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const handleNodeClick = useCallback((node) => {
    if (node.group === 'note') {
      onNodeClick(node.id);
    } else if (node.group === 'ghost') {
      alert(`Ghost Node: ${node.name} does not exist yet.`);
    }
  }, [onNodeClick]);

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-blue-500"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    // Dynamic background and border color for the container
    <div ref={containerRef} className="w-full h-full bg-slate-50 dark:bg-[#010409] rounded-xl overflow-hidden shadow-inner border border-slate-300 dark:border-gray-800 transition-colors">
      <ForceGraph2D
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeLabel="name"
        nodeColor={node => {
          if (node.group === 'note') return '#3b82f6';
          if (node.group === 'tag') return '#10b981';
          return '#94a3b8'; // Lighter gray for ghost nodes
        }}
        nodeRelSize={6}
        // Dynamic link color based on theme
        linkColor={() => theme === 'dark' ? '#30363d' : '#cbd5e1'}
        onNodeClick={handleNodeClick}
        enableNodeDrag={true}
        enableZoomPanInteraction={true}
      />
    </div>
  );
}