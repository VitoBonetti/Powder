import { useState, useEffect } from 'react';
import { FileText, X } from 'lucide-react';
import { getApiUrl } from '../config';

export default function TemplateModal({ isOpen, onClose, onSelect }) {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    
    // Fetch the tree to find the _Templates folder
    fetch(getApiUrl('/tree'), { credentials: 'include' })
      .then(res => res.json())
      .then(tree => {
        const tempFolder = tree.children?.find(c => c.name === '_Templates');
        if (tempFolder && tempFolder.children) {
          setTemplates(tempFolder.children.filter(f => f.type === 'file'));
        } else {
          setTemplates([]);
        }
      })
      .catch(err => console.error("Failed to fetch templates:", err))
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-[20vh] px-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[#161b22] border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Insert Template</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded transition-colors"><X className="w-4 h-4" /></button>
        </div>
        
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500 text-sm animate-pulse">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">No templates found in _Templates folder.</div>
          ) : (
            templates.map((t, idx) => (
              <button
                key={idx}
                onClick={() => onSelect(t.name)}
                className="w-full flex items-center px-3 py-2.5 hover:bg-blue-900/30 text-gray-300 hover:text-blue-400 rounded-md transition-colors text-sm text-left group"
              >
                <FileText className="w-4 h-4 mr-3 opacity-50 group-hover:opacity-100" />
                {t.name}
              </button>
            ))
          )}
        </div>
        
        <div className="bg-gray-900/80 px-4 py-2 border-t border-gray-800 text-[10px] text-gray-500 flex justify-between items-center">
          <span>Variables: {'{{title}}, {{date}}, {{time}}'}</span>
          <kbd className="bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded text-gray-400">ESC</kbd>
        </div>
      </div>
    </div>
  );
}