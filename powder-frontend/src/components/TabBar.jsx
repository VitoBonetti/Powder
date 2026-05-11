import { useRef, useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { getApiUrl } from '../config';

export default function TabBar({ tabs, activeTab, onTabSelect, onTabClose, onTabRename }) {
  const scrollRef = useRef(null);
  const [showArrows, setShowArrows] = useState(false);

  // Renaming State
  const [renamingTab, setRenamingTab] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollWidth, clientWidth } = scrollRef.current;
      setShowArrows(scrollWidth > clientWidth);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [tabs]);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (scrollRef.current && activeTab) {
      const activeElement = scrollRef.current.querySelector('[data-active="true"]');
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }, [activeTab]);

  // --- RENAME HANDLERS ---
  const handleRenameStart = (tabPath) => {
    setRenamingTab(tabPath);
    setRenameValue(tabPath.split('/').pop().replace('.md', ''));
  };

  const submitRename = (oldPath) => {
    if (!oldPath || !renamingTab) return;

    const oldName = oldPath.split('/').pop().replace('.md', '');
    const cleanNewName = renameValue.trim();

    // Cancel if empty or unchanged
    if (!cleanNewName || cleanNewName === oldName) {
      setRenamingTab(null);
      return;
    }

    fetch(getApiUrl('/rename'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_path: oldPath, new_name: cleanNewName })
    })
    .then(res => res.json())
    .then(data => {
      setRenamingTab(null);
      // Let the parent App know the tab has a new path so it updates the activeTabs array
      if (onTabRename) onTabRename(oldPath, data.new_path);
    })
    .catch(err => {
      console.error("Rename failed:", err);
      setRenamingTab(null);
    });
  };

  // --- NEW NOTE HANDLER ---
  const handleCreateNote = () => {
    // This perfectly hooks into the listener already established in your Sidebar!
    window.dispatchEvent(new CustomEvent('powder-action', { detail: { action: 'cmd-new-note' } }));
  };

  if (tabs.length === 0) return null;

  return (
    <div className="flex bg-slate-100 dark:bg-[#010409] border-b border-slate-300 dark:border-gray-800 flex-shrink-0 select-none items-center relative transition-colors duration-200">
      <style>{`.hide-scroll::-webkit-scrollbar { display: none; }`}</style>

      {showArrows && (
        <button onClick={() => scroll('left')} className="p-1 mx-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:text-gray-500 dark:hover:text-white dark:hover:bg-gray-800 rounded z-10 transition-colors flex-shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex flex-1 overflow-x-auto hide-scroll"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabs.map(tab => (
          <div
            key={tab}
            data-active={activeTab === tab}
            onClick={() => {
              // Prevent tab switching if we are currently clicking inside the rename input
              if (renamingTab !== tab) onTabSelect(tab);
            }}
            className={`group flex items-center justify-between gap-2 px-4 py-2 text-sm flex-1 min-w-[120px] max-w-[200px] cursor-pointer border-r border-slate-300 dark:border-gray-800 transition-colors ${
              activeTab === tab
              ? 'bg-white dark:bg-[#0d1117] text-sky-600 dark:text-gray-200 border-t-[3px] border-t-sky-500 dark:border-t-blue-500'
              : 'bg-slate-100 dark:bg-[#010409] text-slate-500 dark:text-gray-500 hover:bg-slate-200 dark:hover:bg-[#11151b] border-t-[3px] border-t-transparent'
            }`}
          >
            {renamingTab === tab ? (
              <input
                type="text"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => submitRename(tab)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename(tab);
                  if (e.key === 'Escape') setRenamingTab(null);
                }}
                className="bg-white dark:bg-[#010409] border border-sky-500 text-slate-900 dark:text-gray-200 px-1 py-0.5 rounded text-xs w-full outline-none focus:ring-1 focus:ring-sky-500"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="truncate"
                title={tab}
                onDoubleClick={() => handleRenameStart(tab)}
              >
                {tab.split('/').pop()}
              </span>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(e, tab);
              }}
              className="p-0.5 rounded-md text-slate-400 hover:bg-slate-300 hover:text-slate-800 dark:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-white opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {showArrows && (
        <button onClick={() => scroll('right')} className="p-1 mx-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:text-gray-500 dark:hover:text-white dark:hover:bg-gray-800 rounded z-10 transition-colors flex-shrink-0">
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* CREATE NEW NOTE BUTTON */}
      <button
        onClick={handleCreateNote}
        className="p-1.5 mx-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:text-gray-500 dark:hover:text-white dark:hover:bg-gray-800 rounded z-10 transition-colors flex-shrink-0"
        title="Create New Note"
      >
        <Plus className="w-4 h-4" />
      </button>

    </div>
  );
}