import React, { useState, useEffect } from 'react';
import { Bot, Shield, CheckCircle2, Cpu, Sparkles } from 'lucide-react';
import { fetchAgents } from '../api';

export function AgentsView() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAgents()
      .then(data => setAgents(data.agents || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const getCategoryBadge = (cat) => {
    switch (cat?.toLowerCase()) {
      case 'sales': return 'bg-purple-950/80 text-purple-400 border-purple-800/60';
      case 'product': return 'bg-indigo-950/80 text-indigo-400 border-indigo-800/60';
      case 'finance': return 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60';
      case 'research': return 'bg-sky-950/80 text-sky-400 border-sky-800/60';
      case 'business': return 'bg-blue-950/80 text-blue-400 border-blue-800/60';
      default: return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-950/30 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              9 Active Agents Initialized
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-100">Autonomous Commercial Intelligence Registry</h2>
          <p className="text-xs text-slate-400 max-w-2xl mt-1">
            Each agent performs a specialized business function backed by local Ollama (<code className="text-indigo-300">qwen3:8b</code>) with evidence verification guardrails.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 shrink-0 text-xs text-slate-300">
          <Shield size={14} className="text-emerald-400" />
          <span>Local-First (₹0 API Cost)</span>
        </div>
      </div>

      {/* Agents Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading active agent registry...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-indigo-400">
                    <Bot size={20} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${getCategoryBadge(agent.category)}`}>
                      {agent.category}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      {agent.status}
                    </span>
                  </div>
                </div>

                <h3 className="text-sm font-bold text-slate-100 mb-1">{agent.name}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{agent.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>ID: {agent.id}</span>
                <span className="flex items-center gap-1 text-slate-400">
                  <Cpu size={12} className="text-indigo-400" /> Ollama qwen3:8b
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
