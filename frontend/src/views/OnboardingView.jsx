import React, { useState, useEffect } from 'react';
import { UserCheck, CheckCircle2, Clock, ArrowRight, Building2 } from 'lucide-react';
import { fetchOnboarding } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

const STAGES = [
  'NOT_STARTED',
  'WELCOME',
  'REQUIREMENTS_COLLECTION',
  'REQUIREMENTS_CONFIRMED',
  'PROJECT_SETUP',
  'ONBOARDING_COMPLETED'
];

export function OnboardingView({ onSelectClient }) {
  const [onboardings, setOnboardings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOnboarding()
      .then(data => setOnboardings(data.onboardings || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const getStageIndex = (stage) => STAGES.indexOf(stage);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-200">Client Onboarding Lifecycles</h2>
        <p className="text-xs text-slate-400">
          6-stage progressive onboarding workflow ensuring verified requirements before project execution
        </p>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading onboarding workflows...</div>
      ) : onboardings.length > 0 ? (
        <div className="space-y-6">
          {onboardings.map((onb) => {
            const currentIdx = getStageIndex(onb.status);
            return (
              <div
                key={onb.id}
                className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-5"
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                      <UserCheck size={20} />
                    </div>
                    <div>
                      <h3
                        onClick={() => onSelectClient && onSelectClient(onb.clientId)}
                        className="text-base font-bold text-slate-100 hover:text-indigo-300 cursor-pointer transition-colors"
                      >
                        {onb.clientName}
                      </h3>
                      <p className="text-xs text-slate-400">Project: {onb.projectName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge status={onb.status} />
                  </div>
                </div>

                {/* 6-Stage Stepper Progress Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {STAGES.map((st, idx) => {
                    const isPassed = currentIdx > idx;
                    const isCurrent = currentIdx === idx;
                    return (
                      <div
                        key={st}
                        className={`p-2.5 rounded-lg border text-center transition-all ${
                          isCurrent
                            ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-xs'
                            : isPassed
                            ? 'bg-slate-950/80 border-emerald-800/40 text-emerald-400/80'
                            : 'bg-slate-950/40 border-slate-800/60 text-slate-500'
                        }`}
                      >
                        <div className="text-[10px] font-mono font-bold mb-1">
                          {idx + 1}. {isPassed ? '✓' : ''}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider font-semibold leading-tight">
                          {st.replace(/_/g, ' ')}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Checklist Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80 text-xs">
                  {/* Pending Items */}
                  <div className="space-y-2">
                    <span className="font-semibold text-slate-200 block">Pending Checklist Items:</span>
                    {onb.pendingItems?.length > 0 ? (
                      <ul className="space-y-1.5">
                        {onb.pendingItems.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-slate-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500 italic">No pending items remaining.</p>
                    )}
                  </div>

                  {/* Completed Items */}
                  <div className="space-y-2">
                    <span className="font-semibold text-slate-200 block">Explicitly Completed Items:</span>
                    {onb.completedItems?.length > 0 ? (
                      <ul className="space-y-1.5">
                        {onb.completedItems.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-emerald-400">
                            <span className="text-xs shrink-0 mt-0.5">✓</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500 italic">No completed items recorded yet.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No onboarding workflows active"
          description="Onboarding workflows are created automatically when projects are initiated for clients."
          cliSuggestion='node index.js "create project for <client>"'
          icon={UserCheck}
        />
      )}
    </div>
  );
}
