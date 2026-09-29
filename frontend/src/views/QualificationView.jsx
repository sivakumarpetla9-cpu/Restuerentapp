import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, HelpCircle, XCircle, Search, ExternalLink } from 'lucide-react';
import { fetchLeads } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export function QualificationView({ onSelectLead }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetchLeads()
      .then(data => setLeads(data.leads || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const counts = {
    QUALIFIED: leads.filter(l => l.qualificationStatus === 'QUALIFIED').length,
    POSSIBLE_FIT: leads.filter(l => l.qualificationStatus === 'POSSIBLE_FIT').length,
    NEEDS_RESEARCH: leads.filter(l => l.qualificationStatus === 'NEEDS_RESEARCH' || !l.qualificationStatus).length,
    UNQUALIFIED: leads.filter(l => l.qualificationStatus === 'UNQUALIFIED').length
  };

  const filtered = filter === 'ALL'
    ? leads
    : leads.filter(l => (l.qualificationStatus || 'NEEDS_RESEARCH') === filter);

  return (
    <div className="space-y-6">
      {/* Tier Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <button
          onClick={() => setFilter(filter === 'QUALIFIED' ? 'ALL' : 'QUALIFIED')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filter === 'QUALIFIED'
              ? 'bg-emerald-950/40 border-emerald-600 ring-1 ring-emerald-500'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-emerald-400">Qualified</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">{counts.QUALIFIED}</div>
          <p className="text-[11px] text-slate-400 mt-1">High ICP fit, verified operational need</p>
        </button>

        <button
          onClick={() => setFilter(filter === 'POSSIBLE_FIT' ? 'ALL' : 'POSSIBLE_FIT')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filter === 'POSSIBLE_FIT'
              ? 'bg-sky-950/40 border-sky-600 ring-1 ring-sky-500'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-sky-400">Possible Fit</span>
            <HelpCircle size={16} className="text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">{counts.POSSIBLE_FIT}</div>
          <p className="text-[11px] text-slate-400 mt-1">Likely fit, needs outreach discovery</p>
        </button>

        <button
          onClick={() => setFilter(filter === 'NEEDS_RESEARCH' ? 'ALL' : 'NEEDS_RESEARCH')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filter === 'NEEDS_RESEARCH'
              ? 'bg-amber-950/40 border-amber-600 ring-1 ring-amber-500'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-amber-400">Needs Research</span>
            <AlertCircle size={16} className="text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">{counts.NEEDS_RESEARCH}</div>
          <p className="text-[11px] text-slate-400 mt-1">Lacks required facts or contact data</p>
        </button>

        <button
          onClick={() => setFilter(filter === 'UNQUALIFIED' ? 'ALL' : 'UNQUALIFIED')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filter === 'UNQUALIFIED'
              ? 'bg-rose-950/40 border-rose-600 ring-1 ring-rose-500'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-rose-400">Unqualified</span>
            <XCircle size={16} className="text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">{counts.UNQUALIFIED}</div>
          <p className="text-[11px] text-slate-400 mt-1">Does not meet commercial ICP criteria</p>
        </button>
      </div>

      {/* Evaluated Leads Table */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-200">
              ICP Evaluation Results {filter !== 'ALL' && `(${filter})`}
            </h3>
            <span className="text-xs text-slate-500 font-mono">({filtered.length} leads)</span>
          </div>
          {filter !== 'ALL' && (
            <button
              onClick={() => setFilter('ALL')}
              className="text-xs text-indigo-400 hover:underline"
            >
              Reset filter
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading qualification data...</div>
        ) : filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Industry</th>
                  <th className="px-4 py-3">Qualification Tier</th>
                  <th className="px-4 py-3">Fit Score</th>
                  <th className="px-4 py-3">Evidence Source</th>
                  <th className="px-4 py-3">Fit Rationale / Operational Need</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-100">
                      {l.companyName}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{l.industry || 'General'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={l.qualificationStatus || 'NEEDS_RESEARCH'} type="qualification" />
                    </td>
                    <td className="px-4 py-3 font-mono font-medium">
                      {l.fitScore !== undefined ? `${l.fitScore}/100` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={l.evidence || 'USER-PROVIDED'} type="evidence" />
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-xs truncate">
                      {l.qualificationNotes || l.potentialNeed || 'Pending evaluation'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No leads in this qualification tier"
            description="Run the Lead Qualification Agent to score and evaluate leads against your ICP rubric."
            cliSuggestion='node index.js "qualify my leads"'
            icon={CheckCircle2}
          />
        )}
      </div>
    </div>
  );
}
