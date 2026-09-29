import React, { useState, useEffect } from 'react';
import { Activity, Clock, Filter, Building2 } from 'lucide-react';
import { fetchActivities } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export function ActivityView() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');

  useEffect(() => {
    fetchActivities()
      .then(data => setActivities(data.activities || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const types = [
    'ALL',
    'CLIENT_CONVERTED',
    'PROJECT_CREATED',
    'REQUIREMENT_RECEIVED',
    'REQUIREMENT_CONFIRMED',
    'STATUS_CHANGED',
    'MILESTONE_COMPLETED',
    'CLIENT_REVIEW',
    'PROJECT_COMPLETED',
    'CONTACTED',
    'REPLIED',
    'FOLLOW_UP',
    'DEMO_SCHEDULED',
    'PROPOSAL_SENT',
    'NOTE',
    'OTHER'
  ];

  const filtered = typeFilter === 'ALL'
    ? activities
    : activities.filter(a => a.type === typeFilter);

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Unified Activity Audit Trail</h2>
          <p className="text-xs text-slate-400">
            Immutable chronological timeline of CRM, sales, and service delivery actions
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Filter Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden"
          >
            {types.map(t => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading activity audit log...</div>
        ) : filtered.length > 0 ? (
          <div className="divide-y divide-slate-800/80">
            {filtered.map((act) => (
              <div key={act.id} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-800/30 transition-colors">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={act.type} />
                    <span className="text-xs font-bold text-slate-200">
                      {act.companyName || 'General System Event'}
                    </span>
                    {act.leadId && (
                      <span className="text-[10px] font-mono text-slate-500">Ref: {act.leadId}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{act.description}</p>
                  {act.metadata && Object.keys(act.metadata).length > 0 && (
                    <div className="text-[10px] text-slate-500 font-mono pt-1">
                      Context: {JSON.stringify(act.metadata)}
                    </div>
                  )}
                </div>

                <div className="text-right text-[11px] text-slate-500 font-mono shrink-0 whitespace-nowrap">
                  <div>{act.occurredAt ? new Date(act.occurredAt).toLocaleDateString() : 'NOT SET'}</div>
                  <div className="text-[10px] text-slate-600">{act.occurredAt ? new Date(act.occurredAt).toLocaleTimeString() : ''}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No activity events recorded"
            description="All outreach, qualification, client conversion, and project events are automatically recorded in data/activities.json."
            cliSuggestion='node index.js "show activities"'
            icon={Activity}
          />
        )}
      </div>
    </div>
  );
}
