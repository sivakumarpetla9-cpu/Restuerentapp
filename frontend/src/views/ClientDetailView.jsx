import React, { useState, useEffect } from 'react';
import {
  Building2,
  ArrowLeft,
  User,
  Mail,
  Phone,
  FolderKanban,
  CheckSquare,
  FileText,
  Milestone,
  UserCheck,
  Activity,
  AlertTriangle,
  Clock,
  Calendar,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { fetchClientProfile } from '../api';
import { StatusBadge } from '../components/StatusBadge';

export function ClientDetailView({ clientId, onBack, onSelectProject }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'delivery', 'requirements', 'tasks', 'activity'

  useEffect(() => {
    if (clientId) {
      setLoading(true);
      fetchClientProfile(clientId)
        .then(data => setProfile(data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [clientId]);

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading client 360° workspace...</div>;
  }

  if (!profile || !profile.client) {
    return (
      <div className="p-8 text-center space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">Client record not found</h3>
        <button
          onClick={onBack}
          className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={14} /> Back to Clients
        </button>
      </div>
    );
  }

  const { client, project, onboarding, requirements = [], milestones = [], tasks = [], blockers = [], nextAction, activities = [], contacts = [] } = profile;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Clients
        </button>
        <span className="text-xs font-mono text-slate-500">Client ID: {client.id}</span>
      </div>

      {/* Hero Workspace Header */}
      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
              <Building2 size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-slate-100">{client.companyName}</h2>
                <StatusBadge status={client.status || 'ACTIVE'} />
              </div>
              <p className="text-xs text-slate-400">
                Contracted Service: <span className="text-slate-200 font-medium">{client.service || 'RESEARCH REQUIRED'}</span>
                {client.leadId && (
                  <span className="ml-3 font-mono text-slate-500">• Lead Ref: {client.leadId}</span>
                )}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs space-y-1">
            <span className="text-[10px] uppercase font-semibold text-slate-500 block">Recommended Next Action</span>
            <div className="text-indigo-300 font-medium">{nextAction}</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-t border-slate-800/80 pt-4 overflow-x-auto">
          {[
            { id: 'overview', label: '360° Overview', icon: Building2 },
            { id: 'delivery', label: 'Service Delivery & Roadmap', icon: FolderKanban, count: milestones.length },
            { id: 'requirements', label: 'Requirements', icon: FileText, count: requirements.length },
            { id: 'tasks', label: 'Tasks', icon: CheckSquare, count: tasks.length },
            { id: 'activity', label: 'CRM Timeline', icon: Activity, count: activities.length }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  isActive
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content: 360° Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Active Blockers if any */}
          {blockers.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-start gap-3">
              <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="text-xs font-semibold text-rose-200">Active Blockers for this Account</h4>
                <ul className="list-disc list-inside text-xs text-rose-300/80 mt-1 space-y-0.5">
                  {blockers.map((b, idx) => (
                    <li key={idx}>{b}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left 2 Cols: Linked Project & Onboarding */}
            <div className="md:col-span-2 space-y-6">
              {/* Linked Delivery Project */}
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderKanban size={16} className="text-indigo-400" />
                    <h3 className="text-sm font-semibold text-slate-200">Active Delivery Project</h3>
                  </div>
                  {project && (
                    <StatusBadge status={project.status} />
                  )}
                </div>

                {project ? (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-100">{project.projectName}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{project.description}</p>
                      </div>
                      <span className="text-xs font-mono text-slate-400">Priority: <StatusBadge status={project.priority} type="priority" /></span>
                    </div>

                    {/* Progress Bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-400">Implementation Progress</span>
                        <span className="font-mono font-bold text-slate-200">{project.progress}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>Start: {project.startDate}</span>
                      <span>Target: {project.targetDate}</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-400">
                    No active service delivery project created yet.
                    <div className="mt-2 font-mono text-[11px] text-slate-300">
                      Run: node index.js "create project for {client.companyName}"
                    </div>
                  </div>
                )}
              </div>

              {/* Onboarding Stage */}
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck size={16} className="text-emerald-400" />
                    <h3 className="text-sm font-semibold text-slate-200">Client Onboarding Workflow</h3>
                  </div>
                  {onboarding && (
                    <StatusBadge status={onboarding.status} />
                  )}
                </div>

                {onboarding ? (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-300">
                      <span className="font-semibold text-slate-200 block mb-1">Pending Checklist Items:</span>
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
                        <p className="text-slate-500 italic">All onboarding checklist items completed.</p>
                      )}
                    </div>

                    {onboarding.completedItems?.length > 0 && (
                      <div className="text-xs text-slate-400 pt-2 border-t border-slate-800">
                        <span className="font-semibold text-slate-300 block mb-1">Completed Items:</span>
                        <ul className="space-y-1">
                          {onboarding.completedItems.map((item, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-emerald-400">
                              <span className="text-xs">✓</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">Onboarding not yet initialized.</p>
                )}
              </div>
            </div>

            {/* Right 1 Col: Account Contacts & Overview Metrics */}
            <div className="space-y-6">
              {/* Primary Contact Card */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Primary Contact</h4>
                {client.primaryContact ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                      <User size={15} className="text-indigo-400" />
                      <span>{client.primaryContact.name}</span>
                    </div>
                    {client.primaryContact.role && (
                      <div className="text-xs text-slate-400 ml-6">{client.primaryContact.role}</div>
                    )}
                    {client.primaryContact.email && (
                      <div className="flex items-center gap-2 text-xs text-slate-300 ml-6">
                        <Mail size={13} className="text-slate-500" />
                        <span>{client.primaryContact.email}</span>
                      </div>
                    )}
                    {client.primaryContact.phone && (
                      <div className="flex items-center gap-2 text-xs text-slate-300 ml-6">
                        <Phone size={13} className="text-slate-500" />
                        <span>{client.primaryContact.phone}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No primary contact recorded.</p>
                )}
              </div>

              {/* Delivery Stats Card */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Delivery Metrics</h4>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase">Requirements</div>
                    <div className="text-base font-bold text-slate-100 font-mono">{requirements.length}</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase">Milestones</div>
                    <div className="text-base font-bold text-slate-100 font-mono">{milestones.length}</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase">Open Tasks</div>
                    <div className="text-base font-bold text-slate-100 font-mono">
                      {tasks.filter(t => t.status !== 'DONE').length}
                    </div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase">Completed</div>
                    <div className="text-base font-bold text-emerald-400 font-mono">
                      {tasks.filter(t => t.status === 'DONE').length}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Service Delivery & Milestones */}
      {activeTab === 'delivery' && (
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Delivery Milestones Roadmap</h3>
            <span className="text-xs text-slate-500 font-mono">{milestones.length} milestones</span>
          </div>

          {milestones.length > 0 ? (
            <div className="space-y-3">
              {milestones.map((m) => (
                <div key={m.id} className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-mono font-bold text-indigo-400 shrink-0">
                      {m.order}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-xs font-bold text-slate-100">{m.name}</h4>
                        <StatusBadge status={m.status} />
                      </div>
                      <p className="text-xs text-slate-400">{m.description}</p>
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-slate-500 font-mono shrink-0">
                    <div>Target: {m.targetDate}</div>
                    {m.completedAt && <div className="text-emerald-400">Done: {new Date(m.completedAt).toLocaleDateString()}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-6 text-center">No milestones configured for this project yet.</p>
          )}
        </div>
      )}

      {/* Tab Content: Requirements */}
      {activeTab === 'requirements' && (
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Project Requirements</h3>
            <span className="text-xs text-slate-500 font-mono">{requirements.length} recorded</span>
          </div>

          {requirements.length > 0 ? (
            <div className="divide-y divide-slate-800/80">
              {requirements.map((r) => (
                <div key={r.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      <StatusBadge status={r.source} type="evidence" />
                      <span className="text-xs font-bold text-slate-200">{r.title}</span>
                    </div>
                    <p className="text-xs text-slate-400">{r.description}</p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">ID: {r.id}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-6 text-center">No requirements recorded for this client yet.</p>
          )}
        </div>
      )}

      {/* Tab Content: Tasks */}
      {activeTab === 'tasks' && (
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Delivery Tasks Backlog</h3>
            <span className="text-xs text-slate-500 font-mono">{tasks.length} tasks</span>
          </div>

          {tasks.length > 0 ? (
            <div className="divide-y divide-slate-800/80">
              {tasks.map((t) => (
                <div key={t.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={t.status} />
                      <StatusBadge status={t.priority} type="priority" />
                      <span className="text-xs font-bold text-slate-200">{t.title}</span>
                    </div>
                    {t.description && t.description !== t.title && (
                      <p className="text-xs text-slate-400">{t.description}</p>
                    )}
                    {t.notes && <p className="text-xs text-rose-400">Note: {t.notes}</p>}
                  </div>
                  <div className="text-right text-[11px] text-slate-500 font-mono shrink-0">
                    <div>Owner: {t.owner}</div>
                    <div>Due: {t.dueDate}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-6 text-center">No tasks recorded for this client project yet.</p>
          )}
        </div>
      )}

      {/* Tab Content: CRM Activities Timeline */}
      {activeTab === 'activity' && (
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Client CRM & Delivery Timeline</h3>
            <span className="text-xs text-slate-500 font-mono">{activities.length} events</span>
          </div>

          {activities.length > 0 ? (
            <div className="space-y-3">
              {activities.map((a) => (
                <div key={a.id} className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={a.type} />
                      <span className="text-xs font-semibold text-slate-200">{a.description}</span>
                    </div>
                    {a.metadata && Object.keys(a.metadata).length > 0 && (
                      <div className="text-[10px] text-slate-500 font-mono mt-1">
                        Metadata: {JSON.stringify(a.metadata)}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                    {new Date(a.occurredAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-6 text-center">No timeline events logged yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
