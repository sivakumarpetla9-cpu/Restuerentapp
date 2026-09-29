import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  UserPlus,
  Shield,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Search,
  RefreshCw
} from 'lucide-react';
import { fetchUsers, createUser, updateUser, fetchAuditLogs } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export function UsersView() {
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'audit'
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // User modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('SALES');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [usersRes, auditRes] = await Promise.all([
        fetchUsers().catch(err => {
          throw new Error('Access denied: User management requires ADMIN role.');
        }),
        fetchAuditLogs().catch(() => ({ auditLogs: [] }))
      ]);

      setUsers(usersRes.users || []);
      setAuditLogs(auditRes.auditLogs || []);
    } catch (err) {
      setError(err.message || 'Failed to load user administration');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    if (!name || !email || !password) {
      setModalError('Please fill in all required fields.');
      return;
    }

    try {
      setSubmitting(true);
      setModalError(null);
      await createUser({ name, email, password, role });
      await loadData();
      setIsModalOpen(false);
      setName('');
      setEmail('');
      setPassword('');
      setRole('SALES');
    } catch (err) {
      setModalError(err.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(user) {
    const newStatus = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await updateUser(user.id, { status: newStatus });
      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, status: newStatus } : u)));
    } catch (err) {
      alert(err.message || 'Failed to update user status');
    }
  }

  async function handleChangeRole(user, newRole) {
    if (user.role === newRole) return;
    try {
      await updateUser(user.id, { role: newRole });
      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, role: newRole } : u)));
    } catch (err) {
      alert(err.message || 'Failed to update user role');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading user administration...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 text-center space-y-3">
        <AlertTriangle className="mx-auto text-amber-400" size={32} />
        <h2 className="text-base font-bold text-slate-100">Restricted Administration</h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <Shield className="text-indigo-400" size={26} />
            Users & Security Administration
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage system access, roles, and audit security events across your local OS.
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
            <UserPlus size={16} />
            New User
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'users'
              ? 'bg-slate-800 text-slate-100 border border-slate-700 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users size={14} />
          System Users ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'audit'
              ? 'bg-slate-800 text-slate-100 border border-slate-700 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity size={14} />
          Security Audit Logs ({auditLogs.length})
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <th className="pb-3 px-2">User</th>
                  <th className="pb-3 px-2">Role</th>
                  <th className="pb-3 px-2">Status</th>
                  <th className="pb-3 px-2">Last Login</th>
                  <th className="pb-3 px-2">Created</th>
                  <th className="pb-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-850/50">
                    <td className="py-3 px-2">
                      <div className="font-semibold text-slate-200">{u.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                    </td>

                    <td className="py-3 px-2">
                      <select
                        value={u.role}
                        onChange={e => handleChangeRole(u, e.target.value)}
                        className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden"
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="SALES">SALES</option>
                        <option value="DELIVERY">DELIVERY</option>
                        <option value="VIEWER">VIEWER</option>
                      </select>
                    </td>

                    <td className="py-3 px-2">
                      <StatusBadge status={u.status} />
                    </td>

                    <td className="py-3 px-2 text-[11px] text-slate-400">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                    </td>

                    <td className="py-3 px-2 text-[11px] text-slate-500 font-mono">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>

                    <td className="py-3 px-2 text-right">
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          u.status === 'ACTIVE'
                            ? 'bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60'
                            : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60'
                        }`}
                      >
                        {u.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
          <p className="text-xs text-slate-400">
            Recorded security events in <code className="font-mono text-slate-300">data/security_audit.json</code> (Zero credentials or tokens stored).
          </p>

          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No security audit logs recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {auditLogs.map(log => (
                <div key={log.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-200">
                        {log.type}
                      </span>
                      {log.email && (
                        <span className="text-[11px] text-slate-400">
                          ({log.email})
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500 font-mono">IP: {log.ip}</span>
                    </div>

                    {log.details && Object.keys(log.details).length > 0 && (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {JSON.stringify(log.details)}
                      </p>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <UserPlus size={18} className="text-indigo-400" />
                Create New User
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

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jane@company.com"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Password (min 8 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="SALES">SALES (Leads, Outreach, Pipeline)</option>
                  <option value="DELIVERY">DELIVERY (Projects, Onboarding, Tasks)</option>
                  <option value="VIEWER">VIEWER (Read-only access)</option>
                  <option value="ADMIN">ADMIN (Full system access)</option>
                </select>
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
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
