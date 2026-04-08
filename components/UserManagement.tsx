import React, { useState, useEffect } from 'react';

interface User {
  _id: string;
  username: string;
  createdAt: number;
  expiresAt?: number;
  aiLimit?: number;
  aiUsed?: number;
}

interface UserManagementProps {
  token: string;
  onLogout: () => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({ token, onLogout }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newExpiryDays, setNewExpiryDays] = useState('30');
  const [newAiLimit, setNewAiLimit] = useState('10');
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editExpiryDays, setEditExpiryDays] = useState('');
  const [editAiLimit, setEditAiLimit] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  const fetchUsers = async () => {
    try {
      const res = await fetch('/.netlify/functions/auth/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          onLogout();
          return;
        }
        throw new Error(data.error);
      }
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;

    setActionLoading(true);
    try {
      const res = await fetch('/.netlify/functions/auth/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          username: newUsername, 
          password: newPassword,
          expiryDays: parseInt(newExpiryDays) || 30,
          aiLimit: parseInt(newAiLimit) || 10,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showMessage('success', `用户 ${newUsername} 创建成功！使用期限 ${newExpiryDays} 天，AI 次数 ${newAiLimit} 次`);
      setNewUsername('');
      setNewPassword('');
      setNewExpiryDays('30');
      setNewAiLimit('10');
      fetchUsers();
    } catch (err: any) {
      showMessage('error', err.message || '创建失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;

    setActionLoading(true);
    try {
      const updates: any = {};
      if (editExpiryDays) {
        updates.expiryDays = parseInt(editExpiryDays);
      }
      if (editAiLimit) {
        updates.aiLimit = parseInt(editAiLimit);
      }

      const res = await fetch('/.netlify/functions/auth/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          id: editingUser._id, 
          ...updates,
          resetAiUsage: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showMessage('success', `用户 ${editingUser.username} 已更新`);
      setEditingUser(null);
      setEditExpiryDays('');
      setEditAiLimit('');
      fetchUsers();
    } catch (err: any) {
      showMessage('error', err.message || '更新失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!resetPassword) return;

    setActionLoading(true);
    try {
      const res = await fetch('/.netlify/functions/auth/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: userId, password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showMessage('success', `新密码：${data.newPassword}`);
      setResetPassword('');
      fetchUsers();
    } catch (err: any) {
      showMessage('error', err.message || '重置失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtendExpiry = async (userId: string, days: number) => {
    setActionLoading(true);
    try {
      const res = await fetch('/.netlify/functions/auth/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: userId, expiryDays: days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showMessage('success', `已延长 ${days} 天`);
      fetchUsers();
    } catch (err: any) {
      showMessage('error', err.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`确定要删除用户 ${username} 吗？`)) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/.netlify/functions/auth/admin/users?id=${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showMessage('success', `用户 ${username} 已删除`);
      fetchUsers();
    } catch (err: any) {
      showMessage('error', err.message || '删除失败');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const getExpiryStatus = (expiresAt?: number) => {
    if (!expiresAt) return { text: '永久', color: 'text-green-600' };
    const now = Date.now();
    if (now > expiresAt) return { text: '已到期', color: 'text-red-600' };
    const days = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
    if (days <= 7) return { text: `剩余 ${days} 天`, color: 'text-orange-500' };
    return { text: `剩余 ${days} 天`, color: 'text-slate-600' };
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900 italic">珍豆你玩 - 用户管理</h1>
          <p className="text-sm text-slate-500">管理用户账号、使用期限和 AI 额度</p>
        </div>
        <button
          onClick={onLogout}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
        >
          退出登录
        </button>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm font-bold mb-6 ${
          message.type === 'success' 
            ? 'bg-green-100 text-green-700 border border-green-200' 
            : 'bg-red-100 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">添加用户</h2>
        <form onSubmit={handleAddUser} className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">用户名</label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="用户名"
              className="px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="密码（至少6位）"
              className="px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">使用期限（天）</label>
            <input
              type="number"
              value={newExpiryDays}
              onChange={(e) => setNewExpiryDays(e.target.value)}
              placeholder="30"
              min="1"
              className="w-24 px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">AI 次数</label>
            <input
              type="number"
              value={newAiLimit}
              onChange={(e) => setNewAiLimit(e.target.value)}
              placeholder="10"
              min="0"
              className="w-24 px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={actionLoading}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all disabled:opacity-50"
          >
            {actionLoading ? '添加中...' : '添加用户'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">用户列表</h2>
        
        {loading ? (
          <div className="text-center py-8 text-slate-400">加载中...</div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-slate-400">暂无用户</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="pb-3 font-bold">用户名</th>
                  <th className="pb-3 font-bold">创建时间</th>
                  <th className="pb-3 font-bold">使用期限</th>
                  <th className="pb-3 font-bold">AI 额度</th>
                  <th className="pb-3 font-bold text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const expiryStatus = getExpiryStatus(user.expiresAt);
                  const aiRemaining = (user.aiLimit || 10) - (user.aiUsed || 0);
                  
                  return (
                    <tr key={user._id} className="border-b border-slate-50 last:border-0">
                      <td className="py-4 font-medium text-slate-900">{user.username}</td>
                      <td className="py-4 text-sm text-slate-500">{formatDate(user.createdAt)}</td>
                      <td className={`py-4 text-sm font-bold ${expiryStatus.color}`}>
                        {expiryStatus.text}
                      </td>
                      <td className="py-4 text-sm">
                        <span className={aiRemaining <= 0 ? 'text-red-500 font-bold' : 'text-slate-600'}>
                          {user.aiUsed || 0} / {user.aiLimit || 10}
                        </span>
                      </td>
                      <td className="py-4 text-right">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <button
                            onClick={() => {
                              setEditingUser(user);
                              setEditExpiryDays('30');
                              setEditAiLimit(String(user.aiLimit || 10));
                            }}
                            className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm font-bold rounded-lg"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleExtendExpiry(user._id, 30)}
                            className="px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 text-sm font-bold rounded-lg"
                          >
                            +30天
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user._id, user.username)}
                            disabled={actionLoading}
                            className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-600 text-sm font-bold rounded-lg disabled:opacity-50"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-4">编辑用户 - {editingUser.username}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">延长使用期限（天）</label>
                <input
                  type="number"
                  value={editExpiryDays}
                  onChange={(e) => setEditExpiryDays(e.target.value)}
                  placeholder="输入天数"
                  min="1"
                  className="w-full px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">AI 生成次数上限</label>
                <input
                  type="number"
                  value={editAiLimit}
                  onChange={(e) => setEditAiLimit(e.target.value)}
                  placeholder="次数"
                  min="0"
                  className="w-full px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none"
                />
                <p className="text-xs text-slate-400 mt-1">重置 AI 使用次数</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">重置密码</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="新密码"
                  className="w-full px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setEditingUser(null); setResetPassword(''); }}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
