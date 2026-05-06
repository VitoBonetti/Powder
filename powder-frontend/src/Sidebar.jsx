import { useState, useEffect, useRef, useCallback } from 'react';
import { Folder, FileText, ChevronRight, ChevronDown, Plus, FolderPlus, Trash2, X, Upload, Image as ImageIcon, LogOut, Settings, Hash } from 'lucide-react';
import { getApiUrl, BACKEND_URL } from './config';
import { limitConcurrency } from './utils/concurrency';

// --- CUSTOM MODAL COMPONENT ---
const Modal = ({ isOpen, onClose, title, children, actionLabel, onAction, actionVariant = "primary" }) => {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actionButtonClasses = actionVariant === "danger"
    ? "px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
    : "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors";

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div ref={modalRef} className="bg-[#161b22] border border-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white rounded p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="text-gray-300 text-sm">{children}</div>
        <div className="flex justify-end gap-3 mt-3">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md text-sm font-medium transition-colors">
            Cancel
          </button>
          {actionLabel && (
            <button onClick={onAction} className={actionButtonClasses}>
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// --- TreeNode Component ---
const TreeNode = ({ node, onFileSelect, refreshTree, openModal, renamingPath, setRenamingPath, renameValue, setRenameValue, submitRename }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const isFolder = node.type === 'folder';
  const isRoot = node.name === "Vault";
  const isAssetsRoot = node.path === "assets";
  const isAssetFolder = node.path === "assets" || node.path?.startsWith("assets/");
  const isImageFile = !isFolder && node.name.match(/\.(png|jpe?g|gif|webp|svg)$/i);

  const handleDragStart = (e) => {
    e.stopPropagation();
    e.dataTransfer.setData('sourcePath', node.path || node.name);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isFolder) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!isFolder) return;
    const destPath = isRoot ? "" : node.path;

    // 1. Internal Move logic remains unchanged...
    const sourcePath = e.dataTransfer.getData('sourcePath');
    if (sourcePath) { /* ... existing move code ... */ return; }

    // 2. External Drag & Drop Refactor
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const items = Array.from(e.dataTransfer.items).filter(i => i.kind === 'file');
      if (items.length === 0) return;

      const mdFilesToUpload = []; // Collect tasks here
      const assetFilesToUpload = [];

      const readEntry = async (entry, path = '') => {
        if (entry.isFile) {
          return new Promise((resolve) => {
            entry.file((file) => {
              if (file.type.startsWith("image/")) {
                // Create a task function for the asset
                assetFilesToUpload.push(() => {
                  const imgData = new FormData();
                  imgData.append('file', file);
                  return fetch(getApiUrl('/upload-asset'), { method: 'POST', body: imgData, credentials: 'include' });
                });
              } else if (file.name.endsWith(".md")) {
                mdFilesToUpload.push({ file, relPath: path + file.name });
              }
              resolve();
            });
          });
        } else if (entry.isDirectory) {
          const dirReader = entry.createReader();
          return new Promise((resolve) => {
            dirReader.readEntries(async (entries) => {
              for (const child of entries) {
                await readEntry(child, path + entry.name + '/');
              }
              resolve();
            });
          });
        }
      };

      // Gather all files from the dropped items
      for (const item of items) {
        const entry = item.webkitGetAsEntry();
        if (entry) await readEntry(entry);
      }

      // Execute Asset Uploads with concurrency limit of 3 (heavier I/O)
      if (assetFilesToUpload.length > 0) {
        await limitConcurrency(3, assetFilesToUpload);
      }

      // Execute Markdown Uploads in a single batch if small,
      // or partitioned if large (following existing backend pattern)
      if (mdFilesToUpload.length > 0) {
        const formDataMd = new FormData();
        formDataMd.append('target_path', destPath);
        mdFilesToUpload.forEach(({ file, relPath }) => {
          formDataMd.append('files', file, relPath);
        });

        fetch(getApiUrl('/upload'), { method: 'POST', body: formDataMd, credentials: 'include' })
          .then(() => refreshTree());
      } else if (assetFilesToUpload.length > 0) {
        refreshTree();
      }
    }
  };

  if (!isFolder) {
    return (
      <div
        draggable
        onDragStart={handleDragStart}
        className="group flex items-center justify-between pl-4 py-1.5 hover:bg-gray-800 cursor-pointer text-gray-300 text-sm rounded-md transition-colors min-w-0"
        onClick={() => onFileSelect(node.path)}
      >
        {/* 2. ADD THE onDoubleClick TRIGGER HERE */}
        <div
          className="flex items-center truncate flex-1 min-w-0"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setRenamingPath(node.path);
            setRenameValue(node.name.replace('.md', ''));
          }}
        >
          {isImageFile ? (
            <ImageIcon className="w-4 h-4 mr-2 text-purple-400 flex-shrink-0" />
          ) : (
            <FileText className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" />
          )}

          {renamingPath === node.path ? (
            <input
              type="text"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => submitRename(node.path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename(node.path);
                if (e.key === 'Escape') setRenamingPath(null);
              }}
              className="bg-[#010409] border border-blue-500 text-gray-200 px-1 py-0.5 rounded text-xs w-full outline-none focus:ring-1 focus:ring-blue-500 ml-1"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate select-none">{node.name}</span>
          )}
        </div>
        <Trash2 onClick={(e) => { e.stopPropagation(); openModal("delete", node); }} className="w-3.5 h-3.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity mx-2 flex-shrink-0" />
      </div>
    );
  }

  const creationBasePath = isRoot ? "" : `${node.path}/`;

  return (
    <div>
      <div
        draggable={!isRoot && !isAssetsRoot}
        onDragStart={(!isRoot && !isAssetsRoot) ? handleDragStart : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group flex items-center justify-between py-1.5 hover:bg-gray-800 cursor-pointer text-sm font-medium rounded-md transition-colors min-w-0 ${
          isDragOver ? 'bg-blue-900/40 ring-1 ring-blue-500 text-blue-100' : 'text-gray-200'
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center truncate flex-1 min-w-0">
          {isOpen ? <ChevronDown className="w-4 h-4 mr-1 text-gray-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 mr-1 text-gray-500 flex-shrink-0" />}
          <Folder className={`w-4 h-4 mr-2 flex-shrink-0 ${isAssetsRoot ? 'text-purple-500' : 'text-blue-400'}`} />
          <span className="truncate">{node.name}</span>
        </div>

        <div className="flex gap-1.5 items-center opacity-0 group-hover:opacity-100 transition-opacity mx-2 flex-shrink-0">
          {!isAssetFolder && (
            <>
              <button onClick={(e) => { e.stopPropagation(); openModal("import", creationBasePath); }} className="text-gray-600 hover:text-purple-400 p-0.5" title="Import into folder"><Upload className="w-3.5 h-3.5 flex-shrink-0" /></button>
              <button onClick={(e) => { e.stopPropagation(); openModal("createNote", creationBasePath); }} className="text-gray-600 hover:text-green-400 p-0.5" title="New Note"><Plus className="w-3.5 h-3.5 flex-shrink-0" /></button>
            </>
          )}
          <button onClick={(e) => { e.stopPropagation(); openModal("createFolder", creationBasePath); }} className="text-gray-600 hover:text-blue-400 p-0.5" title="New Subfolder"><FolderPlus className="w-3.5 h-3.5 flex-shrink-0" /></button>
          {!isRoot && !isAssetsRoot && (
            <Trash2 onClick={(e) => { e.stopPropagation(); openModal("delete", node); }} className="w-3.5 h-3.5 text-gray-600 hover:text-red-400 p-0.5 flex-shrink-0" title="Delete" />
          )}
        </div>
      </div>

      {(isOpen || isDragOver) && node.children && (
        <div className="pl-3 border-l border-gray-700 ml-2 mt-1">
          {node.children.map((child, index) => (
            <TreeNode
              key={index}
              node={child}
              onFileSelect={onFileSelect}
              refreshTree={refreshTree}
              openModal={openModal}
              renamingPath={renamingPath}
              setRenamingPath={setRenamingPath}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              submitRename={submitRename}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// --- Main Sidebar Component ---
export default function Sidebar({ onFileSelect, refreshTrigger, onTagClick, onFileDelete, onFileRename }) {
  const [tree, setTree] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [modalTarget, setModalTarget] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  // NEW: Token Management State
  const [tokens, setTokens] = useState([]);
  const [newToken, setNewToken] = useState("");

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const uploadTargetRef = useRef("");

  const [sidebarWidth, setSidebarWidth] = useState(256);
  const isResizing = useRef(false);

  const [viewMode, setViewMode] = useState('files'); // 'files' or 'tags'
  const [vaultTags, setVaultTags] = useState([]);

  const [renamingPath, setRenamingPath] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const resize = useCallback((e) => {
    if (isResizing.current) {
      const newWidth = e.clientX;
      if (newWidth > 200 && newWidth < 600) setSidebarWidth(newWidth);
    }
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  const submitRename = (oldPath) => {
    if (!renameValue.trim() || oldPath.endsWith(renameValue) || oldPath.endsWith(`${renameValue}.md`)) {
      setRenamingPath(null); // Cancel if empty or unchanged
      return;
    }

    fetch(getApiUrl('/rename'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_path: oldPath, new_name: renameValue })
    })
    .then(res => res.json())
    .then(data => {
      setRenamingPath(null);
      fetchTree();
      if (onFileRename) onFileRename(oldPath, data.new_path);
    })
    .catch(err => console.error("Rename failed:", err));
  };

  useEffect(() => {
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResizing);
    return () => {
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  const fetchTree = () => {
    fetch(getApiUrl('/tree'), { credentials: 'include' })
      .then(res => res.json())
      .then(data => setTree(data))
      .catch(err => console.error("Failed to fetch tree:", err));

    fetch(getApiUrl('/tags'), { credentials: 'include' })
      .then(res => res.json())
      .then(data => setVaultTags(data))
      .catch(err => console.error("Failed to fetch tags:", err));
  };

  const fetchTokens = () => {
    fetch(getApiUrl('/auth/tokens'), { credentials: 'include' })
      .then(res => res.json())
      .then(setTokens)
      .catch(err => console.error("Failed to fetch tokens:", err));
  };

  useEffect(() => { fetchTree(); }, []);
  useEffect(() => { if (refreshTrigger > 0) fetchTree(); }, [refreshTrigger]);
  useEffect(() => {
    const handleFocus = () => fetchTree();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const openModal = (type, target) => {
    setInputValue("");
    setModalTarget(target);
    if (type === 'import') uploadTargetRef.current = target;
    if (type === 'settings') fetchTokens();
    setActiveModal(type);
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalTarget(null);
    setNewToken("");
    setSelectedTemplate("");
  };

  const handleCreateNoteAction = async () => {
    if (!inputValue) return;
    const name = inputValue.endsWith('.md') ? inputValue : `${inputValue}.md`;
    const fullPath = `${modalTarget}${name}`;
    let initialContent = `# ${inputValue.replace('.md', '')}\n\nStart typing here...`;
    if (selectedTemplate) {
      try {
        const res = await fetch(getApiUrl(`/notes/_Templates/${selectedTemplate}`), { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const now = new Date();

          // Substitute variables
          initialContent = data.content
            .replace(/\{\{date\}\}/g, now.toISOString().split('T')[0]) // e.g., 2026-05-05
            .replace(/\{\{time\}\}/g, now.toTimeString().split(' ')[0].substring(0, 5)) // e.g., 14:30
            .replace(/\{\{title\}\}/g, inputValue.replace('.md', ''));
        }
      } catch (err) {
        console.error("Failed to load template", err);
      }
    }

    fetch(getApiUrl(`/notes/${fullPath}`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: initialContent })
    }).then(() => { fetchTree(); onFileSelect(fullPath); closeModal(); });
  };

  const handleCreateFolderAction = () => {
    if (!inputValue) return;
    const fullPath = `${modalTarget}${inputValue}`;
    fetch(getApiUrl(`/folders/${fullPath}`), { method: 'POST', credentials: 'include' })
      .then(() => { fetchTree(); closeModal(); });
  };

  const handleDeleteAction = () => {
    const pathToDelete = modalTarget.path || modalTarget.name;
    fetch(getApiUrl(`/notes/${pathToDelete}`), { method: 'DELETE', credentials: 'include' })
      .then(() => { fetchTree(); onFileDelete(pathToDelete); closeModal(); })
      .catch(err => console.error("Failed to delete:", err));
  };

  const handleGenerateToken = () => {
    if (!inputValue) return;
    fetch(getApiUrl('/auth/tokens'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: inputValue }),
      credentials: 'include'
    })
    .then(res => res.json())
    .then(data => {
      setNewToken(data.token);
      fetchTokens();
      setInputValue("");
    });
  };

  const handleRevokeToken = (tokenId) => {
    fetch(getApiUrl(`/auth/tokens/${tokenId}`), {
      method: 'DELETE',
      credentials: 'include'
    }).then(fetchTokens);
  };

  const handleFileUpload = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    formData.append('target_path', uploadTargetRef.current);
    Array.from(files).forEach(file => {
      const path = file.webkitRelativePath || file.name;
      formData.append('files', file, path);
    });
    fetch(getApiUrl('/upload'), { method: 'POST', credentials: 'include', body: formData })
    .then(() => { fetchTree(); e.target.value = null; })
    .catch(err => console.error("Upload failed:", err));
  };

  const handleLogout = async () => {
    try {
        await fetch(getApiUrl('/auth/logout'), { method: 'POST', credentials: 'include' });
        window.location.href = "/";
    } catch (err) { console.error("Logout failed", err); }
  };

  return (
    <div
      style={{ width: `${sidebarWidth}px` }}
      className="h-screen bg-[#111319] border-r border-gray-800 p-4 flex flex-col z-20 relative flex-shrink-0"
    >
      <div
        onMouseDown={startResizing}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-50"
      />

      <input type="file" multiple accept=".md" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
      <input type="file" webkitdirectory="true" directory="true" ref={folderInputRef} onChange={handleFileUpload} className="hidden" />

      <div className="flex items-center justify-between mb-4 px-2 flex-shrink-0 mt-2">
        <div className="flex bg-gray-900 rounded-md p-1 w-full border border-gray-800">
          <button onClick={() => setViewMode('files')} className={`flex-1 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded-sm transition-colors ${viewMode === 'files' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>Files</button>
          <button onClick={() => setViewMode('tags')} className={`flex-1 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded-sm transition-colors ${viewMode === 'tags' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>Tags</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
        {viewMode === 'files' ? (
          tree ? (
            <TreeNode
              node={tree}
              onFileSelect={onFileSelect}
              refreshTree={fetchTree}
              openModal={openModal}
              renamingPath={renamingPath}
              setRenamingPath={setRenamingPath}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              submitRename={submitRename}
            />
          ) : (
            <div className="text-gray-500 text-sm px-2 animate-pulse">Loading vault...</div>
          )
        ) : (
          <div className="flex flex-col gap-1 px-2 mt-2">
            {vaultTags.length === 0 ? (
              <div className="text-gray-600 text-xs italic text-center mt-4">No tags found. Type #tag in a note to create one.</div>
            ) : (
              vaultTags.map((tagObj) => (
                <div
                  key={tagObj.tag}
                  onClick={() => onTagClick(`#${tagObj.tag}`)}
                  className="group flex items-center justify-between px-3 py-2 bg-gray-900/50 hover:bg-blue-900/30 border border-gray-800 hover:border-blue-800/50 rounded-lg cursor-pointer transition-all"
                >
                  <div className="flex items-center text-sm font-medium text-blue-400 group-hover:text-blue-300">
                    <Hash className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                    {tagObj.tag}
                  </div>
                  <span className="text-[10px] font-bold bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full group-hover:bg-blue-900/50 group-hover:text-blue-300">
                    {tagObj.count}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* --- FOOTER SECTION: SETTINGS & LOGOUT --- */}
      <div className="mt-auto pt-4 border-t border-gray-800 flex flex-col gap-1 flex-shrink-0">
        <button
          onClick={() => openModal('settings')}
          className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-400 hover:text-blue-400 hover:bg-blue-900/10 rounded-md transition-all group"
        >
          <Settings className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
          <span className="font-medium">API Settings</span>
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-red-900/10 rounded-md transition-all group"
        >
          <LogOut className="w-4 h-4 text-gray-500 group-hover:text-red-400" />
          <span className="font-medium">Logout</span>
        </button>

        <div className="mt-1 px-3 py-1 text-[10px] text-gray-600 uppercase tracking-widest">
          Vault Secured
        </div>
      </div>

      {/* --- MODALS --- */}
      <Modal isOpen={activeModal === 'settings'} onClose={closeModal} title="CLI & API Access">
        <div className="space-y-4">
          <p className="text-xs text-gray-400">Manage Personal Access Tokens for your CLI and terminal agents.</p>

          {newToken && (
            <div className="p-3 bg-green-900/30 border border-green-500 rounded text-xs break-all animate-in fade-in slide-in-from-top-2">
              <p className="text-green-400 font-bold mb-1">Copy this now (it won't be shown again):</p>
              <code className="text-white selection:bg-green-500">{newToken}</code>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Token Name (e.g. Work Laptop)"
              className="flex-1 bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleGenerateToken}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              Generate
            </button>
          </div>

          <div className="border-t border-gray-800 pt-2 max-h-48 overflow-y-auto">
            <h4 className="text-[10px] uppercase text-gray-500 font-bold mb-2">Active Tokens</h4>
            {tokens.length === 0 ? (
              <p className="text-xs text-gray-600 italic">No active tokens found.</p>
            ) : (
              tokens.map(t => (
                <div key={t.id} className="flex justify-between items-center text-xs py-2 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-gray-200">{t.name}</span>
                    <span className="text-[9px] text-gray-600">{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                  <button
                    onClick={() => handleRevokeToken(t.id)}
                    className="text-red-500 hover:text-red-400 text-[10px] font-bold"
                  >
                    REVOKE
                  </button>
                </div>
              ))
            )}
          </div>
          {/* --- NEW: TROUBLESHOOTING ZONE --- */}
          <div className="mt-6 border-t border-gray-800 pt-4">
            <h4 className="text-xs uppercase text-red-500 font-bold mb-2">Danger Zone / Troubleshooting</h4>
            <p className="text-[10px] text-gray-500 mb-3">If search results or tags ever fall out of sync (ghost tags), you can force a complete rebuild of the SQLite database.</p>
            <button
              onClick={() => {
                fetch(getApiUrl('/reindex'), { method: 'POST', credentials: 'include' })
                  .then(() => { fetchTree(); alert("Database successfully rebuilt!"); })
                  .catch(err => alert("Failed to rebuild: " + err));
              }}
              className="w-full py-2 bg-red-900/10 text-red-400 border border-red-900 hover:bg-red-900/30 hover:text-red-300 rounded text-xs font-medium transition-colors"
            >
              Rebuild Search & Tag Database
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'import'} onClose={closeModal} title="Import into Vault">
        <p className="mb-4">Select what you would like to import into <strong className="text-white">'{modalTarget === "" ? "Vault" : modalTarget}'</strong>.</p>
        <div className="flex flex-col gap-3">
          <button onClick={() => { fileInputRef.current.click(); closeModal(); }} className="w-full flex items-center justify-center gap-2 py-3 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md border border-gray-700 transition-colors">
            <FileText className="w-5 h-5" /> Import Markdown File(s)
          </button>
          <button onClick={() => { folderInputRef.current.click(); closeModal(); }} className="w-full flex items-center justify-center gap-2 py-3 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md border border-gray-700 transition-colors">
            <Folder className="w-5 h-5" /> Import Entire Folder
          </button>
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'createNote'} onClose={closeModal} title="Create New Note" actionLabel="Create Note" onAction={handleCreateNoteAction}>
        <p className="mb-3">Enter a name for the new Markdown file.</p>
        <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="My New Note" autoFocus className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm mb-3" />

        {/* Template Selector */}
        {tree && tree.children && tree.children.find(c => c.name === '_Templates') && (
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Apply Template (Optional)</label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">-- No Template --</option>
              {tree.children.find(c => c.name === '_Templates').children.filter(f => f.type === 'file').map(template => (
                <option key={template.name} value={template.name}>{template.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">Supports: {'{{date}}, {{time}}, {{title}}'}</p>
          </div>
        )}
      </Modal>

      <Modal isOpen={activeModal === 'createFolder'} onClose={closeModal} title="Create New Folder" actionLabel="Create Folder" onAction={handleCreateFolderAction}>
        <p className="mb-3">Enter a name for the new subfolder.</p>
        <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="New Folder Name" autoFocus className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
      </Modal>

      <Modal isOpen={activeModal === 'delete'} onClose={closeModal} title="Confirm Deletion" actionLabel="Delete Permanently" onAction={handleDeleteAction} actionVariant="danger">
        <p>Are you sure you want to permanently delete <strong className="text-white">'{modalTarget?.name}'</strong>?</p>
        <p className="mt-2 text-amber-400 text-xs bg-amber-950 p-2 rounded-md border border-amber-800">⚠️ This action cannot be undone and will delete all contents.</p>
      </Modal>
    </div>
  );
}