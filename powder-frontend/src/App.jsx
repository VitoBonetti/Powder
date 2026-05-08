import { useState, useEffect, useCallback, useRef } from 'react';
import Login from './Login';
import Sidebar from './Sidebar';
import Editor from './components/Editor';
import Preview from './components/Preview';
import TabBar from './components/TabBar';
import TemplateModal from './components/TemplateModal';
import SearchModal from './components/SearchModal';
import GraphView from './components/GraphView';
import LandingPage from './pages/LandingPage';
import CanvasPage from './components/CanvasPage';
import { useAutoSave } from './hooks/useAutoSave';
import { getApiUrl, BACKEND_URL } from './config';
import { Eye, Edit3, Columns, Network, CheckCircle2, Loader2, Search, AlertCircle } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [appMode, setAppMode] = useState('vault'); // 'vault' | 'flow-landing' | 'flow-canvas'
  const [activeEngagementId, setActiveEngagementId] = useState(null);
  const [content, setContent] = useState("");
  const [viewMode, setViewMode] = useState('edit');
  const [activeFile, setActiveFile] = useState(null);
  const [openTabs, setOpenTabs] = useState([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState("");
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const editorViewRef = useRef(null);;

  // Handle Global Commands dispatched from the Omnibar
  const handleGlobalCommand = async (commandId) => {
    switch(commandId) {
      case 'cmd-logout':
        try {
          await fetch(getApiUrl('/auth/logout'), { method: 'POST', credentials: 'include' });
          window.location.href = "/";
        } catch (err) { console.error("Logout failed", err); }
        break;
      case 'cmd-reindex':
        fetch(getApiUrl('/reindex'), { method: 'POST', credentials: 'include' })
          .then(() => alert("Database successfully rebuilt!"))
          .catch(err => alert("Failed to rebuild: " + err));
        break;
      case 'cmd-settings':
      case 'cmd-new-note':
        window.dispatchEvent(new CustomEvent('powder-action', { detail: { action: commandId } }));
        break;
      default:
        console.warn("Unknown command:", commandId);
    }
  };

  const handleTagClick = useCallback((tag) => {
    setSearchInitialQuery(tag);
    setIsSearchOpen(true);
  }, []);

  // Opens the modal and saves the Editor engine reference
  const handleOpenTemplateModal = useCallback((view) => {
    editorViewRef.current = view;
    setIsTemplateModalOpen(true);
  }, []);

  // Fetches the template and injects it exactly at the cursor
  const handleInsertTemplate = async (templateName) => {
    setIsTemplateModalOpen(false);
    if (!editorViewRef.current) return;
    try {
      const res = await fetch(getApiUrl(`/notes/_Templates/${templateName}`), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const now = new Date();
        const title = activeFile ? activeFile.split('/').pop().replace('.md', '') : "Note";
        const textToInsert = data.content
          .replace(/\{\{date\}\}/g, now.toISOString().split('T')[0])
          .replace(/\{\{time\}\}/g, now.toTimeString().split(' ')[0].substring(0, 5))
          .replace(/\{\{title\}\}/g, title);
        const view = editorViewRef.current;
        const cursorPosition = view.state.selection.main.head;
        view.dispatch({
          changes: { from: cursorPosition, insert: textToInsert },
          selection: { anchor: cursorPosition + textToInsert.length }
        });
        view.focus();
      }
    } catch (err) { console.error("Failed to insert template", err); }
  };

  const isImageFile = activeFile && activeFile.match(/\.(png|jpe?g|gif|webp|svg)$/i);
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

  const handleFileDelete = useCallback((deletedPath) => {
    setOpenTabs(prev => {
      const newTabs = prev.filter(t => t !== deletedPath && !t.startsWith(deletedPath + '/'));
      if (!newTabs.includes(activeFile)) setActiveFile(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
      return newTabs;
    });
  }, [activeFile]);

  const handleFileRename = useCallback((oldPath, newPath) => {
    setOpenTabs(prev => prev.map(t => (t === oldPath ? newPath : t)));
    if (activeFile === oldPath) setActiveFile(newPath);
  }, [activeFile]);

  const openFileInTab = (path) => {
    if (!openTabs.includes(path)) setOpenTabs(prev => [...prev, path]);
    setActiveFile(path);
    setAppMode('vault'); // Force switch back to vault if a file is clicked
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
    <div className="flex h-screen bg-[#0d1117] text-[#c9d1d9] overflow-hidden font-sans">
      <Sidebar
        onFileSelect={openFileInTab}
        refreshTrigger={lastSaved}
        onTagClick={handleTagClick}
        onFileDelete={handleFileDelete}
        onFileRename={handleFileRename}
        onAppModeChange={setAppMode}
      />

      <main className="flex-1 flex flex-col overflow-hidden relative">

        {/* RENDER THE ACTIVE APP MODE */}
        {appMode === 'flow-landing' ? (
          <div className="h-full overflow-y-auto">
            <LandingPage onSelectEngagement={(id) => { setActiveEngagementId(id); setAppMode('flow-canvas'); }} />
          </div>
        ) : appMode === 'flow-canvas' ? (
           <CanvasPage engagementId={activeEngagementId} onBack={() => setAppMode('flow-landing')} />
        ) : (
          <>
            <TabBar tabs={openTabs} activeTab={activeFile} onTabSelect={setActiveFile} onTabClose={closeTab} />

            {/* Floating View Mode Toolbar */}
            {activeFile && !isImageFile && (
              <div className="absolute bottom-8 right-8 z-20 flex bg-[#161b22] border border-gray-700 rounded-lg p-1 shadow-2xl opacity-50 hover:opacity-100 transition-opacity">
                <button onClick={() => setViewMode('edit')} title="Edit Mode" className={`p-1.5 rounded transition-colors ${viewMode === 'edit' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}> <Edit3 className="w-4 h-4" /> </button>
                <button onClick={() => setViewMode('split')} title="Split Mode" className={`p-1.5 rounded transition-colors ${viewMode === 'split' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}> <Columns className="w-4 h-4" /> </button>
                <button onClick={() => setViewMode('preview')} title="Preview Mode" className={`p-1.5 rounded transition-colors ${viewMode === 'preview' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}> <Eye className="w-4 h-4" /> </button>
                <div className="w-px bg-gray-700 mx-1"></div>
                <button onClick={() => setViewMode('graph')} title="Knowledge Graph" className={`p-1.5 rounded transition-colors ${viewMode === 'graph' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}> <Network className="w-4 h-4" /> </button>
              </div>
            )}

            {/* The Content Layout Engine */}
            <div className="flex-1 overflow-hidden p-4">
              {viewMode === 'graph' ? (
                <div className="h-full w-full max-w-[1600px] mx-auto pb-4">
                  <GraphView onNodeClick={(path) => { openFileInTab(path); setViewMode('edit'); }} />
                </div>
              ) : !activeFile ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <Network className="w-16 h-16 mb-4 text-gray-700" />
                  <p>Select a note from the sidebar to start writing.</p>
                </div>
              ) : isImageFile ? (
                <div className="h-full overflow-y-auto flex flex-col items-center justify-center pb-20">
                  <div className="bg-[#161b22] p-4 rounded-xl border border-gray-800 shadow-2xl max-w-4xl w-full flex justify-center">
                    <img src={`${BACKEND_URL}/${activeFile}`} alt={activeFile} className="max-w-full max-h-[70vh] object-contain rounded-md" />
                  </div>
                </div>
              ) : viewMode === 'split' ? (
                <div className="flex h-full gap-6">
                  <div className="flex-1 overflow-y-auto border-r border-gray-800 pr-4 hide-scroll">
                    <Editor content={content} onChange={setContent} onLinkClick={handleLinkClick} onTagClick={handleTagClick} onOpenTemplate={handleOpenTemplateModal} />
                  </div>
                  <div className="flex-1 overflow-y-auto pl-2 hide-scroll">
                    <Preview content={content} onLinkClick={handleLinkClick} onTagClick={handleTagClick} />
                  </div>
                </div>
              ) : viewMode === 'preview' ? (
                <div className="h-full overflow-y-auto w-full max-w-[1400px] mx-auto px-8 py-6">
                  <Preview content={content} onLinkClick={handleLinkClick} onTagClick={handleTagClick} />
                </div>
              ) : (
                <div className="h-full overflow-y-auto w-full max-w-[1400px] mx-auto px-8 py-6">
                  <Editor content={content} onChange={setContent} onLinkClick={handleLinkClick} onTagClick={handleTagClick} onOpenTemplate={handleOpenTemplateModal} />
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <SearchModal isOpen={isSearchOpen} onClose={() => { setIsSearchOpen(false); setSearchInitialQuery(""); }} onSelect={openFileInTab} onCommand={handleGlobalCommand} initialQuery={searchInitialQuery} />
      <TemplateModal isOpen={isTemplateModalOpen} onClose={() => setIsTemplateModalOpen(false)} onSelect={handleInsertTemplate} />
    </div>
  );
}

export default App;