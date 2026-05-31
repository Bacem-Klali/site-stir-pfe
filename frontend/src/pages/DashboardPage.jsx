import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logostir.png';

const BASE = 'https://app.powerbi.com/view?r=eyJrIjoiODMxMzRjNjktNTAwYS00MTk1LWE3YzMtYjFlM2QzNTRhOGU5IiwidCI6ImRiZDY2NjRkLTRlYjktNDZlYi05OWQ4LTVjNDNiYTE1M2M2MSIsImMiOjl9&pageName=fc3853f1ecea84ffa6b6';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">


      {/* ── MAIN ── */}
      <main className="flex-1 flex flex-col px-6 py-6 max-w-screen-xl mx-auto w-full gap-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Tableaux de bord</h1>
          <p className="text-sm text-gray-400 mt-0.5">Visualisez et analysez vos données en temps réel</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex-1 flex flex-col" style={{ minHeight: '600px' }}>
          <iframe
            src={BASE}
            style={{ width: '100%', height: '100%', minHeight: '600px', border: 'none', display: 'block' }}
            allowFullScreen
            title="Tableau de bord Power BI"
          />
        </div>
      </main>
    </div>
  );
}