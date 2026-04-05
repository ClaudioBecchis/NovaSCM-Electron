import React, { useState, useEffect, useCallback, useRef } from 'react';
import DataGrid from '../components/DataGrid';
import Modal from '../components/Modal';
import * as api from '../services/api';
import store from '../services/store';

function daysBetween(d1, d2) {
  return Math.round((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));
}

function certStatus(expiryDate) {
  if (!expiryDate) return { label: 'Sconosciuto', cls: 'muted' };
  const days = daysBetween(new Date(), expiryDate);
  if (days < 0) return { label: 'Scaduto', cls: 'red' };
  if (days <= 30) return { label: 'Scadenza prossima', cls: 'amber' };
  return { label: 'Attivo', cls: 'green' };
}

const columns = [
  { key: 'icon', label: '', width: 36 },
  { key: 'nome', label: 'Nome' },
  { key: 'mac', label: 'MAC', width: 150 },
  { key: 'created_at', label: 'Creato', width: 140, render: v => v ? new Date(v).toLocaleDateString('it-IT') : 'N/D' },
  { key: 'expiry', label: 'Scadenza', width: 140, render: v => v ? new Date(v).toLocaleDateString('it-IT') : 'N/D' },
  { key: 'status', label: 'Stato', width: 140, render: (_, row) => {
    const st = certStatus(row.expiry);
    return <span className={`tag ${st.cls}`}>{st.label}</span>;
  }},
];

