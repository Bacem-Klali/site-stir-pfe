import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import logo from '../assets/logostir.png';

const API = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const SECTIONS = [
  { id: 'create', label: 'Créer un compte', icon: '＋' },
  { id: 'users', label: 'Utilisateurs', icon: '👥' },
  { id: 'logins', label: 'Journal connexions', icon: '🕓' },
  { id: 'imports', label: 'Journal imports', icon: '📂' },
];

const ROLE_BADGE = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  user: 'bg-gray-100 text-gray-500',
};

const ROLE_LABEL = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  user: 'Utilisateur',
};

export default function AdminPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState('create');
  const [menuOpen, setMenuOpen] = useState(false);

  // ── users list ──
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // ── create form ──
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' });
  const [createLoading, setCreateLoading] = useState(false);
  const [createMsg, setCreateMsg] = useState(null); // { type: 'success'|'error', text }

  // ── edit modal ──
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editMsg, setEditMsg] = useState(null);

  // ── login logs ──
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const isOwner = user?.role === 'owner';

  const [importLogs, setImportLogs] = useState([]);
  const [importLogsLoading, setImportLogsLoading] = useState(false);

  // ── fetch users ──
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await axios.get('/api/admin/users', API(token));
      setUsers(res.data.users);
    } catch {
      //
    } finally {
      setUsersLoading(false);
    }
  }, [token]);

  // ── fetch logs ──
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await axios.get('/api/admin/logs/logins', API(token));
      setLogs(res.data.logs);
    } catch {
      //
    } finally {
      setLogsLoading(false);
    }
  }, [token]);

  // ── fetch import logs ──
  const fetchImportLogs = useCallback(async () => {
    setImportLogsLoading(true);
    try {
      const res = await axios.get('/api/admin/logs/imports', API(token));
      setImportLogs(res.data.logs);
    } catch {
      //
    } finally {
      setImportLogsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (section === 'users') fetchUsers();
    if (section === 'logins') fetchLogs();
    if (section === 'imports') fetchImportLogs();
  }, [section, fetchUsers, fetchLogs, fetchImportLogs]);

  // ── create user ──
  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateMsg(null);
    try {
      await axios.post('/api/admin/users', form, API(token));
      setCreateMsg({ type: 'success', text: `Compte créé pour ${form.email}` });
      setForm({ name: '', email: '', password: '', role: 'user' });
    } catch (err) {
      setCreateMsg({ type: 'error', text: err.response?.data?.message || 'Erreur lors de la création.' });
    } finally {
      setCreateLoading(false);
    }
  };

  // ── toggle active ──
  const handleToggle = async (id) => {
    try {
      const res = await axios.patch(`/api/admin/users/${id}/toggle`, {}, API(token));
      setUsers(prev => prev.map(u => u.id === id ? res.data.user : u));
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur.');
    }
  };

  // ── open edit ──
  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({ name: u.name, email: u.email, role: u.role });
    setEditMsg(null);
  };

  // ── save edit ──
  const handleEdit = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    setEditMsg(null);
    try {
      const res = await axios.patch(`/api/admin/users/${editUser.id}`, editForm, API(token));
      setUsers(prev => prev.map(u => u.id === editUser.id ? res.data.user : u));
      setEditMsg({ type: 'success', text: 'Modifications enregistrées.' });
    } catch (err) {
      setEditMsg({ type: 'error', text: err.response?.data?.message || 'Erreur.' });
    } finally {
      setEditLoading(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">

      {/* ── HEADER ── */}
      <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <img src={logo} alt="STIR" className="h-10 w-auto cursor-pointer" onClick={() => navigate('/dashboard')} />
          <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">
            Administration
          </span>
        </div>

        {/* Section tabs */}
        <nav className="hidden md:flex items-center gap-1">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer
                ${section === s.id
                  ? 'bg-blue-900 text-white'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
            >
              <span>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex flex-col gap-1.5 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <span className={`block h-0.5 w-6 bg-gray-700 transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block h-0.5 w-6 bg-gray-700 transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 w-6 bg-gray-700 transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden z-40">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-sm font-medium text-gray-800">{user?.name}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
              </div>
              <button
                onClick={() => { setMenuOpen(false); navigate('/dashboard'); }}
                className="w-full text-left px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
              >
                <span>◈</span> Tableau de bord
              </button>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 border-t border-gray-50 cursor-pointer"
              >
                <span>→</span> Se déconnecter
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile section tabs */}
      <div className="md:hidden flex overflow-x-auto gap-1 px-4 py-3 bg-white border-b border-gray-100">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer
              ${section === s.id ? 'bg-blue-900 text-white' : 'text-gray-500 bg-gray-50'}`}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* ── MAIN ── */}
      <main className="flex-1 px-6 py-8 max-w-screen-lg mx-auto w-full">

        {/* Page heading */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-800">
            {SECTIONS.find(s => s.id === section)?.label}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {section === 'create' && 'Créer un nouveau compte utilisateur'}
            {section === 'users' && 'Gérer les comptes et les accès'}
            {section === 'logins' && 'Historique des connexions'}
            {section === 'imports' && 'Historique des imports de fichiers'}
          </p>
        </div>

        {/* ── CREATE SECTION ── */}
        {section === 'create' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-lg">
            {createMsg && (
              <div className={`mb-5 px-4 py-3 rounded-lg text-sm border
                ${createMsg.type === 'success'
                  ? 'bg-green-50 text-green-700 border-green-100'
                  : 'bg-red-50 text-red-600 border-red-100'}`}>
                {createMsg.text}
              </div>
            )}
            <form onSubmit={handleCreate} className="space-y-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Nom complet</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ahmed"
                  className="border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Adresse e-mail</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="ahmed@stir.com"
                  className="border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Mot de passe</label>
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>

              {/* Role selector — only owner sees admin option */}
              {isOwner && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Rôle</label>
                  <div className="flex gap-3">
                    {['user', 'admin'].map(r => (
                      <button
                        type="button"
                        key={r}
                        onClick={() => setForm({ ...form, role: r })}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all cursor-pointer
                          ${form.role === r
                            ? r === 'admin'
                              ? 'bg-blue-900 text-white border-blue-900'
                              : 'bg-gray-800 text-white border-gray-800'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                          }`}
                      >
                        {r === 'admin' ? '⚙ Administrateur' : '👤 Utilisateur'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={createLoading}
                className="w-full bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-3 transition-colors cursor-pointer mt-2"
              >
                {createLoading ? 'Création en cours...' : 'Créer le compte'}
              </button>
            </form>
          </div>
        )}

        {/* ── USERS SECTION ── */}
        {section === 'users' && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {usersLoading ? (
              <div className="flex items-center justify-center py-20 text-gray-300 text-sm">
                Chargement...
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Nom</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">E-mail</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Rôle</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Statut</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Créé le</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-800">{u.name}</td>
                      <td className="px-6 py-4 text-gray-500">{u.email}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_BADGE[u.role]}`}>
                          {ROLE_LABEL[u.role]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full
                          ${u.isActive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-400'}`}>
                          {u.isActive ? 'Actif' : 'Désactivé'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-xs">
                        {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4">
                        {u.role !== 'owner' && (
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => openEdit(u)}
                              className="text-xs text-blue-600 hover:underline cursor-pointer"
                            >
                              Modifier
                            </button>
                            <span className="text-gray-200">|</span>
                            <button
                              onClick={() => handleToggle(u.id)}
                              className={`text-xs cursor-pointer hover:underline
                                ${u.isActive ? 'text-red-400' : 'text-green-500'}`}
                            >
                              {u.isActive ? 'Désactiver' : 'Activer'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── LOGIN LOGS SECTION ── */}
        {section === 'logins' && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {logsLoading ? (
              <div className="flex items-center justify-center py-20 text-gray-300 text-sm">Chargement...</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Utilisateur</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">E-mail</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Statut</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">IP</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-700">{log.user?.name}</td>
                      <td className="px-6 py-3 text-gray-500">{log.email}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full
                          ${log.success ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-400'}`}>
                          {log.success ? '✓ Succès' : '✗ Échec'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-xs font-mono">{log.ip || '—'}</td>
                      <td className="px-6 py-3 text-gray-400 text-xs">
                        {new Date(log.createdAt).toLocaleString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {section === 'imports' && (
  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
    {importLogsLoading ? (
      <div className="flex items-center justify-center py-20 text-gray-300 text-sm">Chargement...</div>
    ) : importLogs.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-2xl text-gray-300">📂</div>
        <p className="text-gray-400 text-sm font-medium">Aucun import effectué</p>
      </div>
    ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Utilisateur</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Année</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Statut</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Fichiers</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Message</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Date</th>
          </tr>
        </thead>
        <tbody>
          {importLogs.map(log => (
            <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td className="px-6 py-3 font-medium text-gray-700">{log.user?.name}</td>
              <td className="px-6 py-3 text-gray-600">Budget {log.year}</td>
              <td className="px-6 py-3">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full
                  ${log.status === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-400'}`}>
                  {log.status === 'success' ? '✓ Succès' : '✗ Erreur'}
                </span>
              </td>
              <td className="px-6 py-3 text-gray-400 text-xs">{log.filesCount} / 5</td>
              <td className="px-6 py-3 text-gray-400 text-xs max-w-xs truncate">{log.message}</td>
              <td className="px-6 py-3 text-gray-400 text-xs">
                {new Date(log.createdAt).toLocaleString('fr-FR')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
)}
      </main>

      {/* ── FOOTER ── */}
      <footer className="bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between">
        <p className="text-xs text-gray-300">© {new Date().getFullYear()} STIR — Tous droits réservés</p>
        <p className="text-xs text-gray-300">Plateforme d'analyse de données</p>
      </footer>

      {/* ── EDIT MODAL ── */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl w-full max-w-md p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-gray-800">Modifier l'utilisateur</h2>
              <button onClick={() => setEditUser(null)} className="text-gray-300 hover:text-gray-500 text-xl cursor-pointer">✕</button>
            </div>

            {editMsg && (
              <div className={`mb-4 px-4 py-3 rounded-lg text-sm border
                ${editMsg.type === 'success'
                  ? 'bg-green-50 text-green-700 border-green-100'
                  : 'bg-red-50 text-red-600 border-red-100'}`}>
                {editMsg.text}
              </div>
            )}

            <form onSubmit={handleEdit} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Nom complet</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">E-mail</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                  className="border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>

              {isOwner && editUser.role !== 'owner' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Rôle</label>
                  <div className="flex gap-3">
                    {['user', 'admin'].map(r => (
                      <button
                        type="button"
                        key={r}
                        onClick={() => setEditForm({ ...editForm, role: r })}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all cursor-pointer
                          ${editForm.role === r
                            ? r === 'admin'
                              ? 'bg-blue-900 text-white border-blue-900'
                              : 'bg-gray-800 text-white border-gray-800'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                          }`}
                      >
                        {r === 'admin' ? '⚙ Admin' : '👤 Utilisateur'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-blue-900 text-white hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {editLoading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {menuOpen && <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}