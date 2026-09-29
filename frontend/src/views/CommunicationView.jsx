import React, { useState, useEffect } from 'react';
import {
  Mail,
  MessageSquare,
  CheckCircle2,
  Copy,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Send,
  Eye,
  Trash2,
  ExternalLink,
  BookOpen,
  SendHorizontal,
  Activity,
  Reply,
  CheckCheck,
  Radio,
  XCircle,
  PlayCircle,
  ArrowRight,
  CornerDownRight,
  Server
} from 'lucide-react';
import {
  fetchMessages,
  fetchTemplates,
  fetchLeads,
  fetchClients,
  fetchProjects,
  createDraft,
  approveMessage,
  copyMessage,
  updateMessageStatus,
  sendCommunicationMessage,
  simulateCommunicationEvent,
  fetchCommunicationEvents,
  fetchMessageStatus
} from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export function CommunicationView() {
  const [messages, setMessages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState('messages'); // 'messages' | 'templates' | 'events'
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [providerFilter, setProviderFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected message for preview drawer
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [selectedMessageStatus, setSelectedMessageStatus] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(null);

  // Gateway actions & simulations
  const [isSending, setIsSending] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyInput, setReplyInput] = useState('');

  // New Draft Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftTargetType, setDraftTargetType] = useState('LEAD'); // 'LEAD' | 'CLIENT' | 'PROJECT'
  const [draftTargetId, setDraftTargetId] = useState('');
  const [draftChannel, setDraftChannel] = useState('EMAIL');
  const [draftProvider, setDraftProvider] = useState('');
  const [draftPurpose, setDraftPurpose] = useState('INITIAL_OUTREACH');
  const [draftCustomNote, setDraftCustomNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [msgRes, tmplRes, leadsRes, clientsRes, projRes, eventsRes] = await Promise.all([
        fetchMessages(),
        fetchTemplates(),
        fetchLeads().catch(() => ({ leads: [] })),
        fetchClients().catch(() => ({ clients: [] })),
        fetchProjects().catch(() => ({ projects: [] })),
        fetchCommunicationEvents().catch(() => ({ events: [] }))
      ]);

      setMessages(msgRes.messages || []);
      setTemplates(tmplRes.templates || []);
      setLeads(leadsRes.leads || []);
      setClients(clientsRes.clients || []);
      setProjects(projRes.projects || []);
      setEvents(eventsRes.events || []);

      if (msgRes.messages && msgRes.messages.length > 0 && !selectedMessage) {
        setSelectedMessage(msgRes.messages[0]);
      }
    } catch (err) {
      console.error('Error loading communication data:', err);
      setError(err.message || 'Failed to load communication workspace');
    } finally {
      setLoading(false);
    }
  }

  // Load detailed message status & timeline when selected
  useEffect(() => {
    if (selectedMessage) {
      fetchMessageStatus(selectedMessage.id)
        .then(res => setSelectedMessageStatus(res))
        .catch(() => setSelectedMessageStatus(null));
    }
  }, [selectedMessage?.id, selectedMessage?.status]);

  async function handleApprove(id) {
    try {
      const res = await approveMessage(id);
      if (res.success) {
        setMessages(prev => prev.map(m => (m.id === id ? res.message : m)));
        if (selectedMessage && selectedMessage.id === id) {
          setSelectedMessage(res.message);
        }
      }
    } catch (err) {
      alert(err.message || 'Failed to approve message');
    }
  }

  async function handleSendGateway(id) {
    try {
      setIsSending(true);
      const res = await sendCommunicationMessage(id);
      if (res.success && res.message) {
        setMessages(prev => prev.map(m => (m.id === id ? res.message : m)));
        setSelectedMessage(res.message);
        const evtRes = await fetchCommunicationEvents().catch(() => ({ events: [] }));
        setEvents(evtRes.events || []);
      }
    } catch (err) {
      alert(err.message || 'Failed to send message via gateway');
    } finally {
      setIsSending(false);
    }
  }

  async function handleSimulateEvent(type, extra = {}) {
    if (!selectedMessage) return;
    try {
      setIsSimulating(true);
      const res = await simulateCommunicationEvent({
        messageId: selectedMessage.id,
        type,
        ...extra
      });
      if (res.success && res.message) {
        setMessages(prev => prev.map(m => (m.id === selectedMessage.id ? res.message : m)));
        setSelectedMessage(res.message);
        setShowReplyBox(false);
        setReplyInput('');
        const evtRes = await fetchCommunicationEvents().catch(() => ({ events: [] }));
        setEvents(evtRes.events || []);
      }
    } catch (err) {
      alert(err.message || `Failed to simulate ${type}`);
    } finally {
      setIsSimulating(false);
    }
  }

  async function handleCopy(message) {
    try {
      const textToCopy = message.subject
        ? `Subject: ${message.subject}\n\n${message.body}`
        : message.body;

      await navigator.clipboard.writeText(textToCopy);

      const res = await copyMessage(message.id);
      if (res.success) {
        setMessages(prev => prev.map(m => (m.id === message.id ? res.message : m)));
        if (selectedMessage && selectedMessage.id === message.id) {
          setSelectedMessage(res.message);
        }
      }

      setCopyFeedback(message.id);
      setTimeout(() => setCopyFeedback(null), 2500);
    } catch (err) {
      console.error('Copy failed:', err);
      alert('Copied or status update failed: ' + err.message);
    }
  }

  async function handleCreateDraft(e) {
    e.preventDefault();
    if (!draftTargetId) {
      setModalError('Please select a target.');
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError(null);

      const payload = {
        channel: draftChannel,
        purpose: draftPurpose,
        options: {
          customMessage: draftCustomNote,
          ...(draftProvider ? { provider: draftProvider } : {})
        }
      };

      if (draftTargetType === 'LEAD') payload.leadId = draftTargetId;
      if (draftTargetType === 'CLIENT') payload.clientId = draftTargetId;
      if (draftTargetType === 'PROJECT') payload.projectId = draftTargetId;

      const res = await createDraft(payload);
      if (res.success) {
        await loadData();
        setSelectedMessage(res.message);
        setIsModalOpen(false);
        setDraftCustomNote('');
        setDraftProvider('');
      }
    } catch (err) {
      setModalError(err.message || 'Failed to create draft');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Filter messages
  const filteredMessages = messages.filter(m => {
    if (channelFilter !== 'ALL' && m.channel !== channelFilter) return false;
    if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
    if (providerFilter !== 'ALL' && (m.provider || 'local') !== providerFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRecipient = m.recipientName && m.recipientName.toLowerCase().includes(q);
      const matchSubject = m.subject && m.subject.toLowerCase().includes(q);
      const matchBody = m.body && m.body.toLowerCase().includes(q);
      const matchPurpose = m.purpose && m.purpose.toLowerCase().includes(q);
      const matchProvider = m.provider && m.provider.toLowerCase().includes(q);
      return matchRecipient || matchSubject || matchBody || matchPurpose || matchProvider;
    }
    return true;
  });

  const readyCount = messages.filter(m => m.status === 'READY_FOR_REVIEW').length;
  const approvedCount = messages.filter(m => m.status === 'APPROVED').length;
  const dispatchedCount = messages.filter(m => ['SENT', 'DELIVERED', 'READ', 'REPLIED'].includes(m.status)).length;
  const repliedCount = messages.filter(m => m.status === 'REPLIED' || (m.inboundReplies && m.inboundReplies.length > 0)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading communication workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <Mail className="text-indigo-400" size={26} />
            Communication Gateway
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Provider-independent communication lifecycle with ₹0 local simulation & Brevo real email adapter.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setModalError(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors shadow-xs shadow-indigo-600/30"
          >
            <Plus size={16} />
            Prepare Draft
          </button>
        </div>
      </div>

      {/* Level 3 Gateway Banner */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-indigo-900/40 flex items-start gap-3.5 backdrop-blur-xs">
        <ShieldCheck className="text-indigo-400 shrink-0 mt-0.5" size={20} />
        <div className="text-xs text-slate-300 space-y-1">
          <p className="font-semibold text-slate-100 flex items-center gap-2 flex-wrap">
            <span>Level 3 Communication Gateway</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">
              ₹0 Cost Rule Active
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-mono">
              Brevo Real Email Ready (Free 300/day)
            </span>
          </p>
          <p className="text-slate-400 leading-relaxed">
            AI prepares draft &rarr; User reviews & approves &rarr; Gateway dispatches via configured provider (Local Simulator or Brevo Transactional Email) &rarr; Webhooks track delivery, read receipts, and replies with full idempotency. Real provider responses and message identifiers are preserved without fabrication.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
          <p className="text-xs text-slate-400">Total Messages</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{messages.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">Stored in data/messages.json</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-sky-900/30">
          <p className="text-xs text-sky-400 font-medium">Ready For Review</p>
          <p className="text-2xl font-bold text-sky-300 mt-1">{readyCount}</p>
          <p className="text-[11px] text-slate-500 mt-1">Awaiting your approval</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-indigo-900/30">
          <p className="text-xs text-indigo-400 font-medium">Dispatched / Sent</p>
          <p className="text-2xl font-bold text-indigo-300 mt-1">{dispatchedCount}</p>
          <p className="text-[11px] text-slate-500 mt-1">Brevo or Local Simulator</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-emerald-900/30">
          <p className="text-xs text-emerald-400 font-medium">Replies Received</p>
          <p className="text-2xl font-bold text-emerald-300 mt-1">{repliedCount}</p>
          <p className="text-[11px] text-slate-500 mt-1">Grounding evidence preserved</p>
        </div>
      </div>

      {/* Workspace Tabs: Messages vs Templates vs Events */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('messages')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'messages'
              ? 'bg-slate-800 text-slate-100 border border-slate-700 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Mail size={14} />
          Messages ({messages.length})
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'templates'
              ? 'bg-slate-800 text-slate-100 border border-slate-700 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen size={14} />
          Templates Library ({templates.length})
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'events'
              ? 'bg-slate-800 text-slate-100 border border-slate-700 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity size={14} />
          Events Log ({events.length})
        </button>
      </div>

      {activeTab === 'messages' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Channel Filters */}
              <div className="flex items-center bg-slate-900 rounded-lg p-1 border border-slate-800 text-xs">
                {['ALL', 'EMAIL', 'WHATSAPP', 'SMS'].map(ch => (
                  <button
                    key={ch}
                    onClick={() => setChannelFilter(ch)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      channelFilter === ch
                        ? 'bg-slate-800 text-slate-100 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {ch === 'ALL' ? 'All Channels' : ch}
                  </button>
                ))}
              </div>

              {/* Status Filters */}
              <div className="flex items-center bg-slate-900 rounded-lg p-1 border border-slate-800 text-xs flex-wrap">
                {['ALL', 'READY_FOR_REVIEW', 'APPROVED', 'SENT', 'DELIVERED', 'READ', 'REPLIED', 'FAILED', 'COPIED'].map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      statusFilter === st
                        ? 'bg-slate-800 text-slate-100 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st === 'ALL'
                      ? 'All Statuses'
                      : st.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>

              {/* Provider Filters */}
              <div className="flex items-center bg-slate-900 rounded-lg p-1 border border-slate-800 text-xs">
                {[
                  { id: 'ALL', label: 'All Providers' },
                  { id: 'local', label: 'Simulator' },
                  { id: 'brevo', label: 'Brevo' }
                ].map(pr => (
                  <button
                    key={pr.id}
                    onClick={() => setProviderFilter(pr.id)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      providerFilter === pr.id
                        ? 'bg-slate-800 text-slate-100 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {pr.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[240px]">
              <Search className="absolute left-3 top-2.5 text-slate-500" size={15} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Messages Split View */}
          {filteredMessages.length === 0 ? (
            <EmptyState
              title="No messages found"
              description="No communication drafts match your current filter criteria."
              icon={Mail}
              action={
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
                >
                  Create First Draft
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Messages List Column */}
              <div className="lg:col-span-5 space-y-2.5 max-h-[750px] overflow-y-auto pr-1">
                {filteredMessages.map(m => {
                  const isSelected = selectedMessage && selectedMessage.id === m.id;
                  const isCopied = copyFeedback === m.id;

                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedMessage(m)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-800/90 border-indigo-500/70 shadow-xs shadow-indigo-500/10'
                          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusBadge status={m.channel} />
                          <StatusBadge status={m.status} />
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                            m.provider === 'brevo'
                              ? 'bg-blue-950/70 text-blue-300 border border-blue-800/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {m.provider === 'brevo' ? 'Brevo' : 'Simulator'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(m.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="mt-2.5">
                        <p className="text-xs font-semibold text-slate-200 truncate">
                          {m.recipientName}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {m.subject || m.purpose.replace(/_/g, ' ')}
                        </p>
                      </div>

                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {m.body.replace('[AI DRAFT — USER REVIEW REQUIRED]', '').trim()}
                      </p>

                      <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 capitalize">
                          {m.purpose.replace(/_/g, ' ').toLowerCase()}
                        </span>

                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleCopy(m)}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                              isCopied
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                            }`}
                          >
                            <Copy size={11} />
                            {isCopied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Message Detailed View Column */}
              <div className="lg:col-span-7 sticky top-4">
                {selectedMessage ? (
                  <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-5">
                    {/* Header info */}
                    <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <StatusBadge status={selectedMessage.channel} />
                          <StatusBadge status={selectedMessage.status} />
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                            selectedMessage.provider === 'brevo'
                              ? 'bg-blue-950/80 text-blue-300 border border-blue-700/50'
                              : 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/40'
                          }`}>
                            {selectedMessage.provider === 'brevo' ? 'Brevo (Real Email)' : (selectedMessage.provider || 'local (simulator)')}
                          </span>
                        </div>
                        <h2 className="text-base font-bold text-slate-100">
                          {selectedMessage.recipientName}
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Address: <span className="font-mono text-slate-300">{selectedMessage.recipientAddress}</span>
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {/* Approve button if draft */}
                        {selectedMessage.status === 'READY_FOR_REVIEW' && (
                          <button
                            onClick={() => handleApprove(selectedMessage.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors"
                          >
                            <CheckCircle2 size={14} />
                            Approve
                          </button>
                        )}

                        {/* Send via Gateway button */}
                        {selectedMessage.status === 'APPROVED' && (
                          <button
                            onClick={() => handleSendGateway(selectedMessage.id)}
                            disabled={isSending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shadow-xs shadow-indigo-600/30 disabled:opacity-50"
                          >
                            <SendHorizontal size={14} />
                            {isSending ? 'Sending...' : (selectedMessage.provider === 'brevo' ? 'Send via Brevo' : 'Send (Gateway)')}
                          </button>
                        )}

                        {/* Manual Copy Button */}
                        <button
                          onClick={() => handleCopy(selectedMessage)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            copyFeedback === selectedMessage.id
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          }`}
                        >
                          <Copy size={14} />
                          {copyFeedback === selectedMessage.id ? 'Copied!' : 'Copy Text'}
                        </button>
                      </div>
                    </div>

                    {/* Brevo Real Email Status Card (if sent via Brevo) */}
                    {selectedMessage.provider === 'brevo' && ['SENT', 'DELIVERED', 'READ', 'FAILED', 'REPLIED'].includes(selectedMessage.status) && (
                      <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-900/40 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
                            <Mail size={14} className="text-blue-400" />
                            Brevo Real Email Dispatch
                          </span>
                          <span className="text-[10px] font-mono text-blue-400">
                            Status: {selectedMessage.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          This email was dispatched through the Brevo Transactional Email API v3. Delivery, open tracking, and bounce notifications are received automatically via Brevo webhooks (<code className="font-mono text-slate-300">/api/communication/webhook/brevo</code>).
                        </p>
                      </div>
                    )}

                    {/* Level 3 Gateway Simulator Actions (Visible for Local Simulator messages) */}
                    {['APPROVED', 'SENT', 'DELIVERED', 'READ', 'REPLIED', 'FAILED'].includes(selectedMessage.status) && selectedMessage.provider !== 'brevo' && (
                      <div className="p-3.5 rounded-xl bg-slate-950/70 border border-indigo-950/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                            <PlayCircle size={14} className="text-indigo-400" />
                            Gateway Simulator Controls
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            Provider: {selectedMessage.provider || 'local'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {selectedMessage.status === 'SENT' && (
                            <button
                              onClick={() => handleSimulateEvent('DELIVERED')}
                              disabled={isSimulating}
                              className="px-2.5 py-1 rounded-md bg-sky-950/80 border border-sky-800/60 text-sky-300 hover:bg-sky-900/80 text-xs font-medium flex items-center gap-1 transition-colors"
                            >
                              <CheckCircle2 size={12} />
                              Simulate Delivered
                            </button>
                          )}

                          {['SENT', 'DELIVERED'].includes(selectedMessage.status) && (
                            <button
                              onClick={() => handleSimulateEvent('READ')}
                              disabled={isSimulating}
                              className="px-2.5 py-1 rounded-md bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/80 text-xs font-medium flex items-center gap-1 transition-colors"
                            >
                              <CheckCheck size={12} />
                              Simulate Read
                            </button>
                          )}

                          {['SENT', 'DELIVERED', 'READ'].includes(selectedMessage.status) && (
                            <button
                              onClick={() => setShowReplyBox(!showReplyBox)}
                              className="px-2.5 py-1 rounded-md bg-purple-950/80 border border-purple-800/60 text-purple-300 hover:bg-purple-900/80 text-xs font-medium flex items-center gap-1 transition-colors"
                            >
                              <Reply size={12} />
                              Simulate Customer Reply
                            </button>
                          )}

                          {['SEND_REQUESTED', 'SENT'].includes(selectedMessage.status) && (
                            <button
                              onClick={() => handleSimulateEvent('FAILED', { error: 'Simulated network timeout' })}
                              disabled={isSimulating}
                              className="px-2.5 py-1 rounded-md bg-rose-950/80 border border-rose-800/60 text-rose-300 hover:bg-rose-900/80 text-xs font-medium flex items-center gap-1 transition-colors"
                            >
                              <XCircle size={12} />
                              Simulate Failure
                            </button>
                          )}
                        </div>

                        {/* Customer Reply Input Box */}
                        {showReplyBox && (
                          <div className="p-3 rounded-lg bg-slate-900 border border-purple-900/40 space-y-2 mt-2">
                            <label className="text-[11px] font-medium text-purple-300 flex items-center gap-1">
                              <Reply size={12} />
                              Inbound Customer Reply Text (Evidence Preserved)
                            </label>
                            <textarea
                              rows={2}
                              value={replyInput}
                              onChange={e => setReplyInput(e.target.value)}
                              placeholder="e.g. Thanks for reaching out! Let's schedule a call this Thursday at 3 PM."
                              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-purple-500 placeholder-slate-600"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setShowReplyBox(false)}
                                className="px-3 py-1 rounded text-xs text-slate-400 hover:text-slate-200"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSimulateEvent('REPLIED', { replyText: replyInput })}
                                disabled={isSimulating || !replyInput.trim()}
                                className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                              >
                                Submit Reply Event
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Meta info tags */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-slate-950/50 border border-slate-800/60 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Purpose</span>
                        <span className="text-slate-300 font-medium">{selectedMessage.purpose.replace(/_/g, ' ')}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Channel</span>
                        <span className="text-slate-300 font-medium">{selectedMessage.channel}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Message ID</span>
                        <span className="text-slate-400 font-mono text-[11px] truncate block">{selectedMessage.id}</span>
                      </div>
                      {selectedMessage.providerMessageId && (
                        <div className="col-span-2">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
                            {selectedMessage.provider === 'brevo' ? 'Brevo Message-ID' : 'Provider Ref'}
                          </span>
                          <span className="text-slate-300 font-mono text-[11px] truncate block select-all">
                            {selectedMessage.providerMessageId}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Email Subject */}
                    {selectedMessage.subject && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          Subject Line
                        </label>
                        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs font-medium text-slate-200 flex items-center justify-between">
                          <span>{selectedMessage.subject}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(selectedMessage.subject);
                              setCopyFeedback('subject');
                              setTimeout(() => setCopyFeedback(null), 1500);
                            }}
                            className="text-slate-400 hover:text-slate-200 text-[11px] flex items-center gap-1"
                          >
                            <Copy size={12} />
                            {copyFeedback === 'subject' ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Message Body */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Message Content
                      </label>
                      <div className="p-4 rounded-lg bg-slate-950/90 border border-slate-800 font-sans text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[380px] overflow-y-auto">
                        {selectedMessage.body}
                      </div>
                    </div>

                    {/* Inbound Replies list (if any) */}
                    {selectedMessage.inboundReplies && selectedMessage.inboundReplies.length > 0 && (
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                          <Reply size={13} />
                          Customer Inbound Replies ({selectedMessage.inboundReplies.length})
                        </label>
                        <div className="space-y-2">
                          {selectedMessage.inboundReplies.map((r, idx) => (
                            <div key={idx} className="p-3 rounded-lg bg-purple-950/20 border border-purple-900/30 text-xs space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-purple-300">
                                <span>{r.sender || r.from || selectedMessage.recipientAddress}</span>
                                <span>{r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : ''}</span>
                              </div>
                              <p className="text-slate-200 leading-relaxed font-sans">{r.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Lifecycle status timeline */}
                    <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] space-y-1.5">
                      <p className="font-semibold text-slate-300 flex items-center gap-1.5">
                        <Clock size={13} className="text-slate-400" />
                        Lifecycle Milestones:
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                        <div>
                          <span className="text-slate-500 block">Created</span>
                          <span className="text-slate-300">{new Date(selectedMessage.createdAt).toLocaleTimeString()}</span>
                        </div>
                        {selectedMessage.approvedAt && (
                          <div>
                            <span className="text-emerald-500 block">Approved</span>
                            <span className="text-slate-300">{new Date(selectedMessage.approvedAt).toLocaleTimeString()}</span>
                          </div>
                        )}
                        {selectedMessage.sentAt && (
                          <div>
                            <span className="text-indigo-400 block">Sent</span>
                            <span className="text-slate-300">{new Date(selectedMessage.sentAt).toLocaleTimeString()}</span>
                          </div>
                        )}
                        {selectedMessage.deliveredAt && (
                          <div>
                            <span className="text-sky-400 block">Delivered</span>
                            <span className="text-slate-300">{new Date(selectedMessage.deliveredAt).toLocaleTimeString()}</span>
                          </div>
                        )}
                        {selectedMessage.readAt && (
                          <div>
                            <span className="text-teal-400 block">Read</span>
                            <span className="text-slate-300">{new Date(selectedMessage.readAt).toLocaleTimeString()}</span>
                          </div>
                        )}
                        {selectedMessage.repliedAt && (
                          <div>
                            <span className="text-purple-400 block">Replied</span>
                            <span className="text-slate-300">{new Date(selectedMessage.repliedAt).toLocaleTimeString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center text-slate-500 rounded-xl bg-slate-900/40 border border-slate-800">
                    Select a message from the list to preview details.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Templates Library Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Standard grounding templates used to assemble outbound communications without inventing contact data or metrics.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => (
              <div key={t.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <StatusBadge status={t.channel} />
                    <span className="text-[10px] font-mono text-slate-500">{t.id}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-200">{t.name}</h3>
                  <p className="text-xs text-indigo-400 mt-0.5 font-medium">{t.purpose.replace(/_/g, ' ')}</p>

                  {t.subject && (
                    <div className="mt-2.5 p-2 rounded bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-300">
                      <span className="text-slate-500 block text-[10px] uppercase">Default Subject</span>
                      {t.subject}
                    </div>
                  )}

                  <div className="mt-2.5 p-2.5 rounded bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 whitespace-pre-wrap font-sans max-h-36 overflow-y-auto leading-relaxed">
                    {t.body}
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Variables: {'{{company}}'}, {'{{contact_name}}'}</span>
                  <button
                    onClick={() => {
                      setDraftChannel(t.channel);
                      setDraftPurpose(t.purpose);
                      setIsModalOpen(true);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
                  >
                    Use Template
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events Log Tab */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Audit log of all communication events recorded by the Level 3 Gateway and Webhook receiver (Local Simulator & Brevo).
            </p>
            <span className="text-xs font-mono text-indigo-400">
              data/communication_events.json ({events.length} events)
            </span>
          </div>

          {events.length === 0 ? (
            <EmptyState
              title="No events recorded"
              description="Dispatch messages via the Gateway or receive webhooks to generate lifecycle events."
              icon={Activity}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/40">
                    <th className="py-2.5 px-3">Event ID</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Provider</th>
                    <th className="py-2.5 px-3">Message Ref</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Payload / Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {events.slice().reverse().map((ev, i) => (
                    <tr key={ev.eventId || i} className="hover:bg-slate-850/50 transition-colors">
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-400">
                        {ev.eventId || 'evt_sim'}
                      </td>
                      <td className="py-2 px-3">
                        <StatusBadge status={ev.type} />
                      </td>
                      <td className="py-2 px-3 font-mono text-indigo-300 text-[11px]">
                        {ev.provider || 'local'}
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-400">
                        {ev.messageId || ev.providerMessageId || '-'}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-slate-400">
                        {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '-'}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-slate-400 max-w-xs truncate font-mono">
                        {ev.payload ? JSON.stringify(ev.payload) : ev.details ? (typeof ev.details === 'object' ? JSON.stringify(ev.details) : ev.details) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Prepare Draft Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Plus size={18} className="text-indigo-400" />
                Prepare Message Draft
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xs font-semibold"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-xs text-rose-300">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateDraft} className="space-y-4">
              {/* Target Type Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Target Entity</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'LEAD', label: 'Lead / Prospect' },
                    { id: 'CLIENT', label: 'Active Client' },
                    { id: 'PROJECT', label: 'Project' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setDraftTargetType(tab.id);
                        setDraftTargetId('');
                      }}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-colors ${
                        draftTargetType === tab.id
                          ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                          : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Selection Dropdown */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Select {draftTargetType === 'LEAD' ? 'Lead' : draftTargetType === 'CLIENT' ? 'Client' : 'Project'}
                </label>
                <select
                  value={draftTargetId}
                  onChange={e => setDraftTargetId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
                  required
                >
                  <option value="">-- Choose Target --</option>
                  {draftTargetType === 'LEAD' &&
                    leads.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.companyName} ({l.qualificationStatus || 'UNRATED'}) - {l.contactName || 'No Contact'}
                      </option>
                    ))}
                  {draftTargetType === 'CLIENT' &&
                    clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.companyName} ({c.status}) - {c.service}
                      </option>
                    ))}
                  {draftTargetType === 'PROJECT' &&
                    projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.projectName} ({p.status}) - {p.clientName || 'Client'}
                      </option>
                    ))}
                </select>
              </div>

              {/* Channel, Provider & Purpose */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Channel</label>
                  <select
                    value={draftChannel}
                    onChange={e => setDraftChannel(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value="EMAIL">Email</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="SMS">SMS</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Provider Adapter</label>
                  <select
                    value={draftProvider}
                    onChange={e => setDraftProvider(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value="">Default (From Environment)</option>
                    <option value="local">Local Simulator (₹0)</option>
                    {draftChannel === 'EMAIL' && (
                      <option value="brevo">Brevo Transactional Email (₹0)</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Purpose</label>
                <select
                  value={draftPurpose}
                  onChange={e => setDraftPurpose(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="INITIAL_OUTREACH">Initial Outreach</option>
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="DEMO_INVITATION">Demo Invitation</option>
                  <option value="PROPOSAL_FOLLOW_UP">Proposal Follow-up</option>
                  <option value="CLIENT_WELCOME">Client Welcome</option>
                  <option value="REQUIREMENT_REQUEST">Requirement Request</option>
                  <option value="PROJECT_UPDATE">Project Update</option>
                  <option value="MILESTONE_UPDATE">Milestone Update</option>
                  <option value="CLIENT_REVIEW">Client Review</option>
                  <option value="PROJECT_COMPLETED">Project Completed</option>
                  <option value="GENERAL">General Message</option>
                </select>
              </div>

              {/* Custom Note */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Custom Context / Value Proposition (Optional)
                </label>
                <textarea
                  rows={2}
                  value={draftCustomNote}
                  onChange={e => setDraftCustomNote(e.target.value)}
                  placeholder="e.g. Discuss table reservation AI bot implementation..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 placeholder-slate-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Generating...' : 'Prepare Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