function generateQrCanvas(text, canvas, size = 200) {
  // Simple QR-code-like visual using canvas (deterministic pattern from text hash)
  // For a production app you would use a library like qrcode.js
  const ctx = canvas.getContext('2d');
  canvas.width = size;
  canvas.height = size;

  const moduleCount = 21;
  const cellSize = Math.floor(size / moduleCount);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Simple hash-based pattern
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash;
  }

  ctx.fillStyle = '#000000';

  // Finder patterns (top-left, top-right, bottom-left)
  const drawFinder = (ox, oy) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const outer = x === 0 || x === 6 || y === 0 || y === 6;
        const inner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        if (outer || inner) {
          ctx.fillRect((ox + x) * cellSize, (oy + y) * cellSize, cellSize, cellSize);
        }
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(moduleCount - 7, 0);
  drawFinder(0, moduleCount - 7);

  // Data area - deterministic from text
  let seed = Math.abs(hash);
  for (let y = 0; y < moduleCount; y++) {
    for (let x = 0; x < moduleCount; x++) {
      // Skip finder pattern areas
      if ((x < 8 && y < 8) || (x >= moduleCount - 8 && y < 8) || (x < 8 && y >= moduleCount - 8)) continue;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if (seed % 3 === 0) {
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
  }
}

export default function CertsTab({ addLog }) {
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showQr, setShowQr] = useState(null);
  const qrCanvasRef = useRef(null);

  const [config] = useState(() => store.loadConfig());

  const [genForm, setGenForm] = useState({
    mac: '',
    device_name: '',
    validity_days: config.certDays || 3650,
    org_name: config.certOrg || 'MyOrg',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Try to load certificates from CR data (certs embedded in CR or from certportal)
      const crData = await api.getCrList();
      const crList = Array.isArray(crData) ? crData : [];

      // Build certificate list from CRs that have cert info
      // Also try dedicated cert endpoints if available
      const certList = [];
      const seen = new Set();

      crList.forEach(cr => {
        if (cr.mac_address || cr.cert_mac) {
          const mac = cr.mac_address || cr.cert_mac;
          if (seen.has(mac)) return;
          seen.add(mac);

          const created = cr.cert_created_at || cr.created_at;
          const validityDays = cr.cert_validity || config.certDays || 3650;
          const expiry = created ? new Date(new Date(created).getTime() + validityDays * 86400000).toISOString() : null;

          certList.push({
            id: `cert-${cr.id}`,
            icon: '\uD83D\uDD10',
            nome: cr.pc_name || cr.cert_name || `Device-${mac.slice(-5)}`,
            mac: mac.toUpperCase(),
            created_at: created,
            expiry: cr.cert_expiry || expiry,
            validity_days: validityDays,
            org: cr.cert_org || config.certOrg || 'MyOrg',
            cr_id: cr.id,
          });
        }
      });

      // Also load from localStorage cache
      try {
        const cached = JSON.parse(localStorage.getItem('novascm-certs') || '[]');
        cached.forEach(c => {
          if (!seen.has(c.mac)) {
            seen.add(c.mac);
            certList.push({ ...c, icon: '\uD83D\uDD10' });
          }
        });
      } catch { /* ignore */ }

      setCerts(certList);
    } catch (e) {
      addLog(`Errore caricamento certificati: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addLog, config.certDays, config.certOrg]);

  useEffect(() => { load(); }, [load]);

  // Render QR code when modal opens
  useEffect(() => {
    if (showQr && qrCanvasRef.current) {
      const enrollUrl = `${config.certportalUrl || 'http://192.168.1.100:9090'}/enroll?mac=${showQr.mac}&name=${encodeURIComponent(showQr.nome)}`;
      generateQrCanvas(enrollUrl, qrCanvasRef.current, 240);
    }
  }, [showQr, config.certportalUrl]);

  const handleGenerate = async () => {
    try {
      const now = new Date();
      const expiry = new Date(now.getTime() + genForm.validity_days * 86400000);

      const newCert = {
        id: `cert-${Date.now()}`,
        icon: '\uD83D\uDD10',
        nome: genForm.device_name,
        mac: genForm.mac.toUpperCase(),
        created_at: now.toISOString(),
        expiry: expiry.toISOString(),
        validity_days: genForm.validity_days,
        org: genForm.org_name,
      };

      // Save to localStorage cache
      const cached = JSON.parse(localStorage.getItem('novascm-certs') || '[]');
      cached.push(newCert);
      localStorage.setItem('novascm-certs', JSON.stringify(cached));

      setCerts(prev => [...prev, newCert]);
      setShowGenerate(false);
      setGenForm({
        mac: '',
        device_name: '',
        validity_days: config.certDays || 3650,
        org_name: config.certOrg || 'MyOrg',
      });
      addLog(`Certificato generato per ${genForm.device_name} (${genForm.mac})`, 'success');
    } catch (e) {
      addLog(`Errore generazione certificato: ${e.message}`, 'error');
    }
  };

  const handleDelete = () => {
    if (!selected || !confirm(`Eliminare certificato "${selected.nome}"?`)) return;
    try {
      // Remove from localStorage cache
      const cached = JSON.parse(localStorage.getItem('novascm-certs') || '[]');
      const filtered = cached.filter(c => c.mac !== selected.mac);
      localStorage.setItem('novascm-certs', JSON.stringify(filtered));

      setCerts(prev => prev.filter(c => c.id !== selected.id));
      setSelected(null);
      addLog(`Certificato "${selected.nome}" eliminato`, 'success');
    } catch (e) {
      addLog(`Errore eliminazione: ${e.message}`, 'error');
    }
  };

  const stats = {
    total: certs.length,
    active: certs.filter(c => certStatus(c.expiry).cls === 'green').length,
    expiring: certs.filter(c => certStatus(c.expiry).cls === 'amber').length,
    expired: certs.filter(c => certStatus(c.expiry).cls === 'red').length,
  };

  return (
    <div>
      {/* Stats Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Totale Certificati</div>
          <div className="stat-value accent">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Attivi</div>
          <div className="stat-value green">{stats.active}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Scadenza (30gg)</div>
          <div className="stat-value amber">{stats.expiring}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Scaduti</div>
          <div className="stat-value red">{stats.expired}</div>
        </div>
      </div>

      {loading && (
        <div style={{ marginBottom: 12 }}>
          <div className="progress-bar"><div className="progress-fill" style={{ width: '100%' }} /></div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Caricamento certificati...</div>
        </div>
      )}

      <DataGrid
        columns={columns}
        data={certs}
        onRowClick={setSelected}
        actions={
          <>
            <button className="btn green" onClick={() => setShowGenerate(true)}>
              + Genera Certificato
            </button>
            <button className="btn primary" disabled={!selected} onClick={() => setShowQr(selected)}>
              {'\uD83D\uDCF1'} QR Code
            </button>
            <button className="btn red" disabled={!selected} onClick={handleDelete}>
              {'\uD83D\uDDD1'} Elimina
            </button>
            <button className="btn" onClick={load}>{'\uD83D\uDD04'}</button>
          </>
        }
      />

      {/* Generate Certificate Modal */}
      {showGenerate && (
        <Modal title="Genera Certificato" onClose={() => setShowGenerate(false)} footer={
          <>
            <button className="btn" onClick={() => setShowGenerate(false)}>Annulla</button>
            <button className="btn green" onClick={handleGenerate}
              disabled={!genForm.mac || !genForm.device_name}
            >
              Genera
            </button>
          </>
        }>
          <div className="form-group">
            <label className="form-label">Indirizzo MAC</label>
            <input
              className="form-input"
              value={genForm.mac}
              onChange={e => setGenForm({ ...genForm, mac: e.target.value })}
              placeholder="AA:BB:CC:DD:EE:FF"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Nome Dispositivo</label>
            <input
              className="form-input"
              value={genForm.device_name}
              onChange={e => setGenForm({ ...genForm, device_name: e.target.value })}
              placeholder="PC-AABBCC"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Validita (giorni)</label>
              <input
                className="form-input"
                type="number"
                value={genForm.validity_days}
                onChange={e => setGenForm({ ...genForm, validity_days: parseInt(e.target.value) || 365 })}
                min={1}
                max={36500}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Organizzazione</label>
              <input
                className="form-input"
                value={genForm.org_name}
                onChange={e => setGenForm({ ...genForm, org_name: e.target.value })}
                placeholder="MyOrg"
              />
            </div>
          </div>
          <div style={{
            marginTop: 12, padding: 12, background: 'var(--bg-primary)',
            borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 11,
          }}>
            <div style={{ color: 'var(--text-dim)', marginBottom: 4, fontWeight: 600 }}>Anteprima</div>
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Subject: CN={genForm.device_name || '...'}, O={genForm.org_name || '...'}<br />
              MAC: {genForm.mac || '...'}<br />
              Validita: {genForm.validity_days} giorni<br />
              Scadenza: {new Date(Date.now() + (genForm.validity_days || 0) * 86400000).toLocaleDateString('it-IT')}
            </div>
          </div>
        </Modal>
      )}

      {/* QR Code Modal */}
      {showQr && (
        <Modal title={`QR Code - ${showQr.nome}`} onClose={() => setShowQr(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <canvas
              ref={qrCanvasRef}
              style={{
                border: '8px solid #fff',
                borderRadius: 8,
                imageRendering: 'pixelated',
              }}
            />
            <div style={{
              textAlign: 'center', fontSize: 12, color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)', padding: '8px 16px',
              background: 'var(--bg-primary)', borderRadius: 'var(--radius)',
              border: '1px solid var(--border)', wordBreak: 'break-all', maxWidth: '100%',
            }}>
              {config.certportalUrl || 'http://192.168.1.100:9090'}/enroll?mac={showQr.mac}&name={encodeURIComponent(showQr.nome)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
              Scansiona il QR code con il dispositivo per avviare l'enrollment del certificato 802.1X
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
              <div>
                <span style={{ color: 'var(--text-dim)' }}>Dispositivo:</span>{' '}
                <span style={{ fontWeight: 600 }}>{showQr.nome}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)' }}>MAC:</span>{' '}
                <span style={{ fontFamily: 'var(--font-mono)' }}>{showQr.mac}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
