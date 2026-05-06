import { X } from 'lucide-react';

export default function TabBar({ tabs, activeTab, onTabSelect, onTabClose }) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex bg-[#010409] border-b border-gray-800 overflow-x-auto flex-shrink-0 custom-scrollbar select-none">
      {tabs.map(tab => (
        <div
          key={tab}
          onClick={() => onTabSelect(tab)}
          // Added flex-1, min-w-[120px], and justify-between so tabs share space nicely
          className={`group flex items-center justify-between gap-2 px-4 py-2 text-sm flex-1 min-w-[120px] max-w-[200px] cursor-pointer border-r border-gray-800 transition-colors ${activeTab === tab ? 'bg-[#0d1117] text-gray-200 border-t-[3px] border-t-blue-500' : 'bg-[#010409] text-gray-500 hover:bg-[#11151b] border-t-[3px] border-t-transparent'}`}
        >
          <span className="truncate" title={tab}>{tab.split('/').pop()}</span>
          <button
            onClick={(e) => onTabClose(e, tab)}
            className="p-0.5 rounded-md text-gray-600 hover:bg-gray-700 hover:text-white opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}