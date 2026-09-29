import React from 'react';
import {
  LayoutDashboard,
  Bot,
  Users,
  CheckCircle2,
  Kanban,
  Building2,
  FolderKanban,
  UserCheck,
  FileText,
  Milestone,
  CheckSquare,
  Activity,
  X,
  Cpu,
  ShieldCheck,
  Shield,
  Mail,
  Utensils,
  Receipt
} from 'lucide-react';

export function Sidebar({ currentView, setCurrentView, isOpen, setIsOpen, stats = {}, currentUser = null, billingEnabled = false }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Overview' },
    { id: 'agents', label: 'AI Agents', icon: Bot, badge: '9 Active', section: 'Overview' },
    ...(currentUser?.role === 'ADMIN' ? [{ id: 'users', label: 'Users & Security', icon: Shield, section: 'Overview' }] : []),

    { id: 'restaurant_kitchen', label: 'Kitchen Display', icon: Utensils, badge: 'KDS', section: 'Restaurant OS' },
    ...(billingEnabled || currentUser?.role === 'ADMIN'
      ? [{ id: 'restaurant_billing', label: 'Billing & Payments', icon: Receipt, badge: 'Bills', section: 'Restaurant OS' }]
      : []),

    { id: 'leads', label: 'Leads', icon: Users, section: 'Sales & CRM' },
    { id: 'qualification', label: 'Qualification', icon: CheckCircle2, section: 'Sales & CRM' },
    { id: 'pipeline', label: 'Sales Pipeline', icon: Kanban, section: 'Sales & CRM' },
    { id: 'clients', label: 'Clients / CRM', icon: Building2, section: 'Sales & CRM' },
    { id: 'communication', label: 'Communication', icon: Mail, section: 'Sales & CRM' },

    { id: 'projects', label: 'Projects', icon: FolderKanban, section: 'Service Delivery' },
    { id: 'onboarding', label: 'Onboarding', icon: UserCheck, section: 'Service Delivery' },
    { id: 'requirements', label: 'Requirements', icon: FileText, section: 'Service Delivery' },
    { id: 'milestones', label: 'Milestones', icon: Milestone, section: 'Service Delivery' },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, section: 'Service Delivery' },

    { id: 'activity', label: 'Activity', icon: Activity, section: 'Audit' }
  ];

  // Group nav items by section
  const sections = ['Overview', 'Restaurant OS', 'Sales & CRM', 'Service Delivery', 'Audit'];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900/95 border-r border-slate-800 flex flex-col transition-transform duration-200 ease-in-out backdrop-blur-md lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Bot size={20} />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-100 tracking-tight">AI Business Agent</h1>
              <p className="text-[11px] text-slate-400 font-medium">Local Business OS</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {sections.map(section => {
            const items = navItems.filter(item => item.section === section);
            return (
              <div key={section} className="space-y-1">
                <p className="px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  {section}
                </p>
                {items.map(item => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  let count = null;
                  if (item.id === 'leads') count = stats.totalLeads;
                  if (item.id === 'clients') count = stats.clients;
                  if (item.id === 'projects') count = stats.activeProjects;
                  if (item.id === 'tasks') count = stats.openTasks;
                  if (item.id === 'communication') count = stats.preparedMessages;

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setCurrentView(item.id);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-indigo-600 text-white font-semibold shadow-xs shadow-indigo-600/30'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon size={16} className={isActive ? 'text-white' : 'text-slate-400'} />
                        <span>{item.label}</span>
                      </div>

                      {item.badge ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-mono">
                          {item.badge}
                        </span>
                      ) : count !== null && count > 0 ? (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                            isActive
                              ? 'bg-indigo-700 text-white'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* System & Model Status Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 space-y-2">
          <div className="flex items-center justify-between px-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <Cpu size={12} className="text-emerald-400" />
              <span>Ollama: qwen3:8b</span>
            </span>
            <span className="text-emerald-400 text-[10px] font-semibold uppercase">Active</span>
          </div>

          <div className="flex items-center justify-between px-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-indigo-400" />
              <span>₹0 External APIs</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500">Local JSON</span>
          </div>
        </div>
      </aside>
    </>
  );
}
