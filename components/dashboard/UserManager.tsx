'use client';

import { useState } from 'react';
import { UserPlus, Shield, User, Trash2, Mail, X, Check, AlertCircle, Loader2, Search } from 'lucide-react';

export interface DashboardUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'ANALYST' | 'VIEWER';
  status: string;
  image?: string | null;
  createdAt?: string | null;
}

export default function UserManager({ initialUsers }: { initialUsers: DashboardUser[] }) {
  const [users, setUsers] = useState<DashboardUser[]>(initialUsers);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<'ADMIN' | 'ANALYST' | 'VIEWER'>('ANALYST');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormRole('ANALYST');
    setErrorMessage('');
    setIsAddModalOpen(false);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmail.trim() || !formEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formEmail.trim(),
          name: formName.trim(),
          role: formRole
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to add user');
      }

      // If user was updated or added
      if (data.user) {
        setUsers(prev => {
          const exists = prev.some(u => u.id === data.user.id || u.email.toLowerCase() === data.user.email.toLowerCase());
          if (exists) {
            return prev.map(u => (u.id === data.user.id || u.email.toLowerCase() === data.user.email.toLowerCase()) ? data.user : u);
          }
          return [data.user, ...prev];
        });
      }

      setSuccessMessage(`User ${formEmail} has been authorized successfully.`);
      setTimeout(() => setSuccessMessage(''), 4000);
      resetForm();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error creating user');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'ADMIN' | 'ANALYST' | 'VIEWER') => {
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, role: newRole })
      });
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      }
    } catch (e) {
      console.error("Failed to update role:", e);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to revoke access for ${userEmail}?`)) {
      return;
    }

    setDeletingId(userId);
    try {
      const res = await fetch(`/api/users?id=${userId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || 'Failed to remove user');
        return;
      }

      setUsers(prev => prev.filter(u => u.id !== userId));
      setSuccessMessage(`Access for ${userEmail} was revoked.`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (e: any) {
      alert(e.message || 'Error deleting user');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Alert Notification */}
      {successMessage && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-medium animate-in fade-in">
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header toolbar */}
        <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#6B4BC8]" />
              Authorized Team Members
            </h2>
            <p className="text-sm text-slate-500">
              Users authorized to log into the Kids Dental Specialists SEO & LLM Dashboard.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#6B4BC8]/20 focus:border-[#6B4BC8]"
              />
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#6B4BC8] hover:bg-[#5a3da8] text-white rounded-lg transition-colors text-sm font-semibold shadow-sm"
            >
              <UserPlus className="h-4 w-4" />
              Add User
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                <th className="py-3 px-6">User</th>
                <th className="py-3 px-6">Role / Permissions</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No users match your search.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* User info */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        {user.image ? (
                          <img
                            src={user.image}
                            alt={user.name}
                            className="w-9 h-9 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-purple-100 text-[#6B4BC8] font-bold flex items-center justify-center text-sm border border-purple-200">
                            {user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-800">{user.name}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <Mail className="h-3 w-3 text-slate-400" />
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role dropdown */}
                    <td className="py-4 px-6">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as any)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-md border cursor-pointer focus:outline-none transition-colors ${
                          user.role === 'ADMIN'
                            ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                            : user.role === 'ANALYST'
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="ANALYST">ANALYST</option>
                        <option value="VIEWER">VIEWER</option>
                      </select>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        {user.status || 'Active'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        disabled={deletingId === user.id}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Revoke User Access"
                      >
                        {deletingId === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-[#6B4BC8] flex items-center justify-center font-bold">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-base">Add Authorized User</h3>
                  <p className="text-xs text-slate-500">Grant dashboard access to a team member</p>
                </div>
              </div>
              <button
                onClick={resetForm}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              {errorMessage && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Sonia Gutierrez"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full text-sm px-3.5 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6B4BC8]/20 focus:border-[#6B4BC8] text-slate-800 placeholder-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Google Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. member@kidsdds.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full text-sm px-3.5 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6B4BC8]/20 focus:border-[#6B4BC8] text-slate-800 placeholder-slate-400"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  The user will log in via Google OAuth using this exact address.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Role & Permissions
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['ADMIN', 'ANALYST', 'VIEWER'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setFormRole(r)}
                      className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all ${
                        formRole === r
                          ? 'bg-[#6B4BC8] text-white border-[#6B4BC8] shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="mt-2 p-2.5 bg-slate-50 rounded-lg text-[11px] text-slate-600 border border-slate-100">
                  {formRole === 'ADMIN' && 'Full administrator control over all settings, team access, and cron workflows.'}
                  {formRole === 'ANALYST' && 'Can run audits, trigger AI tests, and export Q&A spreadsheets.'}
                  {formRole === 'VIEWER' && 'Read-only access to view charts, rankings, and reports.'}
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#6B4BC8] hover:bg-[#5a3da8] text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3.5 w-3.5" />
                      Authorize User
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
