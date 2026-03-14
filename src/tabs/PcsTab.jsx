import React, { useState, useEffect, useCallback, useRef } from 'react';
import DataGrid from '../components/DataGrid';
import Modal from '../components/Modal';
import * as api from '../services/api';

const STATUS_CONFIG = {
  online: { label: 'Online', cls: 'green', icon: '\uD83D\uDFE2' },
  deploying: { label: 'In Deploy', cls: 'blue', icon: '\uD83D\uDD35' },
  offline: { label: 'Offline', cls: 'muted', icon: '\u26AA' },
  error: { label: 'Errore', cls: 'red', icon: '\uD83D\uDD34' },
};

function resolveStatus(cr, pw) {
  if (pw?.status === 'failed') return 'error';
  if (pw?.status === 'running' || cr?.status === 'in_progress') return 'deploying';
  if (pw?.status === 'completed' || cr?.status === 'completed') {
    // Check last_seen: if within 60 seconds consider online
    if (pw?.last_seen) {
      const diff = Date.now() - new Date(pw.last_seen).getTime();
      if (diff < 120000) return 'online';
    }
    return 'online';
  }
  return 'offline';
}

function formatLastSeen(ts) {
  if (!ts) return 'Mai';
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'Adesso';
  if (diff < 3600000) return `${Math.round(diff / 60000)} min fa`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)} ore fa`;
  return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

const columns = [
  { key: 'statusIcon', label: '', width: 30 },
  { key: 'pc_name', label: 'Nome PC' },
  { key: 'ip', label: 'IP', width: 130, render: v => (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{v || 'N/D'}</span>
  )},
  { key: 'os', label: 'OS', width: 100 },
  { key: 'domain', label: 'Dominio', width: 160 },
  { key: 'workflow_nome', label: 'Workflow', width: 150 },
  { key: 'agent', label: 'Agente', width: 120, render: v => (
    v ? <span className="tag green" style={{ fontSize: 9 }}>{v}</span>
      : <span className="tag muted" style={{ fontSize: 9 }}>Non installato</span>
  )},
  { key: 'statusLabel', label: 'Stato', width: 110, render: (_, row) => {
    const cfg = STATUS_CONFIG[row.pcStatus] || STATUS_CONFIG.offline;
    return <span className={`tag ${cfg.cls}`}>{cfg.label}</span>;
  }},
  { key: 'last_seen', label: 'Ultimo Contatto', width: 140, render: v => (
    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatLastSeen(v)}</span>
  )},
];

const AGENT_INSTALL_CMD = (apiUrl, apiKey) =>
  `# NovaSCM Agent Install (PowerShell)
