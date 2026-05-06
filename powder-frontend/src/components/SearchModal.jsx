import { useState, useEffect, useRef } from 'react';
import { Search, FileText, Hash, Terminal, Settings, Plus, LogOut } from 'lucide-react';
import { getApiUrl } from '../config';

// 1. Define available global commands
const COMMAND_REGISTRY = [
  { id: 'cmd-new-note', label: 'Create New Note', icon: Plus },
  { id: 'cmd-settings', label: 'Open Settings', icon: Settings },
  { id: 'cmd-reindex', label: 'Rebuild Database Index', icon: Terminal },
  { id: 'cmd-logout', label: 'Logout', icon: LogOut },
];

export default function SearchModal({ isOpen, onClose, onSelect, onCommand, initialQuery = "" }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState([]);
  const [mode, setMode] = useState("search"); // 'search', 'tag', 'command'
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef(null);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setSearchQuery(initialQuery);
      setSelectedIndex(0);
      if (searchInputRef.current) searchInputRef.current.focus();
    } else {
      setSearchQuery("");
      setResults([]);
    }
  }, [isOpen, initialQuery]);

  // Handle Mode Routing & Data Fetching
  useEffect(() => {
    setSelectedIndex(0); // Reset selection when query changes
    const query = searchQuery.trim();

    if (!query) {
      setResults([]);
      setMode("search");
      return;
    }

    if (query.startsWith('>')) {
      setMode("command");
      const cmdQuery = query.slice(1).trim().toLowerCase();
      const filtered = COMMAND_REGISTRY.filter(cmd =>
        cmd.label.toLowerCase().includes(cmdQuery)
      );
      setResults(filtered);
      return;
    }

    // Debounced Backend Search
    const delayDebounceFn = setTimeout(() => {
      const isTag = query.startsWith('#');
      setMode(isTag ? "tag" : "search");
      const endpoint = isTag
        ? `/search/tag?tag=${encodeURIComponent(query.slice(1))}`
        : `/search?q=${encodeURIComponent(query)}`;

      fetch(getApiUrl(endpoint), { credentials: 'include' })
      .then(res => res.json())
      .then(data => setResults(data))
      .catch(err => console.error("Search failed:", err));
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Handle Keyboard Navigation
  const handleKeyDown = (e) => {
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeSelection(results[selectedIndex]);
    }
  };

  const executeSelection = (item) => {
    if (mode === 'command') {
      onCommand(item.id);
    } else {
      onSelect(item.path);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center pt-[10vh] px-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[#161b22] border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">

        {/* Input Area */}
        <div className="flex items-center px-4 py-4 border-b border-gray-800">
          {mode === 'command' ? <Terminal className="w-5 h-5 text-green-500 mr-3" /> : <Search className="w-5 h-5 text-gray-500 mr-3" />}
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type > for commands, # for tags, or search text..."
            className="flex-1 bg-transparent border-none text-gray-100 text-lg placeholder-gray-500 focus:outline-none focus:ring-0"
          />
        </div>

        {/* Results Area */}
        <div className="max-h-[60vh] overflow-y-auto pb-2">
          {searchQuery && results.length === 0 && (
            <div className="p-8 text-center text-gray-500">No results found.</div>
          )}

          {results.map((result, idx) => {
            const isSelected = idx === selectedIndex;

            // COMMAND RENDERING
            if (mode === 'command') {
              const Icon = result.icon;
              return (
                <div
                  key={result.id}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => executeSelection(result)}
                  className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-900/40 border-l-2 border-blue-500' : 'border-l-2 border-transparent hover:bg-gray-800/50'}`}
                >
                  <Icon className={`w-4 h-4 mr-3 ${isSelected ? 'text-blue-400' : 'text-gray-400'}`} />
                  <span className={`text-sm ${isSelected ? 'text-white' : 'text-gray-300'}`}>{result.label}</span>
                </div>
              );
            }

            // SEARCH / TAG RENDERING
            return (
              <div
                key={idx}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => executeSelection(result)}
                className={`group flex flex-col px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-900/40 border-l-2 border-blue-500' : 'border-l-2 border-transparent border-b border-gray-800/50 hover:bg-gray-800/50'}`}
              >
                <div className={`flex items-center text-sm font-medium mb-1 ${isSelected ? 'text-blue-300' : 'text-blue-400'}`}>
                  {mode === 'tag' ? <Hash className="w-4 h-4 mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                  {result.path}
                </div>
                <div className={`text-xs pl-6 line-clamp-1 italic ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>
                  {result.snippet}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}