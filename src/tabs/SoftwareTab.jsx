import React, { useState, useEffect, useCallback } from 'react';
import DataGrid from '../components/DataGrid';
import Modal from '../components/Modal';
import * as api from '../services/api';

const SOFTWARE_CATALOG = [
  { id: 'Mozilla.Firefox', name: 'Firefox', category: 'Browser', icon: '\uD83E\uDD8A' },
  { id: 'Google.Chrome', name: 'Google Chrome', category: 'Browser', icon: '\uD83C\uDF10' },
  { id: 'VideoLAN.VLC', name: 'VLC Media Player', category: 'Multimedia', icon: '\uD83C\uDFAC' },
  { id: '7zip.7zip', name: '7-Zip', category: 'Utility', icon: '\uD83D\uDCE6' },
  { id: 'Notepad++.Notepad++', name: 'Notepad++', category: 'Editor', icon: '\uD83D\uDCDD' },
  { id: 'Microsoft.VisualStudioCode', name: 'VS Code', category: 'Sviluppo', icon: '\uD83D\uDCBB' },
  { id: 'Adobe.Acrobat.Reader.64-bit', name: 'Adobe Reader', category: 'Documenti', icon: '\uD83D\uDCC4' },
  { id: 'Microsoft.PowerToys', name: 'PowerToys', category: 'Utility', icon: '\u2699\uFE0F' },
  { id: 'TheDocumentFoundation.LibreOffice', name: 'LibreOffice', category: 'Office', icon: '\uD83D\uDCC3' },
  { id: 'WinSCP.WinSCP', name: 'WinSCP', category: 'Rete', icon: '\uD83D\uDCC2' },
  { id: 'PuTTY.PuTTY', name: 'PuTTY', category: 'Rete', icon: '\uD83D\uDCBB' },
  { id: 'Git.Git', name: 'Git', category: 'Sviluppo', icon: '\uD83D\uDD00' },
  { id: 'Python.Python.3.12', name: 'Python 3.12', category: 'Sviluppo', icon: '\uD83D\uDC0D' },
  { id: 'Microsoft.DotNet.SDK.9', name: '.NET SDK 9', category: 'Sviluppo', icon: '\uD83D\uDD35' },
  { id: 'KeePassXCTeam.KeePassXC', name: 'KeePassXC', category: 'Sicurezza', icon: '\uD83D\uDD10' },
  { id: 'Greenshot.Greenshot', name: 'Greenshot', category: 'Utility', icon: '\uD83D\uDCF7' },
  { id: 'ShareX.ShareX', name: 'ShareX', category: 'Utility', icon: '\uD83D\uDCF8' },
];

const STATUS_MAP = {
  queued: { label: 'In Coda', cls: 'muted' },
  installing: { label: 'Installazione', cls: 'blue' },
  completed: { label: 'Completato', cls: 'green' },
  failed: { label: 'Fallito', cls: 'red' },
};

const queueColumns = [
  { key: 'pc_name', label: 'PC' },
  { key: 'ip', label: 'IP', width: 130 },
  { key: 'packages', label: 'Pacchetti', render: v => (
    <span style={{ fontSize: 11 }}>{Array.isArray(v) ? v.join(', ') : v}</span>
  )},
  { key: 'status', label: 'Stato', width: 120, render: v => {
    const st = STATUS_MAP[v] || { label: v || 'N/D', cls: 'muted' };
    return <span className={`tag ${st.cls}`}>{st.label}</span>;
  }},
  { key: 'progress', label: 'Progresso', width: 140, render: (v, row) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="progress-bar" style={{ flex: 1 }}>
        <div className={`progress-fill ${row.status === 'completed' ? 'green' : row.status === 'failed' ? 'red' : ''}`}
          style={{ width: `${v || 0}%` }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 30 }}>{v || 0}%</span>
    </div>
  )},
];

const QUEUE_KEY = 'novascm-software-queue';

function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch { return []; }
}

function saveQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* ignore */ }
}

