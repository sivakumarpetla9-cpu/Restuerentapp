import React, { useState, useEffect } from 'react';
import { FileText, Filter, AlertTriangle, ShieldCheck } from 'lucide-react';
import { fetchRequirements } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export function RequirementsView() {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');

  useEffect(() => {
    fetchRequirements()
      .then(data => setRequirements(data.requirements || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = requirements.filter(r => {
    const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
    const matchSource = sourceFilter === 'ALL' || r.source === sourceFilter;
    return matchStatus && matchSource;
  });

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Requirements & Evidence Registry</h2>
          <p className="text-xs text-slate-400">
            Strict evidence tagging prevents AI assumptions from being treated as confirmed client requirements
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="RECEIVED">RECEIVED</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Evidence Source:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden"
            >
              <option value="ALL">All Sources</option>
              <option value="USER-PROVIDED">USER-PROVIDED</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="ASSUMPTION">ASSUMPTION</option>
              <option value="RESEARCH REQUIRED">RESEARCH REQUIRED</option>
            </select>
          </div>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/40 flex items-center gap-2 text-xs text-indigo-300">
        <ShieldCheck size={16} className="text-indigo-400 shrink-0" />
        <span>
          Safety Protocol: Items tagged <code className="text-amber-400 font-semibold">[ASSUMPTION]</code> or <code className="text-rose-400 font-semibold">[RESEARCH REQUIRED]</code> must be explicitly confirmed by the user before execution.
        </span>
      </div>

      {/* Requirements Table */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading requirements...</div>
        ) : filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Requirement Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Evidence Source</th>
                  <th className="px-4 py-3">Project / Client</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Recorded Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-100">
                      <div>{r.title}</div>
                      <div className="text-[10px] text-slate-500 font-mono">ID: {r.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.source} type="evidence" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-200">{r.clientName || 'General'}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[160px]">{r.projectName}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-sm">
                      <p className="line-clamp-2">{r.description}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 font-mono">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'NOT SET'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No requirements found"
            description="Requirements are collected and confirmed during project onboarding."
            cliSuggestion='node index.js "show pending requirements"'
            icon={FileText}
          />
        )}
      </div>
    </div>
  );
}
