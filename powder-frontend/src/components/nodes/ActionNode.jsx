import React from 'react';
import { Handle, Position } from '@xyflow/react';

const PhaseIcons = {
  Reconnaissance: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
  Enumeration: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 17 22 12"></polyline></svg>,
  Exploitation: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>,
  "Post-Exploitation": <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>,
  Reporting: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
  Default: <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
};

export default function ActionNode({ id, data, positionAbsoluteX, positionAbsoluteY }) {
  const status = data.status || 'action';
  const meta = data.meta_tags || {};
  const phase = meta.category || 'Reconnaissance';

  // Dynamic Tailwind Classes based on status
  const getStyles = (nodeStatus) => {
    switch (nodeStatus) {
      case 'path': return { icon: 'text-green-600 dark:text-green-500', border: 'border-green-500 dark:border-green-600', text: 'text-green-800 dark:text-green-400', subBg: 'bg-green-100 dark:bg-green-900/30' };
      case 'rabbit_hole': return { icon: 'text-slate-500 dark:text-slate-400', border: 'border-slate-300 dark:border-slate-600', text: 'text-slate-600 dark:text-slate-400', subBg: 'bg-slate-100 dark:bg-slate-800/50' };
      case 'vulnerability': return { icon: 'text-red-600 dark:text-red-500', border: 'border-red-500 dark:border-red-600', text: 'text-red-800 dark:text-red-400', subBg: 'bg-red-100 dark:bg-red-900/30' };
      case 'action':
      default: return { icon: 'text-sky-500 dark:text-sky-400', border: 'border-slate-300 dark:border-gray-600', text: 'text-slate-900 dark:text-gray-300', subBg: 'bg-slate-50 dark:bg-gray-800/80' };
    }
  };
  const styles = getStyles(status);

  return (
    <div className="flex flex-col items-center relative w-[160px]">

      {/* Delete Button */}
      <button
        onClick={(e) => { e.stopPropagation(); if (data.onDeleteNode) data.onDeleteNode(id); }}
        className="absolute -top-[10px] left-[35px] z-20 w-[22px] h-[22px] bg-white dark:bg-gray-800 text-red-500 border border-slate-200 dark:border-gray-600 rounded-full cursor-pointer flex justify-center items-center shadow-sm hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
        title="Delete Node"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>

      {/* Main Square Icon Box */}
      <div className={`w-[72px] h-[72px] bg-white dark:bg-[#161b22] border-2 ${styles.border} rounded-2xl flex justify-center items-center shadow-sm ${styles.icon} relative transition-colors`}>
        {PhaseIcons[phase] || PhaseIcons.Default}

        {/* Handles */}
        <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 bg-white dark:bg-[#161b22] border-2 border-slate-400 dark:border-gray-500 !-left-[6px] transition-colors" />
        <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 bg-white dark:bg-[#161b22] border-2 border-slate-400 dark:border-gray-500 !-right-[6px] transition-colors" />
      </div>

      {/* Add Button */}
      <button
        onClick={(e) => { e.stopPropagation(); if (data.onAddNode) data.onAddNode(id, positionAbsoluteX, positionAbsoluteY); }}
        className="absolute right-[30px] top-[25px] z-20 w-[22px] h-[22px] bg-white dark:bg-gray-800 text-sky-500 border border-slate-200 dark:border-gray-600 rounded-full cursor-pointer flex justify-center items-center shadow-sm hover:bg-sky-50 dark:hover:bg-gray-700 transition-colors"
        title="Add Action"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>

      {/* Text Below */}
      <div className="mt-2 text-center w-full flex flex-col items-center">
        <div className="font-bold text-[13px] text-slate-900 dark:text-gray-100">{data.title}</div>
        {data.command && (
          <div className={`text-[11px] ${styles.text} ${styles.subBg} px-1.5 py-0.5 rounded flex items-center justify-center mt-1 font-mono max-w-[140px] truncate transition-colors`}>
            {data.command}
          </div>
        )}
      </div>
    </div>
  );
}