import { useRef, useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export default function TabBar({ tabs, activeTab, onTabSelect, onTabClose }) {
  const scrollRef = useRef(null);
  const [showArrows, setShowArrows] = useState(false);

  // Check if tabs overflow the container
  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollWidth, clientWidth } = scrollRef.current;
      setShowArrows(scrollWidth > clientWidth);
    }
  };

  // Re-check whenever tabs change or the window resizes
  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [tabs]);

  // Smooth scroll left or right when clicking the arrows
  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Automatically scroll to the active tab so it never opens off-screen
  useEffect(() => {
    if (scrollRef.current && activeTab) {
      const activeElement = scrollRef.current.querySelector('[data-active="true"]');
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }, [activeTab]);

  if (tabs.length === 0) return null;

  return (
    <div className="flex bg-[#010409] border-b border-gray-800 flex-shrink-0 select-none items-center relative">
      {/* Inject CSS to completely hide the native webkit scrollbar */}
      <style>{`.hide-scroll::-webkit-scrollbar { display: none; }`}</style>

      {showArrows && (
        <button onClick={() => scroll('left')} className="p-1 mx-1 text-gray-500 hover:text-white hover:bg-gray-800 rounded z-10 transition-colors flex-shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex flex-1 overflow-x-auto hide-scroll"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} // Hides scrollbar in Firefox/IE
      >
        {tabs.map(tab => (
          <div
            key={tab}
            data-active={activeTab === tab} // Used by the auto-scroller
            onClick={() => onTabSelect(tab)}
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

      {showArrows && (
        <button onClick={() => scroll('right')} className="p-1 mx-1 text-gray-500 hover:text-white hover:bg-gray-800 rounded z-10 transition-colors flex-shrink-0">
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}