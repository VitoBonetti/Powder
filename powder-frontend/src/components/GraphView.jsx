import { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { getApiUrl } from '../config';
import { Loader2 } from 'lucide-react';

export default function GraphView({ onNodeClick, theme = 'dark' }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 }); // Start at 0 so it forces a calculate
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
        // Use getBoundingClientRect for absolute pixel precision
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };

    // Attach listener
    window.addEventListener('resize', resize);

    // Trigger multiple resizes to catch React rendering layout shifts
    resize();
    const timeout1 = setTimeout(resize, 50);
    const timeout2 = setTimeout(resize, 300); // Catch late UI shifts

    return () => {
      window.removeEventListener('resize', resize);
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    };
  }, [isLoading]); // Re-run resize when loading finishes

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
    // Added flex-1 and min-h-0 to force the container to fill the parent properly
    <div ref={containerRef} className="flex-1 w-full h-full min-h-0 bg-slate-50 dark:bg-[#010409] rounded-xl overflow-hidden shadow-inner border border-slate-300 dark:border-gray-800 transition-colors">
      {dimensions.width > 0 && dimensions.height > 0 && (
        <ForceGraph2D
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel="name"
          nodeColor={node => {
            if (node.group === 'note') return '#3b82f6';
            if (node.group === 'tag') return '#10b981';
            return '#94a3b8';
          }}
          nodeRelSize={6}
          linkColor={() => theme === 'dark' ? '#30363d' : '#cbd5e1'}
          onNodeClick={handleNodeClick}
          enableNodeDrag={true}
          enableZoomPanInteraction={true}
        />
      )}
    </div>
  );
}