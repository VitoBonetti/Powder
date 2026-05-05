import { useState, useEffect, useRef } from 'react';
import { Search, FileText } from 'lucide-react';

export default function SearchModal({ isOpen, onClose, onSelect }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && searchInputRef.current) searchInputRef.current.focus();
    else { setSearchQuery(""); setSearchResults([]); }
  }, [isOpen]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const delayDebounceFn = setTimeout(() => {
      fetch(`http://localhost:8000/api/search?q=${encodeURIComponent(searchQuery)}`, {
        credentials: 'include'
      })
      .then(res => res.json())
      .then(data => setSearchResults(data))
      .catch(err => console.error("Search failed:", err));
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center pt-[10vh] px-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[#161b22] border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">
        <div className="flex items-center px-4 py-4 border-b border-gray-800">
          <Search className="w-5 h-5 text-gray-500 mr-3" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your vault..."
            className="flex-1 bg-transparent border-none text-gray-100 text-lg placeholder-gray-500 focus:outline-none focus:ring-0"
          />
          <kbd className="hidden sm:inline-block text-gray-500 text-xs px-2 py-1 bg-gray-900 border border-gray-800 rounded">ESC to close</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {searchQuery && searchResults.length === 0 && <div className="p-8 text-center text-gray-500">No results found for "{searchQuery}"</div>}
          {searchResults.map((result, idx) => (
            <div key={idx} onClick={() => { onSelect(result.path); onClose(); }} className="group flex flex-col px-4 py-3 border-b border-gray-800/50 hover:bg-blue-900/20 cursor-pointer transition-colors">
              <div className="flex items-center text-sm font-medium text-blue-400 mb-1"><FileText className="w-4 h-4 mr-2" />{result.path}</div>
              <div className="text-xs text-gray-400 pl-6 line-clamp-1 italic">{result.snippet}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}