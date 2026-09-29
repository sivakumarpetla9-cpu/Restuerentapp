import React, { useState, useEffect } from 'react';
import { FolderKanban, ChevronRight, Filter, Calendar, AlertTriangle } from 'lucide-react';
import { fetchProjects } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export function ProjectsView({ onSelectProject }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    fetchProjects()
      .then(data => setProjects(data.projects || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const statuses = [
    'ALL',
    'PLANNED',
    'ONBOARDING',
    'IN_PROGRESS',
    'CLIENT_REVIEW',
    'BLOCKED',
    'COMPLETED',
    'CANCELLED'
  ];

  const filtered = statusFilter === 'ALL'
    ? projects
    : projects.filter(p => p.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Service Delivery Projects</h2>
          <p className="text-xs text-slate-400">
            Active and completed customer implementation projects with real-time progress
          </p>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
          {statuses.map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                statusFilter === st
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {st.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading delivery projects...</div>
        ) : filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Project Name</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Service Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Target Date</th>
                  <th className="px-4 py-3 text-right">Workspace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => onSelectProject(p.id)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-100">
                      <div>{p.projectName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">ID: {p.id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-200 font-medium">
                      {p.clientName}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {p.serviceType}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.priority} type="priority" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-28 space-y-1">
                        <div className="flex justify-between text-[10px] font-mono text-slate-400">
                          <span>{p.progress}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${p.progress}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {p.targetDate || 'NOT SET'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectProject(p.id);
                        }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1"
                      >
                        Inspect <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No service delivery projects found"
            description="Projects are created for converted clients to coordinate onboarding, requirements, and milestones."
            cliSuggestion='node index.js "create project for <Client Name>"'
            icon={FolderKanban}
          />
        )}
      </div>
    </div>
  );
}
