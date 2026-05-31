import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logostir.png';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">

      {/* ── HEADER ── */}
      <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
        <img
          src={logo} alt="STIR"
          className="h-10 w-auto cursor-pointer"
          onClick={() => navigate('/dashboard')}
        />

        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex flex-col gap-1.5 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            aria-label="Menu"
          >
            <span className={`block h-0.5 w-6 bg-gray-700 transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block h-0.5 w-6 bg-gray-700 transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 w-6 bg-gray-700 transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden z-40">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-sm font-medium text-gray-800">{user?.name}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
              </div>

              {isAdmin && (
                <button
                  onClick={() => { setMenuOpen(false); navigate('/admin'); }}
                  className="w-full text-left px-4 py-3 text-sm text-blue-700 hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <span>⚙</span>
                  <span>Administration</span>
                  <span className="ml-auto text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">Admin</span>
                </button>
              )}

              <button
                onClick={() => { setMenuOpen(false); navigate('/import'); }}
                className="w-full text-left px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <span>↑</span>
                Importer des données
              </button>

              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors border-t border-gray-50 cursor-pointer"
              >
                <span>→</span>
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── PAGE CONTENT ── */}
      <main className="flex-1 flex flex-col">
        {children}
      </main>

      {/* ── FOOTER ── */}
      <footer className="bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between">
        <p className="text-xs text-gray-300">© {new Date().getFullYear()} STIR — Tous droits réservés</p>
        <p className="text-xs text-gray-300">Plateforme d'analyse de données</p>
      </footer>

      {menuOpen && <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}