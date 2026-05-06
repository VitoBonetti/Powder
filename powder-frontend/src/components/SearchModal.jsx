import { useState, useEffect, useRef } from 'react';
import { Search, FileText, Hash, Terminal, Settings, Plus, LogOut } from 'lucide-react';
import { getApiUrl } from '../config';

const COMMAND_REGISTRY = [
  { id: 'cmd-new-note', label: 'Create New Note', icon: Plus },
  { id: 'cmd-settings', label: 'Open Settings', icon: Settings },
  { id: 'cmd-reindex', label: 'Rebuild Database Index', icon: Terminal },
  { id: 'cmd-logout', label: 'Logout', icon: LogOut },
];

export default function SearchModal({ isOpen, onClose, onSelect, onCommand, initialQuery = "" }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState([]);
  const [mode, setMode] = useState("search"); // 'search', 'tag_suggestion', 'tag_search', 'command'
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [vaultTags, setVaultTags] = useState([]); // NEW: Local tag dictionary
  const searchInputRef = useRef(null);

  // Reset state and fetch tags on open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery(initialQuery);
      setSelectedIndex(0);
      if (searchInputRef.current) searchInputRef.current.focus();

      // Fetch tags to populate the autocomplete dictionary
      fetch(getApiUrl('/tags'), { credentials: 'include' })
        .then(res => res.json())
        .then(data => setVaultTags(data))
        .catch(err => console.error("Failed to load tags:", err));
    } else {
      setSearchQuery("");
      setResults([]);
    }
  }, [isOpen, initialQuery]);

  // Handle Mode Routing & Data Fetching
  useEffect(() => {
    setSelectedIndex(0);
    const query = searchQuery.trimStart(); // Allow trailing space to trigger actual search

    if (!query) {
      setResults([]);
      setMode("search");
      return;
    }

    // --- COMMAND MODE ---
    if (query.startsWith('>')) {
      setMode("command");
      const cmdQuery = query.slice(1).trim().toLowerCase();
      const filtered = COMMAND_REGISTRY.filter(cmd =>
        cmd.label.toLowerCase().includes(cmdQuery)
      );
      setResults(filtered.map(cmd => ({ type: 'command', ...cmd })));
      return;
    }

    // --- TAG MODE ---
    if (query.startsWith('#')) {
      const rawTag = query.slice(1);

      // Phase 1: If they haven't typed a space yet, show autocomplete suggestions
      if (!searchQuery.endsWith(' ')) {
        setMode('tag_suggestion');
        const term = rawTag.toLowerCase();
        const matches = vaultTags.filter(t => t.tag.toLowerCase().includes(term));
        setResults(matches.map(t => ({ type: 'tag_suggestion', label: t.tag, count: t.count })));
        return;
      }

      // Phase 2: They added a space (e.g. "#security "). Execute the backend file search!
      setMode('tag_search');
      const exactTag = rawTag.trim();

      const delayDebounceFn = setTimeout(() => {
        fetch(getApiUrl(`/search/tag?tag=${encodeURIComponent(exactTag)}`), { credentials: 'include' })
        .then(res => res.json())
        .then(data => setResults(data.map(d => ({ type: 'file', ...d }))))
        .catch(err => console.error("Search failed:", err));
      }, 300);

      return () => clearTimeout(delayDebounceFn);
    }

    // --- NORMAL SEARCH MODE ---
    setMode("search");
    const delayDebounceFn = setTimeout(() => {
      fetch(getApiUrl(`/search?q=${encodeURIComponent(query)}`), { credentials: 'include' })
      .then(res => res.json())
      .then(data => setResults(data.map(d => ({ type: 'file', ...d }))))
      .catch(err => console.error("Search failed:", err));
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, vaultTags]);

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
      onClose();
    } else if (mode === 'tag_suggestion') {
      // AUTOCOMPLETE: Append a space to trigger the file search
      setSearchQuery(`#${item.label} `);
      // We do NOT close the modal here, so the user can see the files appear!
    } else {
      onSelect(item.path);
      onClose();
    }
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

            // RENDERING: COMMANDS
            if (result.type === 'command') {
              const Icon = result.icon;
              return (
                <div key={result.id} onMouseEnter={() => setSelectedIndex(idx)} onClick={() => executeSelection(result)} className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-900/40 border-l-2 border-blue-500' : 'border-l-2 border-transparent hover:bg-gray-800/50'}`}>
                  <Icon className={`w-4 h-4 mr-3 ${isSelected ? 'text-blue-400' : 'text-gray-400'}`} />
                  <span className={`text-sm ${isSelected ? 'text-white' : 'text-gray-300'}`}>{result.label}</span>
                </div>
              );
            }

            // RENDERING: TAG SUGGESTIONS
            if (result.type === 'tag_suggestion') {
              return (
                <div key={idx} onMouseEnter={() => setSelectedIndex(idx)} onClick={() => executeSelection(result)} className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-900/40 border-l-2 border-blue-500' : 'border-l-2 border-transparent hover:bg-gray-800/50'}`}>
                  <div className={`flex items-center text-sm font-medium ${isSelected ? 'text-blue-300' : 'text-blue-400'}`}>
                    <Hash className="w-4 h-4 mr-2" />
                    {result.label}
                  </div>
                  <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{result.count} files</span>
                </div>
              );
            }

            // RENDERING: FILES (From Normal Search or Tag Search)
            return (
              <div key={idx} onMouseEnter={() => setSelectedIndex(idx)} onClick={() => executeSelection(result)} className={`group flex flex-col px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-900/40 border-l-2 border-blue-500' : 'border-l-2 border-transparent border-b border-gray-800/50 hover:bg-gray-800/50'}`}>
                <div className={`flex items-center text-sm font-medium mb-1 ${isSelected ? 'text-blue-300' : 'text-blue-400'}`}>
                  <FileText className="w-4 h-4 mr-2" />
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