export default function SoftwareTab({ addLog }) {
  const [tab, setTab] = useState('queue');
  const [queue, setQueue] = useState([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [showDistribute, setShowDistribute] = useState(false);
  const [loading, setLoading] = useState(false);

  // Distribute form state
  const [distForm, setDistForm] = useState({
    pcs: '',  // comma-separated PC names or IPs
    selectedPackages: [],
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load queue from API (pc-workflows that have software) + local cache
      const pwData = await api.getPcWorkflows();
      const pwList = Array.isArray(pwData) ? pwData : [];

      // Build queue from pc-workflows that carry software deployment info
      const apiQueue = pwList
        .filter(pw => pw.software || pw.packages)
        .map(pw => ({
          id: pw.id,
          pc_name: pw.pc_name,
          ip: pw.ip || '',
          packages: pw.software || pw.packages || [],
          status: pw.status === 'completed' ? 'completed' : pw.status === 'running' ? 'installing' : pw.status === 'failed' ? 'failed' : 'queued',
          progress: pw.progress || 0,
          source: 'api',
        }));

      // Merge with local queue
      const localQueue = loadQueue();
      const merged = [...apiQueue, ...localQueue.filter(lq => !apiQueue.some(aq => aq.pc_name === lq.pc_name && JSON.stringify(aq.packages) === JSON.stringify(lq.packages)))];

      setQueue(merged);
    } catch (e) {
      addLog(`Errore caricamento coda software: ${e.message}`, 'error');
      // Fallback to local queue only
      setQueue(loadQueue());
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDistribute = () => {
    if (!distForm.pcs.trim() || distForm.selectedPackages.length === 0) return;

    const pcList = distForm.pcs.split(',').map(s => s.trim()).filter(Boolean);
    const newItems = pcList.map((pc, idx) => ({
      id: `local-${Date.now()}-${idx}`,
      pc_name: pc,
      ip: '',
      packages: [...distForm.selectedPackages],
      status: 'queued',
      progress: 0,
      source: 'local',
    }));

    const updatedQueue = [...queue, ...newItems];
    setQueue(updatedQueue);
    saveQueue(updatedQueue.filter(q => q.source === 'local'));

    setShowDistribute(false);
    setDistForm({ pcs: '', selectedPackages: [] });
    addLog(`${newItems.length} PC aggiunti alla coda con ${distForm.selectedPackages.length} pacchetti`, 'success');
  };

  const handleRetry = () => {
    if (!selected || selected.status !== 'failed') return;
    const updated = queue.map(q =>
      q.id === selected.id ? { ...q, status: 'queued', progress: 0 } : q
    );
    setQueue(updated);
    saveQueue(updated.filter(q => q.source === 'local'));
    addLog(`Retry installazione per ${selected.pc_name}`, 'info');
  };

  const handleRemove = () => {
    if (!selected || !confirm(`Rimuovere "${selected.pc_name}" dalla coda?`)) return;
    const updated = queue.filter(q => q.id !== selected.id);
    setQueue(updated);
    saveQueue(updated.filter(q => q.source === 'local'));
    setSelected(null);
    addLog(`${selected.pc_name} rimosso dalla coda`, 'success');
  };

  const togglePackage = (pkgId) => {
    setDistForm(prev => ({
      ...prev,
      selectedPackages: prev.selectedPackages.includes(pkgId)
        ? prev.selectedPackages.filter(p => p !== pkgId)
        : [...prev.selectedPackages, pkgId],
    }));
  };

  const addToCatalogQueue = (pkg) => {
    // Quick-add: opens distribute modal pre-filled with this package
    setDistForm({ pcs: '', selectedPackages: [pkg.id] });
    setShowDistribute(true);
  };

  const filteredCatalog = SOFTWARE_CATALOG.filter(pkg => {
    if (!catalogSearch) return true;
    const q = catalogSearch.toLowerCase();
    return pkg.name.toLowerCase().includes(q) || pkg.id.toLowerCase().includes(q) || pkg.category.toLowerCase().includes(q);
  });

  const stats = {
    queued: queue.filter(q => q.status === 'queued').length,
    installing: queue.filter(q => q.status === 'installing').length,
    completed: queue.filter(q => q.status === 'completed').length,
    failed: queue.filter(q => q.status === 'failed').length,
  };

  return (
    <div>
      {/* Stats Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">In Coda</div>
          <div className="stat-value accent">{stats.queued}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Installazione</div>
          <div className="stat-value amber">{stats.installing}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completati</div>
          <div className="stat-value green">{stats.completed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Falliti</div>
          <div className="stat-value red">{stats.failed}</div>
        </div>
      </div>

      {/* Inner Tabs */}
      <div className="inner-tabs">
        <div className={`inner-tab ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>
          Coda Installazione
        </div>
        <div className={`inner-tab ${tab === 'catalog' ? 'active' : ''}`} onClick={() => setTab('catalog')}>
          Catalogo Software
        </div>
      </div>

      {/* Queue Tab */}
      {tab === 'queue' && (
        <>
          {loading && (
            <div style={{ marginBottom: 12 }}>
              <div className="progress-bar"><div className="progress-fill" style={{ width: '100%' }} /></div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Caricamento coda...</div>
            </div>
          )}
          <DataGrid
            columns={queueColumns}
            data={queue}
            onRowClick={setSelected}
            actions={
              <>
                <button className="btn green" onClick={() => setShowDistribute(true)}>
                  + Distribuisci Software
                </button>
                <button className="btn amber" disabled={!selected || selected.status !== 'failed'} onClick={handleRetry}>
                  {'\u21BB'} Retry
                </button>
                <button className="btn red" disabled={!selected} onClick={handleRemove}>
                  {'\uD83D\uDDD1'} Rimuovi
                </button>
                <button className="btn" onClick={loadData}>{'\uD83D\uDD04'}</button>
              </>
            }
          />
        </>
      )}

      {/* Catalog Tab */}
      {tab === 'catalog' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <input
              className="form-input"
              style={{ maxWidth: 400 }}
              placeholder="Cerca software..."
              value={catalogSearch}
              onChange={e => setCatalogSearch(e.target.value)}
            />
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 10,
          }}>
            {filteredCatalog.map(pkg => (
              <div key={pkg.id} style={{
                background: 'var(--bg-surface2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'border-color 0.15s, background 0.15s',
                cursor: 'default',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.background = 'var(--bg-surface3)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-surface2)'; }}
              >
                <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{pkg.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{pkg.name}</div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pkg.id}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{pkg.category}</div>
                </div>
                <button
                  className="btn primary"
                  style={{ padding: '4px 10px', fontSize: 11, flexShrink: 0 }}
                  onClick={() => addToCatalogQueue(pkg)}
                  title="Aggiungi alla coda di installazione"
                >
                  + Coda
                </button>
              </div>
            ))}
            {filteredCatalog.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
                Nessun software trovato per "{catalogSearch}"
              </div>
            )}
          </div>
        </>
      )}

      {/* Distribute Software Modal */}
      {showDistribute && (
        <Modal title="Distribuisci Software" onClose={() => setShowDistribute(false)} wide footer={
          <>
            <button className="btn" onClick={() => setShowDistribute(false)}>Annulla</button>
            <button className="btn green" onClick={handleDistribute}
              disabled={!distForm.pcs.trim() || distForm.selectedPackages.length === 0}
            >
              Distribuisci ({distForm.selectedPackages.length} pacchetti)
            </button>
          </>
        }>
          <div className="form-group">
            <label className="form-label">PC Destinazione (separati da virgola)</label>
            <textarea
              className="form-textarea"
              value={distForm.pcs}
              onChange={e => setDistForm({ ...distForm, pcs: e.target.value })}
              placeholder="PC-AABBCC, PC-DDEEFF, 192.168.1.105"
              style={{ minHeight: 60 }}
            />
          </div>

          <div className="section-title" style={{ marginTop: 8 }}>
            Seleziona Pacchetti ({distForm.selectedPackages.length} selezionati)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
            {SOFTWARE_CATALOG.map(pkg => (
              <label key={pkg.id} className="form-check" style={{
                padding: '6px 8px',
                background: distForm.selectedPackages.includes(pkg.id) ? 'var(--bg-selected)' : 'transparent',
                borderRadius: 4,
                transition: 'background 0.1s',
              }}>
                <input
                  type="checkbox"
                  checked={distForm.selectedPackages.includes(pkg.id)}
                  onChange={() => togglePackage(pkg.id)}
                />
                <span style={{ fontSize: 16, marginRight: 4 }}>{pkg.icon}</span>
                <span>{pkg.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>{pkg.category}</span>
              </label>
            ))}
          </div>

          {distForm.selectedPackages.length > 0 && (
            <div style={{
              marginTop: 12, padding: 10, background: 'var(--bg-primary)',
              borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 11,
            }}>
              <div style={{ color: 'var(--text-dim)', marginBottom: 4, fontWeight: 600 }}>Comando Winget (per referenza)</div>
              <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)', wordBreak: 'break-all' }}>
                {distForm.selectedPackages.map(p => `winget install --id ${p} --accept-source-agreements --accept-package-agreements`).join('\n')}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
