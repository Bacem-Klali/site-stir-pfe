import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logostir.png';

const dashboards = [
  { id: 1, label: 'Vue d\'ensemble', icon: '▦' },
  { id: 2, label: 'Performance', icon: '◈' },
  { id: 3, label: 'Finances', icon: '◉' },
  { id: 4, label: 'Ressources', icon: '◎' },
];

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDash, setActiveDash] = useState(1);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setUploadedFile(file.name);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) setUploadedFile(file.name);
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">

      {/* ── HEADER ── */}
      <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
        <img src={logo} alt="STIR" className="h-10 w-auto" />

        {/* Hamburger */}
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

          {/* Dropdown */}
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
                  <span className="text-base">⚙</span>
                  <span>Administration</span>
                  <span className="ml-auto text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">Admin</span>
                </button>
              )}

              <button
                onClick={() => { setMenuOpen(false); navigate('/import'); }}
                className="w-full text-left px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <span className="text-base">↑</span>
                Importer des données
              </button>

              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors border-t border-gray-50 cursor-pointer"
              >
                <span className="text-base">→</span>
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="flex-1 flex flex-col px-6 py-6 max-w-screen-xl mx-auto w-full gap-6">

        {/* Page title */}
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Tableaux de bord</h1>
          <p className="text-sm text-gray-400 mt-0.5">Visualisez et analysez vos données en temps réel</p>
        </div>

        {/* Dashboard viewer */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex-1 flex flex-col min-h-96">

          {/* Power BI placeholder */}
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-3xl text-gray-300">
              ▦
            </div>
            <div>
              <p className="text-gray-500 font-medium text-sm">Tableau de bord Power BI</p>
              <p className="text-gray-300 text-xs mt-1">
                {dashboards.find(d => d.id === activeDash)?.label} — Le rapport sera intégré ici
              </p>
            </div>
            <div className="mt-2 px-4 py-2 rounded-lg bg-gray-50 border border-dashed border-gray-200">
              <p className="text-xs text-gray-300">iframe Power BI · à intégrer</p>
            </div>
          </div>

          {/* Dashboard tabs */}
          <div className="border-t border-gray-100 px-4 py-3 flex gap-2 overflow-x-auto">
            {dashboards.map(d => (
              <button
                key={d.id}
                onClick={() => setActiveDash(d.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all cursor-pointer
                  ${activeDash === d.id
                    ? 'bg-blue-900 text-white'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                  }`}
              >
                <span>{d.icon}</span>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* ETL import zone */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Importation de données</h2>
              <p className="text-xs text-gray-400 mt-0.5">Déposez un fichier pour lancer le traitement ETL</p>
            </div>
            {uploadedFile && (
              <span className="text-xs bg-green-50 text-green-600 border border-green-100 px-3 py-1 rounded-full">
                ✓ {uploadedFile}
              </span>
            )}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all
              ${dragOver
                ? 'border-blue-300 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
          >
            <div className={`text-3xl transition-colors ${dragOver ? 'text-blue-400' : 'text-gray-300'}`}>↑</div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">
                {dragOver ? 'Relâchez pour importer' : 'Glissez-déposez votre fichier ici'}
              </p>
              <p className="text-xs text-gray-300 mt-1">ou cliquez pour parcourir · CSV, Excel, JSON</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer className="bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between">
        <p className="text-xs text-gray-300">© {new Date().getFullYear()} STIR — Tous droits réservés</p>
        <p className="text-xs text-gray-300">Plateforme d'analyse de données</p>
      </footer>

      {/* Overlay to close menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
      )}
    </div>
  );
}