$ProgressPreference = 'SilentlyContinue'
$url = "${apiUrl}/api/download/agent"
$headers = @{ "X-Api-Key" = "${apiKey}" }
$outPath = "$env:TEMP\\NovaSCM-Agent-Setup.exe"
Invoke-WebRequest -Uri $url -Headers $headers -OutFile $outPath
Start-Process -FilePath $outPath -ArgumentList "/S" -Wait
Write-Host "NovaSCM Agent installato." -ForegroundColor Green`;

export default function PcsTab({ addLog }) {
  const [pcs, setPcs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailPc, setDetailPc] = useState(null);
  const [showAssign, setShowAssign] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const [workflows, setWorkflows] = useState([]);
  const [assignForm, setAssignForm] = useState({ workflow_id: '' });
  const [contextMenu, setContextMenu] = useState(null);
  const refreshRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [crs, pws, wfs] = await Promise.all([
        api.getCrList(),
        api.getPcWorkflows(),
        api.getWorkflows(),
      ]);
      const crList = Array.isArray(crs) ? crs : [];
      const pwList = Array.isArray(pws) ? pws : [];
      const wfList = Array.isArray(wfs) ? wfs : [];
      setWorkflows(wfList);

      const pwMap = {};
      pwList.forEach(pw => { pwMap[pw.pc_name] = pw; });

      // Also load network scan data from localStorage
      let scanDevices = {};
      try {
        const scanData = JSON.parse(localStorage.getItem('novascm-scan-results') || '{}');
        if (scanData.devices) {
          scanData.devices.forEach(d => {
            // Try to match by hostname patterns
            scanDevices[d.ip] = d;
          });
        }
      } catch { /* ignore */ }

      const merged = crList.map(cr => {
        const pw = pwMap[cr.pc_name];
        const status = resolveStatus(cr, pw);
        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.offline;

        // Try to find matching scan device by IP
        const scanDev = pw?.ip ? scanDevices[pw.ip] : null;

        return {
          id: cr.id,
          statusIcon: cfg.icon,
          pc_name: cr.pc_name,
          ip: pw?.ip || cr.ip || '',
          os: cr.os || (scanDev?.deviceType === 'Windows' ? 'Windows' : scanDev?.deviceType === 'Linux' ? 'Linux' : ''),
          domain: cr.domain || '',
          workflow_nome: pw?.workflow_nome || '',
          workflow_id: pw?.workflow_id || null,
          agent: pw?.agent_version || cr.agent_version || null,
          pcStatus: status,
          statusLabel: cfg.label,
          last_seen: pw?.last_seen || cr.created_at,
          assigned_user: cr.assigned_user || '',
          progress: pw?.progress || 0,
          software: cr.software || [],
          notes: cr.notes || '',
          ou: cr.ou || '',
          created_at: cr.created_at,
          pw_id: pw?.id,
          scanData: scanDev,
        };
      });

      setPcs(merged);
    } catch (e) {
      addLog(`Errore caricamento PC: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  // Initial load + auto-refresh every 15 seconds
  useEffect(() => {
    load();
    refreshRef.current = setInterval(load, 15000);
    return () => clearInterval(refreshRef.current);
  }, [load]);

  // Close context menu on click
  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const handleAssignWorkflow = async () => {
    const target = detailPc || selected;
    if (!target || !assignForm.workflow_id) return;
    try {
      await api.createPcWorkflow({
        pc_name: target.pc_name,
        workflow_id: parseInt(assignForm.workflow_id),
      });
      setShowAssign(false);
      setAssignForm({ workflow_id: '' });
      load();
      addLog(`Workflow assegnato a ${target.pc_name}`, 'success');
    } catch (e) {
      addLog(`Errore assegnazione: ${e.message}`, 'error');
    }
  };

  const handleRemovePc = async () => {
    if (!selected || !confirm(`Rimuovere "${selected.pc_name}" dalla gestione?`)) return;
    try {
      // Remove the CR
      await api.deleteCr(selected.id);
      // Also remove PC workflow if exists
      if (selected.pw_id) {
        await api.deletePcWorkflow(selected.pw_id).catch(() => {});
      }
      setSelected(null);
      load();
      addLog(`PC "${selected.pc_name}" rimosso`, 'success');
    } catch (e) {
      addLog(`Errore rimozione: ${e.message}`, 'error');
    }
  };

  const openRdp = (pc) => {
    if (!pc.ip) { addLog(`Nessun IP per ${pc.pc_name}`, 'error'); return; }
    window.electronAPI?.shell?.openExternal(`mstsc /v:${pc.ip}`).catch(() => {
      window.electronAPI?.shell?.openExternal(`rdp://${pc.ip}`).catch(() => {});
    });
    addLog(`RDP verso ${pc.pc_name} (${pc.ip})`, 'info');
  };

  const handleContextMenu = (e, row) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, pc: row });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => addLog(`Copiato: ${text}`, 'success')).catch(() => {});
  };

  const config = (() => {
    try { return JSON.parse(localStorage.getItem('novascm-config') || '{}'); } catch { return {}; }
  })();

  const stats = {
    total: pcs.length,
    online: pcs.filter(p => p.pcStatus === 'online').length,
    deploying: pcs.filter(p => p.pcStatus === 'deploying').length,
    offline: pcs.filter(p => p.pcStatus === 'offline').length,
  };

  return (
    <div>
      {/* Stats Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">PC Totali</div>
          <div className="stat-value accent">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Online</div>
          <div className="stat-value green">{stats.online}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Deploy</div>
          <div className="stat-value amber">{stats.deploying}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Offline</div>
          <div className="stat-value">{stats.offline}</div>
        </div>
      </div>

      {loading && pcs.length === 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="progress-bar"><div className="progress-fill" style={{ width: '100%' }} /></div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Caricamento PC...</div>
        </div>
      )}

      {/* DataGrid with context menu */}
      <div onContextMenu={e => {
        const tr = e.target.closest('tr');
        if (!tr) return;
        const name = tr.querySelector('td:nth-child(2)')?.textContent;
        const pc = pcs.find(p => p.pc_name === name);
        if (pc) handleContextMenu(e, pc);
      }}>
        <DataGrid
          columns={columns}
          data={pcs}
          onRowClick={setSelected}
          onRowDouble={(row) => setDetailPc(row)}
          actions={
            <>
              <button className="btn green" disabled={!selected} onClick={() => { setShowAssign(true); }}>
                {'\uD83D\uDD17'} Assegna Workflow
              </button>
              <button className="btn primary" disabled={!selected} onClick={() => setShowAgent(true)}>
                {'\uD83D\uDCE5'} Installa Agente
              </button>
              <button className="btn red" disabled={!selected} onClick={handleRemovePc}>
                {'\uD83D\uDDD1'} Rimuovi
              </button>
              <button className="btn" onClick={load}>{'\uD83D\uDD04'}</button>
            </>
          }
        />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', top: contextMenu.y, left: contextMenu.x,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 2000, minWidth: 200, padding: '4px 0', fontSize: 12,
          }}
          onClick={() => setContextMenu(null)}
        >
          <div style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text)' }}
            onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
            onClick={() => { setSelected(contextMenu.pc); setShowAssign(true); }}
          >
            {'\uD83D\uDD17'} Assegna Workflow
          </div>
          {contextMenu.pc.ip && (
            <div style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text)' }}
              onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.target.style.background = 'transparent'}
              onClick={() => openRdp(contextMenu.pc)}
            >
              {'\uD83D\uDCBB'} RDP
            </div>
          )}
          <div style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text)' }}
            onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
            onClick={() => { setSelected(contextMenu.pc); setShowAgent(true); }}
          >
            {'\uD83D\uDCE5'} Installa Agente
          </div>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <div style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--red)' }}
            onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
            onClick={() => { setSelected(contextMenu.pc); handleRemovePc(); }}
          >
            {'\uD83D\uDDD1'} Rimuovi
          </div>
        </div>
      )}

      {/* PC Detail Modal */}
      {detailPc && (
        <Modal title={`${STATUS_CONFIG[detailPc.pcStatus]?.icon || ''} ${detailPc.pc_name}`} onClose={() => setDetailPc(null)} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Left column */}
            <div>
              <div className="section-title">Informazioni PC</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 13 }}>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Nome:</span>
                <span style={{ fontWeight: 600 }}>{detailPc.pc_name}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>IP:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{detailPc.ip || 'N/D'}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>OS:</span>
                <span>{detailPc.os || 'N/D'}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Dominio:</span>
                <span>{detailPc.domain || 'N/D'}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>OU:</span>
                <span style={{ fontSize: 11 }}>{detailPc.ou || 'N/D'}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Utente:</span>
                <span>{detailPc.assigned_user || 'N/D'}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Stato:</span>
                <span className={`tag ${STATUS_CONFIG[detailPc.pcStatus]?.cls || 'muted'}`}>
                  {STATUS_CONFIG[detailPc.pcStatus]?.label || 'Sconosciuto'}
                </span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Agente:</span>
                <span>{detailPc.agent || <span style={{ color: 'var(--text-dim)' }}>Non installato</span>}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Ultimo Contatto:</span>
                <span style={{ fontSize: 11 }}>{formatLastSeen(detailPc.last_seen)}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Creato:</span>
                <span style={{ fontSize: 11 }}>{detailPc.created_at ? new Date(detailPc.created_at).toLocaleString('it-IT') : 'N/D'}</span>
              </div>

              {/* Scan data (if available) */}
              {detailPc.scanData && (
                <>
                  <div className="section-title" style={{ marginTop: 16 }}>Dati Scansione Rete</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-dim)' }}>MAC:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{detailPc.scanData.mac || 'N/D'}</span>
                    <span style={{ color: 'var(--text-dim)' }}>Vendor:</span>
                    <span>{detailPc.scanData.vendor || 'N/D'}</span>
                    <span style={{ color: 'var(--text-dim)' }}>Porte:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{detailPc.scanData.ports?.join(', ') || 'N/D'}</span>
                  </div>
                </>
              )}
            </div>

            {/* Right column */}
            <div>
              {/* Workflow assignment */}
              <div className="section-title">Workflow Assegnato</div>
              {detailPc.workflow_nome ? (
                <div style={{
                  padding: 12, background: 'var(--bg-primary)', borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)', marginBottom: 12,
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{detailPc.workflow_nome}</div>
                  {detailPc.progress > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div className="progress-bar">
                        <div className={`progress-fill ${detailPc.pcStatus === 'error' ? 'red' : detailPc.progress === 100 ? 'green' : ''}`}
                          style={{ width: `${detailPc.progress}%` }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{detailPc.progress}%</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 12 }}>Nessun workflow assegnato</div>
              )}

              {/* Software installed */}
              <div className="section-title">Software</div>
              {detailPc.software?.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                  {detailPc.software.map(s => (
                    <span key={s} className="tag blue" style={{ fontSize: 10 }}>{s}</span>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 12 }}>Nessun software assegnato</div>
              )}

              {/* Notes */}
              {detailPc.notes && (
                <>
                  <div className="section-title">Note</div>
                  <div style={{
                    padding: 10, background: 'var(--bg-primary)', borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {detailPc.notes}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <button className="btn green" onClick={() => { setSelected(detailPc); setShowAssign(true); }}>
              {'\uD83D\uDD17'} Assegna Workflow
            </button>
            <button className="btn primary" onClick={() => { setSelected(detailPc); setShowAgent(true); }}>
              {'\uD83D\uDCE5'} Installa Agente
            </button>
            {detailPc.ip && (
              <button className="btn" onClick={() => openRdp(detailPc)}>
                {'\uD83D\uDCBB'} RDP
              </button>
            )}
            {detailPc.ip && (
              <button className="btn" onClick={() => copyToClipboard(detailPc.ip)}>
                {'\uD83D\uDCCB'} Copia IP
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* Assign Workflow Modal */}
      {showAssign && (
        <Modal title={`Assegna Workflow - ${(detailPc || selected)?.pc_name}`} onClose={() => setShowAssign(false)} footer={
          <>
            <button className="btn" onClick={() => setShowAssign(false)}>Annulla</button>
            <button className="btn green" onClick={handleAssignWorkflow} disabled={!assignForm.workflow_id}>
              Assegna
            </button>
          </>
        }>
          <div className="form-group">
            <label className="form-label">Workflow</label>
            <select className="form-select" value={assignForm.workflow_id}
              onChange={e => setAssignForm({ workflow_id: e.target.value })}>
              <option value="">-- Seleziona Workflow --</option>
              {workflows.map(w => (
                <option key={w.id} value={w.id}>{w.nome} (v{w.versione})</option>
              ))}
            </select>
          </div>
          {assignForm.workflow_id && (
            <div style={{
              padding: 10, background: 'var(--bg-primary)', borderRadius: 'var(--radius)',
              border: '1px solid var(--border)', fontSize: 12,
            }}>
              <span style={{ color: 'var(--text-dim)' }}>PC:</span>{' '}
              <span style={{ fontWeight: 600 }}>{(detailPc || selected)?.pc_name}</span>
              <br />
              <span style={{ color: 'var(--text-dim)' }}>Workflow:</span>{' '}
              <span style={{ fontWeight: 600 }}>{workflows.find(w => w.id === parseInt(assignForm.workflow_id))?.nome}</span>
            </div>
          )}
        </Modal>
      )}

      {/* Agent Install Modal */}
      {showAgent && (
        <Modal title={`Installa Agente - ${(detailPc || selected)?.pc_name}`} onClose={() => setShowAgent(false)} wide>
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            Esegui questo comando PowerShell (come Amministratore) sul PC di destinazione per installare l'agente NovaSCM:
          </div>
          <pre style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)',
            background: 'var(--bg-primary)', padding: 16, borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', overflow: 'auto', maxHeight: 300,
            whiteSpace: 'pre-wrap', userSelect: 'text',
          }}>
            {AGENT_INSTALL_CMD(config.apiUrl || 'http://192.168.1.100:9091', config.apiKey || '')}
          </pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn primary" onClick={() => {
              copyToClipboard(AGENT_INSTALL_CMD(config.apiUrl || 'http://192.168.1.100:9091', config.apiKey || ''));
            }}>
              {'\uD83D\uDCCB'} Copia Comando
            </button>
            <button className="btn" onClick={() => setShowAgent(false)}>Chiudi</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
