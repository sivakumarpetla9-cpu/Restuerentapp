import React, { useState, useEffect } from 'react';
import { Milestone, CheckCircle2, Clock, Calendar } from 'lucide-react';
import { fetchMilestones } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export function MilestonesView() {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMilestones()
      .then(data => setMilestones(data.milestones || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-200">Delivery Milestones Roadmap</h2>
        <p className="text-xs text-slate-400">
          Sequenced milestone phases across client delivery projects without fabricated target dates
        </p>
      </div>

      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading delivery milestones...</div>
        ) : milestones.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Milestone Name</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Start Date</th>
                  <th className="px-4 py-3">Target Date</th>
                  <th className="px-4 py-3">Completed Date</th>
                  <th className="px-4 py-3">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {milestones.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-indigo-400">
                      #{m.order}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-100">
                      <div>{m.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">ID: {m.id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {m.projectName || 'General'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {m.startDate || 'NOT SET'}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {m.targetDate || 'NOT SET'}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {m.completedAt ? (
                        <span className="text-emerald-400 font-medium">
                          {new Date(m.completedAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-slate-500">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-xs truncate">
                      {m.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No milestones recorded"
            description="Milestones structure the implementation roadmap for client projects."
            cliSuggestion='node index.js "show project milestones for <client>"'
            icon={Milestone}
          />
        )}
      </div>
    </div>
  );
}
