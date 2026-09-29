import React, { useState, useEffect } from 'react';
import { Kanban, Clock, Calendar, ArrowRight, User } from 'lucide-react';
import { fetchPipeline } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export function PipelineView({ onSelectLead }) {
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPipeline()
      .then(data => setColumns(data.columns || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const totalLeads = columns.reduce((acc, col) => acc + (col.leads?.length || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Commercial Pipeline Kanban</h2>
          <p className="text-xs text-slate-400">
            Real-time pipeline lifecycle tracking across {columns.length} stages ({totalLeads} total tracked leads)
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading pipeline columns...</div>
      ) : totalLeads === 0 ? (
        <EmptyState
          title="No leads currently in the sales pipeline"
          description="Your sales pipeline is empty. Run lead generation or add leads to track deals."
          cliSuggestion='node index.js "find potential customers"'
          icon={Kanban}
        />
      ) : (
        /* Horizontal scrolling Kanban columns */
        <div className="flex gap-4 overflow-x-auto pb-6 pt-1">
          {columns.map((col) => (
            <div
              key={col.status}
              className="w-72 shrink-0 flex flex-col rounded-xl bg-slate-900/50 border border-slate-800 max-h-[75vh]"
            >
              {/* Column Header */}
              <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/40 rounded-t-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                    {col.title}
                  </span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60">
                  {col.leads.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {col.leads.length > 0 ? (
                  col.leads.map((lead) => (
                    <div
                      key={lead.id}
                      onClick={() => onSelectLead && onSelectLead(lead.id)}
                      className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800/90 hover:border-slate-700 transition-all cursor-pointer shadow-xs space-y-2.5"
                    >
                      {/* Card Header: Company & Qual */}
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-slate-100 hover:text-indigo-300 transition-colors">
                          {lead.companyName}
                        </h4>
                        <StatusBadge
                          status={lead.qualificationStatus || 'NEEDS_RESEARCH'}
                          type="qualification"
                          className="text-[9px]"
                        />
                      </div>

                      {/* Contact Info */}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <User size={12} className="text-slate-500" />
                        <span className="truncate">{lead.contactName || 'Contact not provided'}</span>
                      </div>

                      {/* Next Action */}
                      <div className="text-[11px] text-slate-300 bg-slate-900/70 p-2 rounded border border-slate-800/80">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-0.5">Next Action</span>
                        <span className="line-clamp-2">{lead.pipeline?.nextAction || 'None scheduled'}</span>
                      </div>

                      {/* Dates Footer */}
                      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          <span>Last: {lead.pipeline?.lastContactedAt ? new Date(lead.pipeline.lastContactedAt).toLocaleDateString() : 'NOT SET'}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar size={10} />
                          <span>Due: {lead.pipeline?.nextFollowUpAt ? new Date(lead.pipeline.nextFollowUpAt).toLocaleDateString() : 'NOT SET'}</span>
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-xs text-slate-600 italic">
                    No leads in this stage
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
