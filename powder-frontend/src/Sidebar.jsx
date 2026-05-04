import { useState, useEffect, useRef, useCallback } from 'react';
import { Folder, FileText, ChevronRight, ChevronDown, Plus, FolderPlus, Trash2, X, Upload, Image as ImageIcon } from 'lucide-react';

// --- CUSTOM MODAL COMPONENT ---
// (We made actionLabel optional so we can have buttons inside the modal instead of at the bottom)
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

// --- Updated TreeNode with System Folder Protection ---
const TreeNode = ({ node, onFileSelect, refreshTree, openModal }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const isFolder = node.type === 'folder';
  const isRoot = node.name === "Vault";

  // NEW: Identify System Folders & Files
  const isAssetsRoot = node.path === "assets"; // The main assets folder
  const isAssetFolder = node.path === "assets" || node.path?.startsWith("assets/"); // Assets folder or any subfolder inside it
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

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!isFolder) return;

    const sourcePath = e.dataTransfer.getData('sourcePath');
    const destPath = isRoot ? "" : node.path;

    if (!sourcePath || sourcePath === destPath) return;

    fetch(`http://127.0.0.1:8000/api/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: sourcePath, destination: destPath })
    })
    .then(() => refreshTree())
    .catch(err => console.error("Move failed:", err));
  };

  if (!isFolder) {
    return (
      <div
        draggable
        onDragStart={handleDragStart}
        className="group flex items-center justify-between pl-4 py-1.5 hover:bg-gray-800 cursor-pointer text-gray-300 text-sm rounded-md transition-colors"
        onClick={() => onFileSelect(node.path)}
      >
        <div className="flex items-center truncate">
          {/* NEW: Show different icons for Images vs Text */}
          {isImageFile ? (
            <ImageIcon className="w-4 h-4 mr-2 text-purple-400 flex-shrink-0" />
          ) : (
            <FileText className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </div>
        <Trash2 onClick={(e) => { e.stopPropagation(); openModal("delete", node); }} className="w-3.5 h-3.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity mr-2" />
      </div>
    );
  }

  const creationBasePath = isRoot ? "" : `${node.path}/`;

  return (
    <div>
      <div
        draggable={!isRoot && !isAssetsRoot} // Don't allow dragging the root assets folder
        onDragStart={(!isRoot && !isAssetsRoot) ? handleDragStart : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group flex items-center justify-between py-1.5 hover:bg-gray-800 cursor-pointer text-sm font-medium rounded-md transition-colors ${
          isDragOver ? 'bg-blue-900/40 ring-1 ring-blue-500 text-blue-100' : 'text-gray-200'
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center truncate">
          {isOpen ? <ChevronDown className="w-4 h-4 mr-1 text-gray-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 mr-1 text-gray-500 flex-shrink-0" />}

          {/* Turn the Assets folder icon purple so it stands out as a system folder */}
          <Folder className={`w-4 h-4 mr-2 flex-shrink-0 ${isAssetsRoot ? 'text-purple-500' : 'text-blue-400'}`} />
          <span className="truncate">{node.name}</span>
        </div>

        <div className="flex gap-1.5 items-center opacity-0 group-hover:opacity-100 transition-opacity mr-2">

          {/* ONLY show Import and New Note if it's NOT an asset folder */}
          {!isAssetFolder && (
            <>
              <button onClick={(e) => { e.stopPropagation(); openModal("import", creationBasePath); }} className="text-gray-600 hover:text-purple-400 p-0.5" title="Import into folder"><Upload className="w-3.5 h-3.5" /></button>
              <button onClick={(e) => { e.stopPropagation(); openModal("createNote", creationBasePath); }} className="text-gray-600 hover:text-green-400 p-0.5" title="New Note"><Plus className="w-3.5 h-3.5" /></button>
            </>
          )}

          {/* ALWAYS allow creating Subfolders (so you can organize images) */}
          <button onClick={(e) => { e.stopPropagation(); openModal("createFolder", creationBasePath); }} className="text-gray-600 hover:text-blue-400 p-0.5" title="New Subfolder"><FolderPlus className="w-3.5 h-3.5" /></button>

          {/* Prevent deleting the Root Vault and the Root Assets folder */}
          {!isRoot && !isAssetsRoot && (
            <Trash2 onClick={(e) => { e.stopPropagation(); openModal("delete", node); }} className="w-3.5 h-3.5 text-gray-600 hover:text-red-400 p-0.5" title="Delete" />
          )}
        </div>
      </div>

      {(isOpen || isDragOver) && node.children && (
        <div className="pl-3 border-l border-gray-700 ml-2 mt-1">
          {node.children.map((child, index) => (
            <TreeNode key={index} node={child} onFileSelect={onFileSelect} refreshTree={refreshTree} openModal={openModal} />
          ))}
        </div>
      )}
    </div>
  );
};

// --- Main Sidebar Component ---
export default function Sidebar({ onFileSelect }) {
  const [tree, setTree] = useState(null);

  const [activeModal, setActiveModal] = useState(null);
  const [modalTarget, setModalTarget] = useState(null);
  const [inputValue, setInputValue] = useState("");

  // Refs for the hidden file pickers
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const uploadTargetRef = useRef("");

  // --- NEW: Resizable Sidebar State ---
  const [sidebarWidth, setSidebarWidth] = useState(256); // Default 256px
  const isResizing = useRef(false);

  // When you click the invisible edge
  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // When you move the mouse
  const resize = useCallback((e) => {
    if (isResizing.current) {
      const newWidth = e.clientX;
      if (newWidth > 200 && newWidth < 600) {
        setSidebarWidth(newWidth);
      }
    }
  }, []);

  // When you let go of the mouse
  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  // Attach and detach the event listeners
  useEffect(() => {
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResizing);
    return () => {
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  const fetchTree = () => {
    fetch('http://127.0.0.1:8000/api/tree')
      .then(res => res.json())
      .then(data => setTree(data))
      .catch(err => console.error("Failed to fetch tree:", err));
  };

  useEffect(() => {
    fetchTree();
  }, []);

  const openModal = (type, target) => {
    setInputValue("");
    setModalTarget(target);
    if (type === 'import') uploadTargetRef.current = target;
    setActiveModal(type);
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalTarget(null);
  };

  // --- API Action Handlers ---
  const handleCreateNoteAction = () => {
    if (!inputValue) return;
    const name = inputValue.endsWith('.md') ? inputValue : `${inputValue}.md`;
    const fullPath = `${modalTarget}${name}`;
    fetch(`http://127.0.0.1:8000/api/notes/${fullPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `# ${inputValue}\n\nStart typing here...` })
    }).then(() => { fetchTree(); closeModal(); });
  };

  const handleCreateFolderAction = () => {
    if (!inputValue) return;
    const fullPath = `${modalTarget}${inputValue}`;
    fetch(`http://127.0.0.1:8000/api/folders/${fullPath}`, { method: 'POST' })
      .then(() => { fetchTree(); closeModal(); });
  };

  const handleDeleteAction = () => {
    const pathToDelete = modalTarget.path || modalTarget.name;
    fetch(`http://127.0.0.1:8000/api/notes/${pathToDelete}`, { method: 'DELETE' })
      .then(() => { fetchTree(); closeModal(); })
      .catch(err => console.error("Failed to delete:", err));
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

    fetch('http://127.0.0.1:8000/api/upload', {
      method: 'POST',
      body: formData
    })
    .then(() => {
      fetchTree();
      e.target.value = null;
    })
    .catch(err => console.error("Upload failed:", err));
  };

  return (
    // NEW: We replaced "w-64" with dynamic inline styling for the width, and added relative/flex-shrink-0
    <div
      style={{ width: `${sidebarWidth}px` }}
      className="h-screen bg-[#111319] border-r border-gray-800 p-4 flex flex-col z-20 relative flex-shrink-0"
    >

      {/* NEW: The Drag Handle Line */}
      <div
        onMouseDown={startResizing}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-50"
      />

      {/* Hidden HTML5 File Pickers */}
      <input type="file" multiple accept=".md" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
      <input type="file" webkitdirectory="true" directory="true" ref={folderInputRef} onChange={handleFileUpload} className="hidden" />

      <div className="flex items-center justify-between mb-4 px-2">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Powder Vault</h2>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
        {tree ? <TreeNode node={tree} onFileSelect={onFileSelect} refreshTree={fetchTree} openModal={openModal} /> : <div className="text-gray-500 text-sm px-2 animate-pulse">Loading vault...</div>}
      </div>

      {/* --- ALL CUSTOM MODALS --- */}

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
        <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="My New Note" autoFocus className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
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