import { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { getApiUrl } from '../config';
import { Loader2 } from 'lucide-react';

export default function GraphView({ onNodeClick }) {
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

  // Make the canvas responsive
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

    // Give layout a tiny buffer to settle before calculating width
    setTimeout(resize, 50);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const handleNodeClick = useCallback((node) => {
    if (node.group === 'note') {
      onNodeClick(node.id); // Open the note as a tab
    } else if (node.group === 'ghost') {
      // Optional: Ask user if they want to create this ghost note
      alert(`Ghost Node: ${node.name} does not exist yet.`);
    }
  }, [onNodeClick]);

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-blue-500"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div ref={containerRef} className="w-full h-full bg-[#010409] rounded-xl overflow-hidden shadow-inner border border-gray-800">
      <ForceGraph2D
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeLabel="name"
        nodeColor={node => {
          if (node.group === 'note') return '#3b82f6'; // Blue for notes
          if (node.group === 'tag') return '#10b981'; // Green for tags
          return '#4b5563'; // Gray for ghost/uncreated links
        }}
        nodeRelSize={6}
        linkColor={() => '#30363d'} // Subtle gray for connecting lines
        onNodeClick={handleNodeClick}
        enableNodeDrag={true}
        enableZoomPanInteraction={true}
      />
    </div>
  );
}