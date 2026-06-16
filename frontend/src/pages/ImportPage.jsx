import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function ImportPage() {
    const { token } = useAuth();

// Add this inside DashboardPage, alongside existing state:
const [budgets, setBudgets]         = useState([]);
const [activeYear, setActiveYear]   = useState(null);
const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
const [files, setFiles]             = useState({});
const [dragOver, setDragOver]       = useState(null);
const [uploading, setUploading]     = useState(false);
const [activating, setActivating]   = useState(false);
const [etlStatus, setEtlStatus]     = useState(null); // 'success'|'error'|null
const [etlMessage, setEtlMessage]   = useState('');

const FILE_SLOTS = [
  { key: 'activite_raffinage_consolide', label: 'Activité Raffinage Consolidé' },
  { key: 'importation',                  label: 'Importation' },
  { key: 'charges_ordinaires_impots',    label: 'Charges Ordinaires & Impôts' },
  { key: 'charges_personnel',            label: 'Charges Personnel' },
  { key: 'donnees_services_charges',     label: 'Données Services & Charges' },
];

useEffect(() => {
  axios.get('/api/etl/budgets', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => { setBudgets(r.data.budgets); setActiveYear(r.data.activeYear); })
    .catch(() => {});
}, [etlStatus, activating]);

const handleFileDrop = (key, e) => {
  e.preventDefault();
  setDragOver(null);
  const file = e.dataTransfer.files[0];
  if (file) setFiles(prev => ({ ...prev, [key]: file }));
};

const handleFileSelect = (key, e) => {
  const file = e.target.files[0];
  if (file) setFiles(prev => ({ ...prev, [key]: file }));
};

const handleRunETL = async () => {
  if (Object.keys(files).length < FILE_SLOTS.length)
    return setEtlMessage('Veuillez sélectionner les 5 fichiers.');

  setUploading(true);
  setEtlStatus(null);
  const formData = new FormData();
  formData.append('year', selectedYear);
  FILE_SLOTS.forEach(({ key }) => formData.append(key, files[key]));

  try {
    const res = await axios.post(`/api/etl/run?year=${selectedYear}`, formData, {
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
    });
    setEtlStatus('success');
    setEtlMessage(res.data.message);
    setFiles({});
    } catch (err) {
    setEtlStatus('error');
    const data = err.response?.data;
    setEtlMessage(data?.detail || data?.message || 'Erreur lors du traitement.');
    } finally {
    setUploading(false);
  }
};

const handleActivate = async (year) => {
  setActivating(true);
  try {
    await axios.post(`/api/etl/activate/${year}`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setActiveYear(year);
  } catch {}
  finally { setActivating(false); }
};

return (
    <div className="p-8 max-w-6xl mx-auto">
{/* ETL Section */}
<div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
  <div>
    <h2 className="text-sm font-semibold text-gray-700">Gestion des données budgétaires</h2>
    <p className="text-xs text-gray-400 mt-0.5">Importer un nouveau budget ou changer l'année active</p>
  </div>

  {/* Active budget + available budgets */}
  <div>
    <p className="text-xs font-medium text-gray-500 mb-2">Budgets disponibles</p>
    {budgets.length === 0 ? (
      <p className="text-xs text-gray-300">Aucun budget importé pour l'instant</p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {budgets.map(b => (
          <div key={b.year} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all
            ${b.active ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-600 border-gray-200'}`}>
            <span className="font-medium">Budget {b.year}</span>
            {b.active && <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full">Actif</span>}
            {!b.active && (
              <button
                onClick={() => handleActivate(b.year)}
                disabled={activating}
                className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors cursor-pointer"
              >
                Activer
              </button>
            )}
          </div>
        ))}
      </div>
    )}
    {activeYear && (
      <p className="text-xs text-gray-400 mt-2">
        Power BI est connecté au schéma <strong>active_view</strong> de stirsite_dw.
        Après activation, cliquez sur <strong>Actualiser</strong> dans Power BI — aucune modification de connexion n'est nécessaire.
      </p>
    )}
  </div>

  <div className="border-t border-gray-50 pt-5">
    <div className="flex items-center justify-between mb-4">
      <p className="text-xs font-medium text-gray-500">Importer un nouveau budget</p>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Année :</label>
        <select
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:border-blue-300"
        >
          {[2023,2024,2025,2026,2027,2028].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
    </div>

    {/* File slots */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
      {FILE_SLOTS.map(({ key, label }) => (
        <div
          key={key}
          onDragOver={e => { e.preventDefault(); setDragOver(key); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={e => handleFileDrop(key, e)}
          onClick={() => document.getElementById(`file-${key}`).click()}
          className={`border-2 border-dashed rounded-xl p-3 flex flex-col items-center gap-1 cursor-pointer transition-all
            ${files[key] ? 'border-green-300 bg-green-50' :
              dragOver === key ? 'border-blue-300 bg-blue-50' :
              'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
        >
          <span className={`text-lg ${files[key] ? 'text-green-500' : 'text-gray-300'}`}>
            {files[key] ? '✓' : '↑'}
          </span>
          <p className="text-xs font-medium text-center text-gray-600">{label}</p>
          <p className="text-xs text-gray-400 text-center truncate w-full text-center">
            {files[key] ? files[key].name : '.xlsx'}
          </p>
          <input
            id={`file-${key}`}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => handleFileSelect(key, e)}
          />
        </div>
      ))}
    </div>

    {/* Status */}
    {etlMessage && (
      <div className={`text-xs px-4 py-2 rounded-lg mb-3 ${
        etlStatus === 'success' ? 'bg-green-50 text-green-700 border border-green-100' :
        etlStatus === 'error'   ? 'bg-red-50 text-red-600 border border-red-100' :
                                  'bg-gray-50 text-gray-500'}`}>
        {etlMessage}
      </div>
    )}

    <button
      onClick={handleRunETL}
      disabled={uploading || Object.keys(files).length < FILE_SLOTS.length}
      className="w-full bg-blue-900 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl py-3 transition-colors cursor-pointer"
    >
      {uploading
        ? `Traitement du budget ${selectedYear} en cours...`
        : `Lancer l'ETL — Budget ${selectedYear}`}
    </button>
    <p className="text-xs text-gray-300 text-center mt-2">
      {Object.keys(files).length}/5 fichiers sélectionnés
    </p>
  </div>
</div>
</div>
);
}