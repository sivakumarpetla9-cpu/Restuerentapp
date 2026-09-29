import React from 'react';

export function StatusBadge({ status, type = 'status', className = '' }) {
  if (!status) return <span className="text-xs text-slate-500">NOT SET</span>;

  const s = String(status).toUpperCase();

  // Color mappings
  let styles = 'bg-slate-800 text-slate-300 border-slate-700';

  if (type === 'evidence') {
    switch (s) {
      case 'VERIFIED':
        styles = 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60';
        break;
      case 'USER-PROVIDED':
        styles = 'bg-blue-950/80 text-blue-400 border-blue-800/60';
        break;
      case 'CALCULATED':
        styles = 'bg-indigo-950/80 text-indigo-400 border-indigo-800/60';
        break;
      case 'RECOMMENDATION':
        styles = 'bg-purple-950/80 text-purple-400 border-purple-800/60';
        break;
      case 'ASSUMPTION':
        styles = 'bg-amber-950/80 text-amber-400 border-amber-800/60 font-semibold';
        break;
      case 'RESEARCH REQUIRED':
        styles = 'bg-rose-950/80 text-rose-400 border-rose-800/60 font-semibold';
        break;
      default:
        styles = 'bg-slate-800 text-slate-300 border-slate-700';
    }
  } else if (type === 'qualification') {
    switch (s) {
      case 'QUALIFIED':
        styles = 'bg-emerald-950/90 text-emerald-400 border-emerald-800/70 font-semibold';
        break;
      case 'POSSIBLE_FIT':
        styles = 'bg-sky-950/80 text-sky-400 border-sky-800/60';
        break;
      case 'NEEDS_RESEARCH':
        styles = 'bg-amber-950/80 text-amber-400 border-amber-800/60';
        break;
      case 'UNQUALIFIED':
        styles = 'bg-rose-950/80 text-rose-400 border-rose-800/60';
        break;
      default:
        styles = 'bg-slate-800 text-slate-300 border-slate-700';
    }
  } else if (type === 'priority') {
    switch (s) {
      case 'URGENT':
        styles = 'bg-rose-950/90 text-rose-400 border-rose-800/70 font-semibold';
        break;
      case 'HIGH':
        styles = 'bg-orange-950/80 text-orange-400 border-orange-800/60';
        break;
      case 'MEDIUM':
        styles = 'bg-blue-950/80 text-blue-400 border-blue-800/60';
        break;
      case 'LOW':
        styles = 'bg-slate-800 text-slate-400 border-slate-700';
        break;
      default:
        styles = 'bg-slate-800 text-slate-300 border-slate-700';
    }
  } else if (type === 'role') {
    switch (s) {
      case 'ADMIN':
        styles = 'bg-purple-950/80 text-purple-300 border-purple-700/60 font-semibold';
        break;
      case 'SALES':
        styles = 'bg-blue-950/80 text-blue-300 border-blue-700/60 font-semibold';
        break;
      case 'DELIVERY':
        styles = 'bg-teal-950/80 text-teal-300 border-teal-700/60 font-semibold';
        break;
      case 'VIEWER':
        styles = 'bg-slate-800 text-slate-300 border-slate-700 font-medium';
        break;
      default:
        styles = 'bg-slate-800 text-slate-300 border-slate-700';
    }
  } else {
    // General Status (Pipeline, Project, Task, Milestone, Onboarding, Requirement, User)
    switch (s) {
      case 'ADMIN':
        styles = 'bg-purple-950/80 text-purple-300 border-purple-700/60 font-semibold';
        break;
      case 'DELIVERY':
        styles = 'bg-teal-950/80 text-teal-300 border-teal-700/60 font-semibold';
        break;
      case 'SALES':
        styles = 'bg-blue-950/80 text-blue-300 border-blue-700/60 font-semibold';
        break;
      case 'VIEWER':
        styles = 'bg-slate-800 text-slate-300 border-slate-700 font-medium';
        break;
      case 'DISABLED':
      case 'WON':
      case 'COMPLETED':
      case 'ONBOARDING_COMPLETED':
      case 'CONFIRMED':
      case 'DONE':
      case 'ACTIVE':
      case 'APPROVED':
        styles = 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60 font-medium';
        break;
      case 'COPIED':
        styles = 'bg-indigo-950/80 text-indigo-400 border-indigo-800/60 font-medium';
        break;
      case 'READY_FOR_REVIEW':
        styles = 'bg-sky-950/80 text-sky-300 border-sky-800/60 font-semibold';
        break;
      case 'DRAFT':
        styles = 'bg-amber-950/50 text-amber-300 border-amber-800/50';
        break;
      case 'PROPOSAL_SENT':
      case 'DEMO_SCHEDULED':
      case 'CLIENT_REVIEW':
      case 'REVIEW':
        styles = 'bg-purple-950/80 text-purple-400 border-purple-800/60';
        break;
      case 'IN_PROGRESS':
      case 'INTERESTED':
      case 'RECEIVED':
      case 'PROJECT_SETUP':
      case 'REQUIREMENTS_CONFIRMED':
        styles = 'bg-blue-950/80 text-blue-400 border-blue-800/60';
        break;
      case 'CONTACTED':
      case 'REPLIED':
      case 'FOLLOW_UP':
      case 'WELCOME':
      case 'REQUIREMENTS_COLLECTION':
        styles = 'bg-sky-950/80 text-sky-400 border-sky-800/60';
        break;
      case 'WHATSAPP':
        styles = 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60 font-medium';
        break;
      case 'EMAIL':
        styles = 'bg-blue-950/70 text-blue-300 border-blue-700/60 font-medium';
        break;
      case 'SMS':
        styles = 'bg-amber-950/70 text-amber-300 border-amber-700/60 font-medium';
        break;
      case 'SEND_REQUESTED':
        styles = 'bg-amber-950/80 text-amber-300 border-amber-700/60 font-semibold animate-pulse';
        break;
      case 'SENT':
        styles = 'bg-blue-950/80 text-blue-300 border-blue-700/60 font-medium';
        break;
      case 'DELIVERED':
        styles = 'bg-sky-950/80 text-sky-300 border-sky-700/60 font-medium';
        break;
      case 'READ':
        styles = 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60 font-semibold';
        break;
      case 'FAILED':
      case 'BLOCKED':
      case 'LOST':
      case 'CANCELLED':
        styles = 'bg-rose-950/90 text-rose-400 border-rose-800/70 font-semibold';
        break;
      case 'PAUSED':
      case 'PENDING':
      case 'NOT_CONTACTED':
      case 'NOT_STARTED':
      case 'PLANNED':
      case 'TODO':
      case 'PROSPECT':
        styles = 'bg-slate-800/90 text-slate-400 border-slate-700';
        break;
      default:
        styles = 'bg-slate-800 text-slate-300 border-slate-700';
    }
  }

  const label = s.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs border tracking-wide uppercase ${styles} ${className}`}
    >
      {type === 'evidence' && s === 'ASSUMPTION' && (
        <span className="mr-1 text-amber-400">⚠️</span>
      )}
      {label}
    </span>
  );
}
