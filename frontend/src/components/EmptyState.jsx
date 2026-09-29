import React from 'react';
import { Terminal, Database } from 'lucide-react';

export function EmptyState({
  title = 'No records found',
  description = 'There is currently no data recorded in the local JSON storage.',
  cliSuggestion = '',
  icon: Icon = Database
}) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/30 my-6">
      <div className="w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-400 mb-4 border border-slate-700/60">
        <Icon size={24} />
      </div>
      <h3 className="text-base font-semibold text-slate-200 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md mb-6">{description}</p>

      {cliSuggestion && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-300 font-mono">
          <Terminal size={14} className="text-indigo-400 shrink-0" />
          <span>{cliSuggestion}</span>
        </div>
      )}
    </div>
  );
}
