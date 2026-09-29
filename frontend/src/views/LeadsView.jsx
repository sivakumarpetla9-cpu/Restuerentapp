import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  ArrowUpDown,
  ExternalLink,
  ChevronRight,
  X,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  CheckCircle,
  Clock,
  Activity
} from 'lucide-react';
import { fetchLeads, fetchLeadDetail } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export function LeadsView({ onSelectLead }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [qualificationFilter, setQualificationFilter] = useState('ALL');
  const [pipelineFilter, setPipelineFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('companyName');
  const [sortOrder, setSortOrder] = useState('asc');

  // Detail Modal state
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchLeads()
      .then(data => setLeads(data.leads || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const openLeadDetail = async (id) => {
    setSelectedLeadId(id);
    setDetailLoading(true);
    try {
      const data = await fetchLeadDetail(id);
      setDetailData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedLeadId(null);
    setDetailData(null);
  };

  // Filter & Sort
  const filteredLeads = leads
    .filter(lead => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        lead.companyName?.toLowerCase().includes(q) ||
        lead.contactName?.toLowerCase().includes(q) ||
        lead.industry?.toLowerCase().includes(q) ||
        lead.location?.toLowerCase().includes(q);

      const matchQual =
        qualificationFilter === 'ALL' ||
        lead.qualificationStatus === qualificationFilter;

      const matchPipe =
        pipelineFilter === 'ALL' ||
        lead.pipelineStatus === pipelineFilter;

      return matchSearch && matchQual && matchPipe;
    })
    .sort((a, b) => {
      const valA = (a[sortBy] || '').toString().toLowerCase();
      const valB = (b[sortBy] || '').toString().toLowerCase();
      return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by company, contact, city..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Filter size={13} />
            <span>Qual:</span>
            <select
              value={qualificationFilter}
              onChange={(e) => setQualificationFilter(e.target.value)}
              className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden"
            >
              <option value="ALL">All Tiers</option>
              <option value="QUALIFIED">QUALIFIED</option>
              <option value="POSSIBLE_FIT">POSSIBLE_FIT</option>
              <option value="NEEDS_RESEARCH">NEEDS_RESEARCH</option>
              <option value="UNQUALIFIED">UNQUALIFIED</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Pipeline:</span>
            <select
              value={pipelineFilter}
              onChange={(e) => setPipelineFilter(e.target.value)}
              className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden"
            >
              <option value="ALL">All Stages</option>
              <option value="NOT_CONTACTED">NOT_CONTACTED</option>
              <option value="CONTACTED">CONTACTED</option>
              <option value="INTERESTED">INTERESTED</option>
              <option value="PROPOSAL_SENT">PROPOSAL_SENT</option>
              <option value="WON">WON</option>
              <option value="LOST">LOST</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading stored leads...</div>
        ) : filteredLeads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th onClick={() => toggleSort('companyName')} className="px-4 py-3 cursor-pointer hover:text-slate-200">
                    <div className="flex items-center gap-1">Company <ArrowUpDown size={12} /></div>
                  </th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Industry</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Qualification</th>
                  <th className="px-4 py-3">Pipeline Stage</th>
                  <th className="px-4 py-3">Website</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => openLeadDetail(lead.id)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-100">
                      {lead.companyName}
                    </td>
                    <td className="px-4 py-3">
                      <div>{lead.contactName || 'Not provided'}</div>
                      {lead.contactRole && lead.contactRole !== 'RESEARCH REQUIRED' && (
                        <div className="text-[10px] text-slate-500">{lead.contactRole}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{lead.industry || 'General'}</td>
                    <td className="px-4 py-3 text-slate-400">{lead.location || 'Not provided'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.qualificationStatus || 'NEEDS_RESEARCH'} type="qualification" />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.pipelineStatus || 'NOT_CONTACTED'} />
                    </td>
                    <td className="px-4 py-3">
                      {lead.website && lead.website !== 'RESEARCH REQUIRED' ? (
                        <a
                          href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 truncate max-w-[140px]"
                        >
                          {lead.website.replace(/^https?:\/\//i, '')} <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Not provided</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openLeadDetail(lead.id);
                        }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-0.5"
                      >
                        Inspect <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No leads matching criteria"
            description="No leads currently match your search or filter options in data/leads.json."
            cliSuggestion='node index.js "find potential customers"'
            icon={Users}
          />
        )}
      </div>

      {/* Lead Detail Modal / Drawer */}
      {selectedLeadId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative">
            <button
              onClick={closeDetail}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              <X size={18} />
            </button>

            {detailLoading || !detailData ? (
              <div className="p-12 text-center text-xs text-slate-400">Loading lead profile...</div>
            ) : (
              <div className="space-y-6">
                {/* Header */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-slate-500">ID: {detailData.lead.id}</span>
                    <StatusBadge status={detailData.lead.evidence || 'USER-PROVIDED'} type="evidence" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-100">{detailData.lead.companyName}</h3>
                </div>

                {/* Primary Info Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Contact Details</h4>
                    <div className="text-xs text-slate-200 font-medium">{detailData.lead.contactName || 'Not provided'}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Mail size={13} className="text-slate-500" />
                      <span>{detailData.lead.email || 'Not provided'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Phone size={13} className="text-slate-500" />
                      <span>{detailData.lead.phone || 'Not provided'}</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Business Profile</h4>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Briefcase size={13} className="text-slate-500" />
                      <span>{detailData.lead.industry || 'Not provided'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <MapPin size={13} className="text-slate-500" />
                      <span>{detailData.lead.location || 'Not provided'}</span>
                    </div>
                    {detailData.lead.website && (
                      <div className="flex items-center gap-2 text-xs text-indigo-400">
                        <ExternalLink size={13} />
                        <a href={detailData.lead.website} target="_blank" rel="noreferrer" className="truncate hover:underline">
                          {detailData.lead.website}
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Qualification Section */}
                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-200">Qualification & Rubric</h4>
                    <StatusBadge status={detailData.lead.qualificationStatus || 'NEEDS_RESEARCH'} type="qualification" />
                  </div>
                  {detailData.lead.fitScore !== undefined && (
                    <div className="text-xs text-slate-400">
                      Rubric Fit Score: <span className="font-bold text-slate-200 font-mono">{detailData.lead.fitScore}/100</span>
                    </div>
                  )}
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {detailData.lead.qualificationNotes || detailData.lead.potentialNeed || 'No explicit qualification rationale recorded.'}
                  </p>
                </div>

                {/* Sales Pipeline Stage */}
                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-200">Pipeline State</h4>
                    <StatusBadge status={detailData.lead.pipelineStatus || 'NOT_CONTACTED'} />
                  </div>
                  <div className="text-xs text-slate-400">
                    Next Recommended Action: <span className="text-slate-200 font-medium">{detailData.lead.pipeline?.nextAction || 'None scheduled'}</span>
                  </div>
                </div>

                {/* Associated Activities */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
                    <Activity size={14} className="text-indigo-400" />
                    <span>Lead Activity History ({detailData.activities.length})</span>
                  </h4>
                  {detailData.activities.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {detailData.activities.map((a) => (
                        <div key={a.id} className="p-2.5 rounded bg-slate-950/80 border border-slate-800/80 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <StatusBadge status={a.type} />
                            <span className="text-[10px] text-slate-500 font-mono">
                              {new Date(a.occurredAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-slate-300 text-xs">{a.description}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No specific activities logged for this lead.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
