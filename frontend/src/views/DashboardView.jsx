import React from 'react';
import {
  Users,
  CheckCircle2,
  TrendingUp,
  Building2,
  FolderKanban,
  FileText,
  CheckSquare,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Kanban,
  Activity,
  Terminal
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';

export function DashboardView({ overview, onNavigate }) {
  const kpis = overview?.kpis || {
    totalLeads: 0,
    qualifiedLeads: 0,
    activeOpportunities: 0,
    clients: 0,
    activeProjects: 0,
    pendingRequirements: 0,
    openTasks: 0,
    blockedItems: 0
  };

  const stages = overview?.pipelineStages || [];
  const activities = overview?.recentActivities || [];
  const blockers = overview?.blockedList || [];

  const kpiCards = [
    { title: 'Total Leads', value: kpis.totalLeads, icon: Users, link: 'leads', color: 'from-blue-500/20 to-indigo-500/5', iconColor: 'text-blue-400' },
    { title: 'Qualified Leads', value: kpis.qualifiedLeads, icon: CheckCircle2, link: 'qualification', color: 'from-emerald-500/20 to-teal-500/5', iconColor: 'text-emerald-400' },
    { title: 'Active Opportunities', value: kpis.activeOpportunities, icon: TrendingUp, link: 'pipeline', color: 'from-purple-500/20 to-pink-500/5', iconColor: 'text-purple-400' },
    { title: 'Clients', value: kpis.clients, icon: Building2, link: 'clients', color: 'from-cyan-500/20 to-blue-500/5', iconColor: 'text-cyan-400' },
    { title: 'Active Projects', value: kpis.activeProjects, icon: FolderKanban, link: 'projects', color: 'from-indigo-500/20 to-violet-500/5', iconColor: 'text-indigo-400' },
    { title: 'Pending Requirements', value: kpis.pendingRequirements, icon: FileText, link: 'requirements', color: 'from-amber-500/20 to-yellow-500/5', iconColor: 'text-amber-400' },
    { title: 'Open Tasks', value: kpis.openTasks, icon: CheckSquare, link: 'tasks', color: 'from-sky-500/20 to-blue-500/5', iconColor: 'text-sky-400' },
    { title: 'Blocked Items', value: kpis.blockedItems, icon: AlertTriangle, link: 'projects', color: kpis.blockedItems > 0 ? 'from-rose-500/25 to-red-500/10' : 'from-slate-800/40 to-slate-900/10', iconColor: kpis.blockedItems > 0 ? 'text-rose-400' : 'text-slate-400' }
  ];

  return (
    <div className="space-y-6">
      {/* Blockers Alert Banner */}
      {blockers.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={18} />
            <div>
              <h4 className="text-xs font-semibold text-rose-200">
                {blockers.length} Active Blocker{blockers.length > 1 ? 's' : ''} Detected
              </h4>
              <p className="text-xs text-rose-300/80 mt-0.5">
                {blockers.slice(0, 3).join(' • ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('tasks')}
            className="text-xs font-medium text-rose-300 hover:text-white flex items-center gap-1 shrink-0"
          >
            Review Blockers <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Top 8 KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpiCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <button
              key={i}
              onClick={() => onNavigate(card.link)}
              className="text-left p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 transition-all hover:translate-y-[-1px] group relative overflow-hidden"
            >
              <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${card.color} rounded-bl-full pointer-events-none opacity-40 group-hover:opacity-70 transition-opacity`} />
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400">{card.title}</span>
                <Icon size={16} className={card.iconColor} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-100 font-mono tracking-tight">
                  {card.value}
                </span>
                <span className="text-[11px] text-slate-500 group-hover:text-slate-300 flex items-center gap-1 transition-colors">
                  View <ArrowRight size={12} />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Business Pipeline Flow Visualization */}
      <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">End-to-End Business Pipeline</h3>
            <p className="text-xs text-slate-400">
              Live progression from prospect discovery to service delivery completion
            </p>
          </div>
          <button
            onClick={() => onNavigate('pipeline')}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            Open Kanban <ArrowRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {stages.map((stage, idx) => (
            <div
              key={stage.key}
              className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-center relative"
            >
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-1 truncate" title={stage.label}>
                {stage.label}
              </div>
              <div className="text-lg font-bold text-slate-100 font-mono">
                {stage.count}
              </div>
              {idx < stages.length - 1 && (
                <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-slate-700 pointer-events-none">
                  ›
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Grid: Recent Activity & Quick Control Hub */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Activity Feed */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-200">Recent CRM & Delivery Activity</h3>
            </div>
            <button
              onClick={() => onNavigate('activity')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              Full Timeline <ArrowRight size={14} />
            </button>
          </div>

          {activities.length > 0 ? (
            <div className="divide-y divide-slate-800/60">
              {activities.slice(0, 6).map((act, i) => (
                <div key={act.id || i} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={act.type} />
                      <span className="text-xs font-semibold text-slate-200 truncate">
                        {act.companyName || 'General Event'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate">{act.description}</p>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0 whitespace-nowrap">
                    {act.occurredAt ? new Date(act.occurredAt).toLocaleDateString() : 'Recent'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-500">
              No recent activity recorded yet.
            </div>
          )}
        </div>

        {/* Right 1 Col: Quick Control Hub */}
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-200">Autonomous Operations</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              9 active AI agents are ready to discover leads, qualify prospects, and coordinate delivery.
            </p>

            <div className="space-y-2">
              <button
                onClick={() => onNavigate('agents')}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-xs text-slate-200 transition-colors"
              >
                <span>View 9 Core AI Agents</span>
                <ArrowRight size={14} className="text-slate-400" />
              </button>
              <button
                onClick={() => onNavigate('pipeline')}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-xs text-slate-200 transition-colors"
              >
                <span>Sales Kanban Board</span>
                <ArrowRight size={14} className="text-slate-400" />
              </button>
              <button
                onClick={() => onNavigate('projects')}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-xs text-slate-200 transition-colors"
              >
                <span>Service Delivery Workspace</span>
                <ArrowRight size={14} className="text-slate-400" />
              </button>
              <button
                onClick={() => onNavigate('communication')}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-xs text-slate-200 transition-colors"
              >
                <span>Communication Workspace ({kpis.preparedMessages || 0} to review)</span>
                <ArrowRight size={14} className="text-slate-400" />
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
              <Terminal size={14} />
              <span>CLI Power Commands</span>
            </div>
            <p className="text-[11px] text-slate-400">Run in your terminal anytime:</p>
            <div className="space-y-1 font-mono text-[11px] text-slate-300">
              <div className="p-1.5 rounded bg-slate-900 border border-slate-800/80">node index.js "find potential customers"</div>
              <div className="p-1.5 rounded bg-slate-900 border border-slate-800/80">node index.js "draft message for Luigi's Trattoria"</div>
              <div className="p-1.5 rounded bg-slate-900 border border-slate-800/80">node index.js "show CRM overview"</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
