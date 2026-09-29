import React, { useState, useEffect } from 'react';
import {
  FolderKanban,
  ArrowLeft,
  Calendar,
  Building2,
  CheckSquare,
  FileText,
  Milestone,
  UserCheck,
  AlertTriangle,
  Clock,
  Activity
} from 'lucide-react';
import { fetchProjectDetail } from '../api';
import { StatusBadge } from '../components/StatusBadge';

export function ProjectDetailView({ projectId, onBack, onSelectClient }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      setLoading(true);
      fetchProjectDetail(projectId)
        .then(res => setData(res))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [projectId]);

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading project details...</div>;
  }

  if (!data || !data.project) {
    return (
      <div className="p-8 text-center space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">Project not found</h3>
        <button
          onClick={onBack}
          className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={14} /> Back to Projects
        </button>
      </div>
    );
  }

  const { project, client, onboarding, requirements = [], milestones = [], tasks = [], activities = [] } = data;

  const blockedTasks = tasks.filter(t => t.status === 'BLOCKED');

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Projects
        </button>
        <span className="text-xs font-mono text-slate-500">Project ID: {project.id}</span>
      </div>

      {/* Hero Project Header */}
      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <StatusBadge status={project.status} />
              <StatusBadge status={project.priority} type="priority" />
              <span className="text-xs text-slate-400">Service: {project.serviceType}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-100">{project.projectName}</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">{project.description}</p>
          </div>

          {client && (
            <div
              onClick={() => onSelectClient && onSelectClient(client.id)}
              className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-colors shrink-0"
            >
              <div className="text-[10px] uppercase font-semibold text-slate-500 mb-0.5">Associated Client</div>
              <div className="text-sm font-bold text-indigo-300 flex items-center gap-1.5">
                <Building2 size={14} />
                <span>{client.companyName}</span>
              </div>
            </div>
          )}
        </div>

        {/* Progress & Authoritative Stats */}
        <div className="pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Backend Authoritative Progress</span>
              <span className="font-mono font-bold text-slate-200">{project.progress}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${project.progress}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-6 text-xs text-slate-400 font-mono">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Start Date</span>
              <span className="text-slate-200">{project.startDate || 'NOT SET'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Target Date</span>
              <span className="text-slate-200">{project.targetDate || 'NOT SET'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Blockers alert if any */}
      {blockedTasks.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-start gap-3">
          <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={18} />
          <div>
            <h4 className="text-xs font-semibold text-rose-200">
              {blockedTasks.length} Blocked Task{blockedTasks.length > 1 ? 's' : ''} in this Project
            </h4>
            <ul className="list-disc list-inside text-xs text-rose-300/80 mt-1 space-y-0.5">
              {blockedTasks.map(t => (
                <li key={t.id}>{t.title} {t.notes ? `(${t.notes})` : ''}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Two Column Layout: Deliverables & Onboarding */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Onboarding Checklist */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck size={16} className="text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-200">Onboarding State</h3>
            </div>
            {onboarding && <StatusBadge status={onboarding.status} />}
          </div>

          {onboarding ? (
            <div className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-slate-300 block mb-1">Pending Checklist:</span>
                {onboarding.pendingItems?.length > 0 ? (
                  <ul className="space-y-1">
                    {onboarding.pendingItems.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500 italic">No pending items.</p>
                )}
              </div>

              {onboarding.completedItems?.length > 0 && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="font-semibold text-slate-300 block mb-1">Completed:</span>
                  <ul className="space-y-1">
                    {onboarding.completedItems.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-emerald-400">
                        <span>✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No onboarding record attached.</p>
          )}
        </div>

        {/* Milestones Roadmap */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Milestone size={16} className="text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-200">Milestones Roadmap</h3>
            </div>
            <span className="text-xs text-slate-500 font-mono">{milestones.length} milestones</span>
          </div>

          {milestones.length > 0 ? (
            <div className="space-y-2">
              {milestones.map((m) => (
                <div key={m.id} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-mono font-bold text-indigo-400 shrink-0 text-[10px]">
                      {m.order}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-slate-100">{m.name}</span>
                        <StatusBadge status={m.status} />
                      </div>
                      <p className="text-slate-400 text-[11px]">{m.description}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                    Target: {m.targetDate}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No milestones defined for this project.</p>
          )}
        </div>
      </div>

      {/* Requirements Section */}
      <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-200">Confirmed & Pending Requirements</h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">{requirements.length} recorded</span>
        </div>

        {requirements.length > 0 ? (
          <div className="divide-y divide-slate-800/80">
            {requirements.map((r) => (
              <div key={r.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    <StatusBadge status={r.source} type="evidence" />
                    <span className="font-semibold text-slate-200">{r.title}</span>
                  </div>
                  <p className="text-slate-400">{r.description}</p>
                </div>
                <span className="text-[10px] font-mono text-slate-500 shrink-0">ID: {r.id}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">No requirements recorded yet.</p>
        )}
      </div>

      {/* Tasks Section */}
      <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare size={16} className="text-purple-400" />
            <h3 className="text-sm font-semibold text-slate-200">Implementation Tasks</h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">{tasks.length} total tasks</span>
        </div>

        {tasks.length > 0 ? (
          <div className="divide-y divide-slate-800/80">
            {tasks.map((t) => (
              <div key={t.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={t.status} />
                    <StatusBadge status={t.priority} type="priority" />
                    <span className="font-semibold text-slate-200">{t.title}</span>
                  </div>
                  {t.description && t.description !== t.title && (
                    <p className="text-slate-400">{t.description}</p>
                  )}
                  {t.notes && <p className="text-rose-400">Note: {t.notes}</p>}
                </div>
                <div className="text-right text-[11px] text-slate-500 font-mono shrink-0">
                  <div>Owner: {t.owner}</div>
                  <div>Due: {t.dueDate}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">No implementation tasks created.</p>
        )}
      </div>
    </div>
  );
}
