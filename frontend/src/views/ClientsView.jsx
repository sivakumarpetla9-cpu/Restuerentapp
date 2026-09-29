import React, { useState, useEffect } from 'react';
import { Building2, ChevronRight, User, DollarSign, Calendar, ExternalLink } from 'lucide-react';
import { fetchClients } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export function ClientsView({ onSelectClient }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClients()
      .then(data => setClients(data.clients || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Converted Client Accounts</h2>
          <p className="text-xs text-slate-400">
            Active and historical customer contracts converted from qualified sales leads
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading client records...</div>
        ) : clients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Primary Contact</th>
                  <th className="px-4 py-3">Contracted Service</th>
                  <th className="px-4 py-3">Account Status</th>
                  <th className="px-4 py-3">Monthly Value</th>
                  <th className="px-4 py-3">Converted Date</th>
                  <th className="px-4 py-3 text-right">360° Workspace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => onSelectClient(c.id)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-100">
                      <div>{c.companyName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">ID: {c.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{c.primaryContact?.name || 'Not provided'}</div>
                      {c.primaryContact?.email && (
                        <div className="text-[10px] text-slate-500">{c.primaryContact.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {c.service || 'RESEARCH REQUIRED'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status || 'ACTIVE'} />
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {c.monthlyValue ? `$${c.monthlyValue}/mo` : 'NOT SET'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'NOT SET'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectClient(c.id);
                        }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1"
                      >
                        View 360° <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No converted clients yet"
            description="Clients are converted from won sales leads in the CRM layer."
            cliSuggestion='node index.js "convert <company> to client"'
            icon={Building2}
          />
        )}
      </div>
    </div>
  );
}
