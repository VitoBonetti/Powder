import { useState, useEffect, useCallback, useRef } from 'react';
import Login from './Login';
import Sidebar from './Sidebar';
import Editor from './components/Editor';
import Preview from './components/Preview';
import TabBar from './components/TabBar';
import TemplateModal from './components/TemplateModal';
import SearchModal from './components/SearchModal';
import GraphView from './components/GraphView';
import CanvasView from './components/canvas/CanvasView';
import { useAutoSave } from './hooks/useAutoSave';
import { getApiUrl, BACKEND_URL } from './config';
import { Eye, Edit3, Columns, Network, Map, CheckCircle2, Loader2, Search, AlertCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const [content, setContent] = useState("");
  const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'preview' | 'split' | 'graph'
  const [activeFile, setActiveFile] = useState(null);
  const [openTabs, setOpenTabs] = useState([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState("");
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const editorViewRef = useRef(null);
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);

  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  useEffect(() => {
    const handleRefresh = () => setSidebarRefreshKey(prev => prev + 1);
    window.addEventListener('trigger-sidebar-refresh', handleRefresh);
    return () => window.removeEventListener('trigger-sidebar-refresh', handleRefresh);
  }, []);

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
        // Note: Currently these Modals live inside Sidebar.jsx.
        // For a seamless V1 integration, we can dispatch a custom event that Sidebar listens to,
        // or we alert the user. The ideal future refactor is lifting Sidebar's Modals into App.jsx.
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

        // Substitute variables
        const textToInsert = data.content
          .replace(/\{\{date\}\}/g, now.toISOString().split('T')[0])
          .replace(/\{\{time\}\}/g, now.toTimeString().split(' ')[0].substring(0, 5))
          .replace(/\{\{title\}\}/g, title);

        const view = editorViewRef.current;
        const cursorPosition = view.state.selection.main.head;

        // Inject the text and move the cursor to the end of the injected text
        view.dispatch({
          changes: { from: cursorPosition, insert: textToInsert },
          selection: { anchor: cursorPosition + textToInsert.length }
        });

        view.focus(); // Keep the user typing seamlessly!
      }
    } catch (err) {
      console.error("Failed to insert template", err);
    }
  };

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

  const handleFileDelete = useCallback((deletedPath) => {
    setOpenTabs(prev => {
      // Close the exact file, OR any file that starts with the deleted folder's path
      const newTabs = prev.filter(t => t !== deletedPath && !t.startsWith(deletedPath + '/'));

      // If the file we were currently looking at just got closed, switch to the last open tab
      if (!newTabs.includes(activeFile)) {
        setActiveFile(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
      }
      return newTabs;
    });
  }, [activeFile]);

  const handleFileRename = useCallback((oldPath, newPath) => {
    setOpenTabs(prev => prev.map(t => (t === oldPath ? newPath : t)));
    if (activeFile === oldPath) {
      setActiveFile(newPath);
    }
  }, [activeFile]);

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
    <div className="flex h-screen bg-[#0d1117] text-[#c9d1d9] overflow-hidden font-sans">

      {!isSidebarHidden && (
        <div className="w-64 border-r border-gray-800 bg-[#0d1117] flex-shrink-0 transition-all">
          <Sidebar onFileSelect={openFileInTab} refreshTrigger={`${lastSaved}-${sidebarRefreshKey}`} onTagClick={handleTagClick} onFileDelete={handleFileDelete} onFileRename={handleFileRename} />
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden relative">

        {/* === NEW: THE FLOATING SIDEBAR TOGGLE BUTTON === */}
        <button
          onClick={() => setIsSidebarHidden(!isSidebarHidden)}
          className="absolute top-2 left-2 z-[999] p-1.5 bg-[#161b22] border border-gray-700 rounded-md text-gray-400 hover:text-white shadow-lg transition-colors flex items-center justify-center"
          title={isSidebarHidden ? "Show Sidebar" : "Hide Sidebar"}
        >
          {isSidebarHidden ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>

        {/* Dynamic margin added to TabBar so the floating button doesn't cover your first tab! */}
        <div className={isSidebarHidden ? "ml-10" : "ml-10"}>
          <TabBar tabs={openTabs} activeTab={activeFile} onTabSelect={setActiveFile} onTabClose={closeTab} />
        </div>

        {/* Floating View Mode Toolbar */}
        {activeFile && !isImageFile && (
          <div className="absolute bottom-8 right-8 z-20 flex bg-[#161b22] border border-gray-700 rounded-lg p-1 shadow-2xl opacity-50 hover:opacity-100 transition-opacity">
            <button
              onClick={() => setViewMode('edit')}
              title="Edit Mode"
              className={`p-1.5 rounded transition-colors ${viewMode === 'edit' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('split')}
              title="Split Mode"
              className={`p-1.5 rounded transition-colors ${viewMode === 'split' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              <Columns className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('preview')}
              title="Preview Mode"
              className={`p-1.5 rounded transition-colors ${viewMode === 'preview' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              <Eye className="w-4 h-4" />
            </button>
            <div className="w-px bg-gray-700 mx-1"></div> {/* Visual Divider */}

            <button
              onClick={() => setViewMode('graph')}
              title="Knowledge Graph"
              className={`p-1.5 rounded transition-colors ${viewMode === 'graph' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              <Network className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('canvas')}
              title="Pentest Canvas"
              className={`p-1.5 rounded transition-colors ${viewMode === 'canvas' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              <Map className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* The Content Layout Engine */}
        <div className="flex-1 overflow-hidden p-4">
          {viewMode === 'graph' ? (
            <div className="h-full w-full max-w-[1600px] mx-auto pb-4">
              <GraphView onNodeClick={(path) => {
                openFileInTab(path);
                setViewMode('edit'); // Automatically switch to edit mode when a node is clicked
              }} />
            </div>
          ) : !activeFile ? (
            <div className="h-full flex items-center justify-center text-gray-500">Select a note from the sidebar to start writing.</div>
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
            /* 2. EXPAND PREVIEW WIDTH */
            <div className="h-full overflow-y-auto w-full max-w-[1400px] mx-auto px-8 py-6">
              <Preview content={content} onLinkClick={handleLinkClick} onTagClick={handleTagClick} />
            </div>
          ) : viewMode === 'canvas' ? (
           <div className="h-full w-full p-2">
              <CanvasView activeFile={activeFile} setActiveFile={setActiveFile} />
           </div>
          ) : (
            /* 3. EXPAND EDIT WIDTH */
            <div className="h-full overflow-y-auto w-full max-w-[1400px] mx-auto px-8 py-6">
              <Editor content={content} onChange={setContent} onLinkClick={handleLinkClick} onTagClick={handleTagClick} onOpenTemplate={handleOpenTemplateModal} />
            </div>
          )}
        </div>

      </main>

      <SearchModal isOpen={isSearchOpen} onClose={() => { setIsSearchOpen(false); setSearchInitialQuery(""); }} onSelect={openFileInTab} onCommand={handleGlobalCommand} initialQuery={searchInitialQuery} />
      <TemplateModal isOpen={isTemplateModalOpen} onClose={() => setIsTemplateModalOpen(false)} onSelect={handleInsertTemplate} />
    </div>
  );
}

export default App;