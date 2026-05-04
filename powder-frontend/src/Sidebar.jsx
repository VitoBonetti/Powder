import { useState, useEffect, useRef } from 'react';
import { Folder, FileText, ChevronRight, ChevronDown, Plus, FolderPlus, Trash2, X } from 'lucide-react';

// --- CUSTOM MODAL COMPONENT (Replaces window.prompt/confirm) ---
const Modal = ({ isOpen, onClose, title, children, actionLabel, onAction, actionVariant = "primary" }) => {
  const modalRef = useRef(null);

  // Close when clicking outside or hitting ESC
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
          <button onClick={onAction} className={actionButtonClasses}>
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Updated TreeNode with Drag & Drop ---
const TreeNode = ({ node, onFileSelect, refreshTree, openModal }) => {
  const [isOpen, setIsOpen] = useState(false);

  // NEW: State to track if an item is being dragged over this folder
  const [isDragOver, setIsDragOver] = useState(false);

  const isFolder = node.type === 'folder';
  const isRoot = node.name === "Vault";

  // --- DRAG & DROP HANDLERS ---

  // 1. When you start dragging an item
  const handleDragStart = (e) => {
    e.stopPropagation();
    // Save the path of the item we are picking up
    e.dataTransfer.setData('sourcePath', node.path || node.name);
  };

  // 2. When you hover an item over a folder
  const handleDragOver = (e) => {
    e.preventDefault(); // Required to allow dropping
    e.stopPropagation();
    if (isFolder) setIsDragOver(true);
  };

  // 3. When you drag away from the folder
  const handleDragLeave = (e) => {
    e.stopPropagation();
    setIsDragOver(false);
  };

  // 4. When you let go of the mouse button
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!isFolder) return; // Can only drop into folders

    const sourcePath = e.dataTransfer.getData('sourcePath');
    const destPath = isRoot ? "" : node.path; // Target path

    // Prevent API call if dropped in the same place
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
        draggable // Make the file draggable!
        onDragStart={handleDragStart}
        className="group flex items-center justify-between pl-4 py-1.5 hover:bg-gray-800 cursor-pointer text-gray-300 text-sm rounded-md transition-colors"
        onClick={() => onFileSelect(node.path)}
      >
        <div className="flex items-center truncate">
          <FileText className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" />
          <span className="truncate">{node.name}</span>
        </div>
        <Trash2
          onClick={(e) => { e.stopPropagation(); openModal("delete", node); }}
          className="w-3.5 h-3.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity mr-2"
        />
      </div>
    );
  }

  const creationBasePath = isRoot ? "" : `${node.path}/`;
    return (
      <div>
        <div
          draggable={!isRoot} // You can drag folders, but not the main "Vault"
          onDragStart={!isRoot ? handleDragStart : undefined}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          // NEW: If hovering, add a blue highlight ring!
          className={`group flex items-center justify-between py-1.5 hover:bg-gray-800 cursor-pointer text-sm font-medium rounded-md transition-colors ${
            isDragOver ? 'bg-blue-900/40 ring-1 ring-blue-500 text-blue-100' : 'text-gray-200'
          }`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="flex items-center truncate">
            {isOpen ? <ChevronDown className="w-4 h-4 mr-1 text-gray-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 mr-1 text-gray-500 flex-shrink-0" />}
            <Folder className="w-4 h-4 mr-2 text-blue-400 flex-shrink-0" />
            <span className="truncate">{node.name}</span>
          </div>

          <div className="flex gap-1.5 items-center opacity-0 group-hover:opacity-100 transition-opacity mr-2">
            <button onClick={(e) => { e.stopPropagation(); openModal("createNote", creationBasePath); }} className="text-gray-600 hover:text-green-400 p-0.5"><Plus className="w-3.5 h-3.5" /></button>
            <button onClick={(e) => { e.stopPropagation(); openModal("createFolder", creationBasePath); }} className="text-gray-600 hover:text-blue-400 p-0.5"><FolderPlus className="w-3.5 h-3.5" /></button>
            {!isRoot && <Trash2 onClick={(e) => { e.stopPropagation(); openModal("delete", node); }} className="w-3.5 h-3.5 text-gray-600 hover:text-red-400 p-0.5" />}
          </div>
        </div>

        {/* Auto-expand folder when dragging over it (UX Polish) */}
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

// --- Main Sidebar: Handles Modal State and API Calls ---
export default function Sidebar({ onFileSelect }) {
  const [tree, setTree] = useState(null);

  // Modal State Management
  const [activeModal, setActiveModal] = useState(null); // 'createNote', 'createFolder', 'delete'
  const [modalTarget, setModalTarget] = useState(null); // String path or Node object
  const [inputValue, setInputValue] = useState("");

  const fetchTree = () => {
    fetch('http://127.0.0.1:8000/api/tree')
      .then(res => res.json())
      .then(data => setTree(data))
      .catch(err => console.error("Failed to fetch tree:", err));
  };

  useEffect(() => {
    fetchTree();
  }, []);

  // Helper to open a specific modal and reset inputs
  const openModal = (type, target) => {
    setInputValue("");
    setModalTarget(target);
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
    // modalTarget is the basePath, e.g., "projects/" or ""
    const fullPath = `${modalTarget}${name}`;

    fetch(`http://127.0.0.1:8000/api/notes/${fullPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `# ${inputValue}\n\nStart typing here...` })
    }).then(() => {
      fetchTree();
      closeModal();
    });
  };

  const handleCreateFolderAction = () => {
    if (!inputValue) return;
    // modalTarget is the basePath, e.g., "projects/" or ""
    const fullPath = `${modalTarget}${inputValue}`;
    fetch(`http://127.0.0.1:8000/api/folders/${fullPath}`, { method: 'POST' })
      .then(() => {
        fetchTree();
        closeModal();
      });
  };

  const handleDeleteAction = () => {
    // modalTarget is the full Node object
    const pathToDelete = modalTarget.path || modalTarget.name; // Root folder uses name
    fetch(`http://127.0.0.1:8000/api/notes/${pathToDelete}`, { method: 'DELETE' })
      .then(() => {
        fetchTree();
        closeModal();
      })
      .catch(err => console.error("Failed to delete:", err));
  };

  return (
    <div className="w-64 h-screen bg-[#111319] border-r border-gray-800 p-4 flex flex-col z-20">

      {/* Sleeker Sidebar Header (No top buttons!) */}
      <div className="flex items-center justify-between mb-4 px-2">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Powder Vault</h2>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {tree ? <TreeNode node={tree} onFileSelect={onFileSelect} refreshTree={fetchTree} openModal={openModal} /> : <div className="text-gray-500 text-sm px-2 animate-pulse">Loading vault...</div>}
      </div>

      {/* --- ALL CUSTOM MODALS INJECTED HERE --- */}

      {/* 1. New Note Modal */}
      <Modal
        isOpen={activeModal === 'createNote'}
        onClose={closeModal}
        title="Create New Note"
        actionLabel="Create Note"
        onAction={handleCreateNoteAction}
      >
        <p className="mb-3">Enter a name for the new Markdown file.</p>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="My New Note"
          autoFocus
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
      </Modal>

      {/* 2. New Folder Modal */}
      <Modal
        isOpen={activeModal === 'createFolder'}
        onClose={closeModal}
        title="Create New Folder"
        actionLabel="Create Folder"
        onAction={handleCreateFolderAction}
      >
        <p className="mb-3">Enter a name for the new subfolder.</p>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="New Folder Name"
          autoFocus
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
      </Modal>

      {/* 3. Delete Confirmation Modal */}
      <Modal
        isOpen={activeModal === 'delete'}
        onClose={closeModal}
        title="Confirm Deletion"
        actionLabel="Delete Permanently"
        onAction={handleDeleteAction}
        actionVariant="danger"
      >
        <p>Are you sure you want to permanently delete <strong className="text-white">'{modalTarget?.name}'</strong>?</p>
        <p className="mt-2 text-amber-400 text-xs bg-amber-950 p-2 rounded-md border border-amber-800">
          ⚠️ This action cannot be undone and will delete all contents.
        </p>
      </Modal>

    </div>
  );
}