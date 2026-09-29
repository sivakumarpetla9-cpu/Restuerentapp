import React, { useState, useEffect } from 'react';
import { CheckSquare, Filter, AlertTriangle, User, Calendar } from 'lucide-react';
import { fetchTasks } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export function TasksView() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  useEffect(() => {
    fetchTasks()
      .then(data => setTasks(data.tasks || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = tasks.filter(t => {
    const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;
    return matchStatus && matchPriority;
  });

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Delivery Implementation Tasks</h2>
          <p className="text-xs text-slate-400">
            Granular execution backlog linked to projects and milestones without fabricated owners or deadlines
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
              <option value="TODO">TODO</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="BLOCKED">BLOCKED</option>
              <option value="REVIEW">REVIEW</option>
              <option value="DONE">DONE</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden"
            >
              <option value="ALL">All Priorities</option>
              <option value="URGENT">URGENT</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading implementation tasks...</div>
        ) : filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Task Title</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">Notes / Blockers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-100">
                      <div>{t.title}</div>
                      <div className="text-[10px] text-slate-500 font-mono">ID: {t.id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {t.projectName || 'General'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.priority} type="priority" />
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      <span className={t.owner === 'UNASSIGNED' ? 'text-slate-500' : 'text-slate-200'}>
                        {t.owner || 'UNASSIGNED'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {t.dueDate || 'NOT SET'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {t.status === 'BLOCKED' ? (
                        <span className="text-rose-400 font-medium">{t.notes || 'Blocked: No explanation provided'}</span>
                      ) : (
                        <span className="text-slate-500">{t.notes || '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No tasks found matching criteria"
            description="Tasks track actionable work items across delivery projects and milestones."
            cliSuggestion='node index.js "show blocked tasks"'
            icon={CheckSquare}
          />
        )}
      </div>
    </div>
  );
}
