import React from 'react';
import { Menu, Search, RefreshCw, Activity, Terminal, LogOut } from 'lucide-react';

export function Header({
  currentView,
  onOpenSearch,
  onRefresh,
  isRefreshing,
  onToggleSidebar,
  currentUser,
  onLogout
}) {
  const titles = {
    dashboard: 'Business Operations Overview',
    agents: 'AI Business Agents Registry',
    leads: 'Lead Management & Intelligence',
    qualification: 'Lead Qualification & ICP Rubric',
    pipeline: 'Sales Pipeline Kanban',
    clients: 'Client Accounts & CRM',
    client_detail: 'Client 360° Workspace',
    projects: 'Service Delivery Projects',
    project_detail: 'Project Delivery Workspace',
    onboarding: 'Client Onboarding Lifecycle',
    requirements: 'Project Requirements Registry',
    milestones: 'Delivery Milestones Roadmap',
    tasks: 'Delivery Backlog & Tasks',
    activity: 'Audit Log & Activity Timeline',
    communication: 'Client Communication & Outreach',
    users: 'Users & Security Administration'
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-4 sm:px-6">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 lg:hidden"
          aria-label="Open navigation sidebar"
        >
          <Menu size={20} />
        </button>

        <div>
          <h2 className="text-sm sm:text-base font-semibold text-slate-100 tracking-tight">
            {titles[currentView] || 'Business Agent Dashboard'}
          </h2>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Local-First Autonomous Business System
          </p>
        </div>
      </div>

      {/* Right: Search Bar & Connection Status */}
      <div className="flex items-center gap-3">
        {/* Global Search Button */}
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors"
        >
          <Search size={14} className="text-slate-500" />
          <span className="hidden sm:inline">Search leads, clients, tasks...</span>
          <span className="sm:hidden">Search</span>
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-400 rounded border border-slate-700">
            /
          </kbd>
        </button>

        {/* Refresh Data Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-1.5 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors disabled:opacity-50"
          title="Refresh Data from Local JSON Stores"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-indigo-400' : ''} />
        </button>

        {/* Local Backend Indicator */}
        <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-[11px] text-emerald-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Local Engine Active</span>
        </div>

        {/* User Profile & Logout */}
        {currentUser && (
          <div className="flex items-center gap-2.5 pl-2.5 border-l border-slate-800">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-200 leading-tight">
                {currentUser.name}
              </span>
              <span className="text-[10px] text-indigo-400 font-mono font-medium">
                {currentUser.role}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-rose-800/60 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 text-xs transition-colors"
              title={`Sign out (${currentUser.email})`}
              aria-label="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
