import { useState, useEffect, useCallback } from 'react';
import Login from './Login';
import Sidebar from './Sidebar';
import Editor from './components/Editor';
import Preview from './components/Preview';
import TabBar from './components/TabBar';
import SearchModal from './components/SearchModal';
import { useAutoSave } from './hooks/useAutoSave';
import { getApiUrl, BACKEND_URL } from './config';
import { Eye, Edit3, CheckCircle2, Loader2, Search } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const [content, setContent] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [activeFile, setActiveFile] = useState(null);
  const [openTabs, setOpenTabs] = useState([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState("");

  const handleTagClick = useCallback((tag) => {
    setSearchInitialQuery(tag);
    setIsSearchOpen(true);
  }, []);

  const isImageFile = activeFile && activeFile.match(/\.(png|jpe?g|gif|webp|svg)$/i);

  // Hook handles auto-save implicitly
  const { saveStatus, setSaveStatus, lastSaved } = useAutoSave(content, activeFile, isImageFile);

  // Auth check
  useEffect(() => {
    fetch(getApiUrl('/auth/me'), { credentials: 'include' })
      .then(res => setIsAuthenticated(res.ok))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setIsLoadingAuth(false));
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setIsSearchOpen(true); }
      if (e.key === 'Escape') setIsSearchOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch file content when tab changes
  useEffect(() => {
    if (!activeFile) { setContent(""); return; }
    if (isImageFile) { setSaveStatus("saved"); return; }

    setSaveStatus("saving");
    fetch(getApiUrl(`/notes/${activeFile}`), { credentials: 'include' })
      .then(async res => res.ok ? res.json() : { content: "" })
      .then(data => { setContent(data.content); setSaveStatus("saved"); })
      .catch(() => { setContent(""); setSaveStatus("saved"); });
  }, [activeFile, isImageFile, setSaveStatus]);

  const handleLinkClick = useCallback((target) => {
    fetch(getApiUrl(`/resolve-link?target=${encodeURIComponent(target)}`), { credentials: 'include' })
      .then(res => res.json())
      .then(data => openFileInTab(data.path))
      .catch(err => console.error("Link resolution failed:", err));
  }, [openTabs]);

  const openFileInTab = (path) => {
    if (!openTabs.includes(path)) setOpenTabs(prev => [...prev, path]);
    setActiveFile(path);
  };

  const closeTab = (e, path) => {
    e.stopPropagation();
    const newTabs = openTabs.filter(t => t !== path);
    setOpenTabs(newTabs);
    if (activeFile === path) setActiveFile(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
  };

  if (isLoadingAuth) return <div className="min-h-screen bg-[#0d1117] flex items-center justify-center text-[#60a5fa] font-mono text-xl animate-pulse">Decrypting Vault...</div>;
  if (!isAuthenticated) return <Login />;

  return (
    <div className="flex h-screen bg-[#0d1117] text-white overflow-hidden">
      <Sidebar onFileSelect={openFileInTab} refreshTrigger={lastSaved} onTagClick={handleTagClick} />

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <TabBar tabs={openTabs} activeTab={activeFile} onTabSelect={setActiveFile} onTabClose={closeTab} />

        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-6 bg-[#0d1117] z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-300">{activeFile || "No file selected"}</span>
            {saveStatus === "saving" && <span className="flex items-center text-xs text-blue-400"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</span>}
            {saveStatus === "saved" && <span className="flex items-center text-xs text-green-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Saved</span>}
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => setIsSearchOpen(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-white bg-[#161b22] border border-gray-700 hover:border-gray-500 rounded-md transition-colors">
              <Search className="w-3.5 h-3.5" /> <span>Search...</span><kbd className="hidden sm:inline-block bg-gray-800 border border-gray-700 px-1.5 rounded text-[10px] ml-2">Ctrl K</kbd>
            </button>
            <button onClick={() => setIsPreview(!isPreview)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors">
              {isPreview ? <><Edit3 className="w-4 h-4" /> Edit Mode</> : <><Eye className="w-4 h-4" /> Reading Mode</>}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-10">
          <div className="w-full max-w-6xl mx-auto h-full">
            {!activeFile ? (
              <div className="h-full flex items-center justify-center text-gray-500">Select a note from the sidebar to start writing.</div>
            ) : isImageFile ? (
              <div className="h-full flex flex-col items-center justify-center pb-20">
                <div className="bg-[#161b22] p-4 rounded-xl border border-gray-800 shadow-2xl max-w-4xl w-full flex justify-center">
                  <img src={`${BACKEND_URL}/${activeFile}`} alt={activeFile} className="max-w-full max-h-[70vh] object-contain rounded-md" />
                </div>
                <p className="mt-4 text-gray-500 text-sm font-mono">{activeFile}</p>
              </div>
            ) : isPreview ? (
              <Preview content={content} onLinkClick={handleLinkClick} />
            ) : (
              <Editor content={content} onChange={setContent} onLinkClick={handleLinkClick} onTagClick={handleTagClick} />
            )}
          </div>
        </div>
      </main>

      <SearchModal isOpen={isSearchOpen} onClose={() => { setIsSearchOpen(false); setSearchInitialQuery(""); }} onSelect={openFileInTab} initialQuery={searchInitialQuery} />
    </div>
  );
}

export default App;