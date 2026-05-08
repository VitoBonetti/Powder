import React from 'react';
import { Handle, Position } from '@xyflow/react';

export default function StartingNode({ id, data, positionAbsoluteX, positionAbsoluteY }) {
  const meta = data.meta_tags || {};
  const testType = meta.test_type || 'Unknown Scope';

  return (
    <div className="flex flex-col items-center relative w-[160px]">

      {/* Box */}
      <div className="w-[72px] h-[72px] bg-white dark:bg-[#161b22] border-2 border-sky-500 rounded-2xl flex justify-center items-center shadow-sm text-sky-500 relative transition-colors">
        <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="M9 14h6"></path><path d="M9 18h6"></path><path d="M9 10h.01"></path></svg>

        {/* Handle */}
        <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 bg-white dark:bg-[#161b22] border-2 border-slate-400 dark:border-gray-500 !-right-[6px] transition-colors" />
      </div>

      {/* Add Action Button */}
      <button
        onClick={(e) => { e.stopPropagation(); if (data.onAddNode) data.onAddNode(id, positionAbsoluteX, positionAbsoluteY); }}
        className="absolute right-[35px] top-[25px] z-20 w-[22px] h-[22px] bg-white dark:bg-gray-800 text-sky-500 border border-slate-200 dark:border-gray-600 rounded-full cursor-pointer flex justify-center items-center shadow-sm hover:bg-sky-50 dark:hover:bg-gray-700 transition-colors"
        title="Add Action"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>

      {/* Text Below */}
      <div className="mt-2 text-center">
        <div className="font-extrabold text-[14px] text-slate-900 dark:text-gray-100">{data.title}</div>
        <div className="text-[11px] text-sky-500 font-bold mt-0.5">{testType}</div>
      </div>
    </div>
  );
}