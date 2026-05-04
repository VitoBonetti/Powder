import { useState, useEffect } from 'react';
import { Folder, FileText, ChevronRight, ChevronDown } from 'lucide-react';

// 1. The Recursive Component
// This function calls ITSELF if it finds a folder inside a folder!
const TreeNode = ({ node }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isFolder = node.type === 'folder';

  if (!isFolder) {
    return (
      <div className="flex items-center pl-4 py-1.5 hover:bg-gray-800 cursor-pointer text-gray-300 text-sm rounded-md transition-colors">
        <FileText className="w-4 h-4 mr-2 text-gray-500" />
        <span className="truncate">{node.name}</span>
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex items-center py-1.5 hover:bg-gray-800 cursor-pointer text-gray-200 text-sm font-medium rounded-md transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <ChevronDown className="w-4 h-4 mr-1 text-gray-500" /> : <ChevronRight className="w-4 h-4 mr-1 text-gray-500" />}
        <Folder className="w-4 h-4 mr-2 text-blue-400" />
        <span className="truncate">{node.name}</span>
      </div>

      {/* If the folder is open, map through its children and render them using this exact same component */}
      {isOpen && node.children && (
        <div className="pl-3 border-l border-gray-700 ml-2 mt-1">
          {node.children.map((child, index) => (
            <TreeNode key={index} node={child} />
          ))}
        </div>
      )}
    </div>
  );
};

// 2. The Main Sidebar Container
export default function Sidebar() {
  const [tree, setTree] = useState(null);

  // Fetch the data from Python as soon as the component loads
  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/tree')
      .then(res => res.json())
      .then(data => setTree(data))
      .catch(err => console.error("Failed to fetch tree:", err));
  }, []);

  return (
    <div className="w-64 h-screen bg-[#111319] border-r border-gray-800 p-4 flex flex-col">
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 px-2">Powder Vault</h2>
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {tree ? <TreeNode node={tree} /> : <div className="text-gray-500 text-sm px-2 animate-pulse">Loading vault...</div>}
      </div>
    </div>
  );
}