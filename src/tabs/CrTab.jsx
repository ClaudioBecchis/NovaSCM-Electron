import React, { useState, useEffect, useCallback, useRef } from 'react';
import DataGrid from '../components/DataGrid';
import Modal from '../components/Modal';
import * as api from '../services/api';

const STATUS_MAP = {
  open: { label: 'Aperta', color: 'muted' },
  pending: { label: 'In Attesa', color: 'muted' },
  in_progress: { label: 'In Corso', color: 'amber' },
  completed: { label: 'Completata', color: 'green' },
  failed: { label: 'Fallita', color: 'red' },
};

const COMMON_SOFTWARE = [
  'Mozilla.Firefox',
  'Google.Chrome',
  'VideoLAN.VLC',
  '7zip.7zip',
  'Notepad++.Notepad++',
  'Microsoft.VisualStudioCode',
  'Adobe.Acrobat.Reader.64-bit',
  'TheDocumentFoundation.LibreOffice',
  'Microsoft.PowerToys',
];

function renderStatus(v) {
  const s = STATUS_MAP[v] || { label: v || 'N/D', color: 'muted' };
  return <span className={`tag ${s.color}`}>{s.label}</span>;
}

const columns = [
  { key: 'id', label: 'ID', width: 50 },
  { key: 'pc_name', label: 'PC Name' },
  { key: 'status', label: 'Stato', width: 110, render: renderStatus },
  { key: 'domain', label: 'Dominio', width: 180 },
  {
    key: 'created_at', label: 'Creata', width: 160,
    render: (v) => v ? new Date(v).toLocaleString('it-IT') : '',
  },
  {
    key: 'workflow_id', label: 'Workflow', width: 100,
    render: (v) => v ? <span className="tag blue">WF-{v}</span> : <span style={{ color: 'var(--text-dim)' }}>-</span>,
  },
];

const EMPTY_CR = {
  pc_name: '',
  mac_address: '',
  admin_pass: '',
  domain: 'corp.example.com',
  join_user: 'Administrator',
  join_pass: '',
  ou: 'OU=Workstations,DC=corp,DC=polariscore,DC=it',
  dc_ip: '192.168.1.199',
  assigned_user: '',
  software: [],
  custom_software: '',
  workflow_id: '',
  notes: '',
};

export default function CrTab({ addLog }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [error, setError] = useState(false);

  // Modals
  const [showNew, setShowNew] = useState(false);
  const [showXml, setShowXml] = useState(false);
  const [xmlContent, setXmlContent] = useState('');
  const [showDetail, setShowDetail] = useState(null);
  const [detailSteps, setDetailSteps] = useState([]);
  const [showStatusChange, setShowStatusChange] = useState(null);
  const [newStatus, setNewStatus] = useState('');

  const [form, setForm] = useState({ ...EMPTY_CR });
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getCrList();
      setItems(Array.isArray(data) ? data : []);
      setError(false);
    } catch (e) {
      setError(true);
      addLog(`Errore caricamento CR: ${e.message}`, 'error');
    }
  }, [addLog]);

  const loadWorkflows = useCallback(async () => {
    try {
      const data = await api.getWorkflows();
      setWorkflows(Array.isArray(data) ? data : data?.workflows || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([load(), loadWorkflows()]).finally(() => setLoading(false));
  }, [load, loadWorkflows]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    timerRef.current = setInterval(load, 15000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const updateForm = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const toggleSoftware = (pkgId) => {
    setForm(prev => {
      const list = [...(prev.software || [])];
      const idx = list.indexOf(pkgId);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(pkgId);
      return { ...prev, software: list };
    });
  };

  const handleCreate = async () => {
    if (!form.pc_name.trim()) return;
    const payload = { ...form };
    // Merge custom software
    if (payload.custom_software) {
      const extra = payload.custom_software.split('\n').map(s => s.trim()).filter(Boolean);
      payload.software = [...(payload.software || []), ...extra];
    }
    delete payload.custom_software;
    if (payload.workflow_id) payload.workflow_id = parseInt(payload.workflow_id);
    else delete payload.workflow_id;
    // Remove empty optional fields
    if (!payload.mac_address) delete payload.mac_address;

    try {
      await api.createCr(payload);
      addLog(`CR creata per ${form.pc_name}`, 'success');
      setShowNew(false);
      setForm({ ...EMPTY_CR });
      await load();
    } catch (e) {
      addLog(`Errore creazione CR: ${e.message}`, 'error');
    }
  };

  const handleSetStatus = async (status) => {
    if (!selected) return;
    try {
      await api.setCrStatus(selected.id, status);
      addLog(`CR ${selected.pc_name} -> ${status}`, 'success');
      setShowStatusChange(null);
      setSelected(null);
      await load();
    } catch (e) {
      addLog(`Errore cambio stato: ${e.message}`, 'error');
    }
  };

  const handleDelete = async (row) => {
    const target = row || selected;
    if (!target) return;
    if (!confirm(`Eliminare la CR per "${target.pc_name}"?`)) return;
    try {
      await api.deleteCr(target.id);
      addLog(`CR eliminata: ${target.pc_name}`, 'success');
      setSelected(null);
      await load();
    } catch (e) {
      addLog(`Errore eliminazione: ${e.message}`, 'error');
    }
  };

  const handleViewXml = async (row) => {
    const target = row || selected;
    if (!target) return;
    try {
      const xml = await api.getCrXml(target.pc_name);
      setXmlContent(typeof xml === 'string' ? xml : xml?.xml || JSON.stringify(xml, null, 2));
      setShowXml(true);
    } catch (e) {
      addLog(`Errore caricamento XML: ${e.message}`, 'error');
    }
  };

  const openDetail = async (row) => {
    const target = row || selected;
    if (!target) return;
    setShowDetail(target);
    setDetailSteps([]);
    try {
      const data = await api.getCrSteps(target.id);
      // API returns { items: [...] } or { steps: [...] } or array
      const steps = data?.items || data?.steps || (Array.isArray(data) ? data : []);
      setDetailSteps(steps);
    } catch (e) {
      addLog(`Errore caricamento steps: ${e.message}`, 'error');
    }
  };

  const openStatusChange = (row) => {
    const target = row || selected;
    if (!target) return;
    setShowStatusChange(target);
    setNewStatus(target.status || 'open');
  };

  const stats = {
    total: items.length,
    open: items.filter(c => c.status === 'open' || c.status === 'pending').length,
    in_progress: items.filter(c => c.status === 'in_progress').length,
    completed: items.filter(c => c.status === 'completed').length,
    failed: items.filter(c => c.status === 'failed').length,
  };

  const getWorkflowName = (wfId) => {
    const wf = workflows.find(w => w.id === wfId);
    return wf ? wf.nome : null;
  };

  return (
    <div>
      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Totale CR</div>
          <div className="stat-value accent">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Aperte</div>
          <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{stats.open}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Corso</div>
          <div className="stat-value amber">{stats.in_progress}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completate</div>
          <div className="stat-value green">{stats.completed}</div>
        </div>
        {stats.failed > 0 && (
          <div className="stat-card">
            <div className="stat-label">Fallite</div>
            <div className="stat-value red">{stats.failed}</div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && items.length === 0 && (
        <div style={{
          textAlign: 'center', padding: 32, color: 'var(--text-dim)', fontSize: 13,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', marginBottom: 12,
        }}>
          Server non raggiungibile. I dati verranno caricati automaticamente quando il server torna online.
        </div>
      )}

      {/* DataGrid with context menu and actions toolbar */}
      <DataGrid
        columns={columns}
        data={items}
        loading={loading}
        onRowClick={setSelected}
        onRowDoubleClick={openDetail}
        selectable
        emptyMessage="Nessuna Change Request"
        contextMenu={[
          { label: 'Visualizza Dettagli', icon: '\uD83D\uDD0D', onClick: openDetail },
          { label: 'Cambia Stato', icon: '\u270F\uFE0F', onClick: openStatusChange },
          { label: 'Visualizza XML', icon: '\uD83D\uDCC4', onClick: handleViewXml },
          { divider: true },
          { label: 'Elimina', icon: '\uD83D\uDDD1', onClick: handleDelete },
        ]}
        actions={
          <>
            <button className="btn primary" onClick={() => setShowNew(true)}>+ Nuova CR</button>
            <button className="btn" onClick={() => openDetail(selected)} disabled={!selected}>{'\uD83D\uDD0D'} Dettagli</button>
            <button className="btn amber" onClick={() => openStatusChange(selected)} disabled={!selected}>{'\u270F\uFE0F'} Stato</button>
            <button className="btn" onClick={() => handleViewXml(selected)} disabled={!selected}>{'\uD83D\uDCC4'} XML</button>
            <button className="btn red" onClick={() => handleDelete(selected)} disabled={!selected}>{'\uD83D\uDDD1'} Elimina</button>
            <button className="btn" onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}>{'\uD83D\uDD04'} Aggiorna</button>
          </>
        }
      />

      {/* ═══ New CR Modal ═══ */}
      {showNew && (
        <Modal
          title="Nuova Change Request"
          onClose={() => setShowNew(false)}
          wide
          footer={
            <>
              <button className="btn" onClick={() => setShowNew(false)}>Annulla</button>
              <button className="btn primary" onClick={handleCreate} disabled={!form.pc_name.trim()}>Crea CR</button>
            </>
          }
        >
          {/* INFORMAZIONI PC */}
          <div className="section-title">Informazioni PC</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nome PC *</label>
              <input className="form-input" value={form.pc_name} onChange={e => updateForm('pc_name', e.target.value)} placeholder="PC-DEPLOY-001" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">MAC Address</label>
              <input className="form-input" value={form.mac_address} onChange={e => updateForm('mac_address', e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Utente Assegnato</label>
              <input className="form-input" value={form.assigned_user} onChange={e => updateForm('assigned_user', e.target.value)} placeholder="mario.rossi" />
            </div>
            <div className="form-group">
              <label className="form-label">Admin Password</label>
              <input className="form-input" type="password" value={form.admin_pass} onChange={e => updateForm('admin_pass', e.target.value)} />
            </div>
          </div>

          {/* DOMINIO */}
          <div className="section-title" style={{ marginTop: 16 }}>Dominio</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Dominio</label>
              <input className="form-input" value={form.domain} onChange={e => updateForm('domain', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">OU</label>
              <input className="form-input" value={form.ou} onChange={e => updateForm('ou', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">DC IP</label>
              <input className="form-input" value={form.dc_ip} onChange={e => updateForm('dc_ip', e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Join User</label>
              <input className="form-input" value={form.join_user} onChange={e => updateForm('join_user', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Join Password</label>
              <input className="form-input" type="password" value={form.join_pass} onChange={e => updateForm('join_pass', e.target.value)} />
            </div>
          </div>

          {/* SOFTWARE */}
          <div className="section-title" style={{ marginTop: 16 }}>Software</div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 6, marginBottom: 12,
          }}>
            {COMMON_SOFTWARE.map(pkg => (
              <label key={pkg} className="form-check">
                <input
                  type="checkbox"
                  checked={(form.software || []).includes(pkg)}
                  onChange={() => toggleSoftware(pkg)}
                />
                <span style={{ fontSize: 12 }}>{pkg}</span>
              </label>
            ))}
          </div>
          <div className="form-group">
            <label className="form-label">Software Aggiuntivo (Winget ID, uno per riga)</label>
            <textarea
              className="form-textarea"
              value={form.custom_software}
              onChange={e => updateForm('custom_software', e.target.value)}
              placeholder={'es.\nMicrosoft.Office\nSlack.Slack'}
              style={{ minHeight: 60 }}
            />
          </div>

          {/* WORKFLOW */}
          <div className="section-title" style={{ marginTop: 16 }}>Workflow</div>
          <div className="form-group">
            <label className="form-label">Workflow (opzionale)</label>
            <select className="form-select" value={form.workflow_id} onChange={e => updateForm('workflow_id', e.target.value)}>
              <option value="">-- Nessun Workflow --</option>
              {workflows.map(wf => (
                <option key={wf.id} value={wf.id}>{wf.nome} (v{wf.versione || '1.0'})</option>
              ))}
            </select>
          </div>

          {/* NOTE */}
          <div className="section-title" style={{ marginTop: 16 }}>Note</div>
          <div className="form-group">
            <textarea className="form-textarea" value={form.notes} onChange={e => updateForm('notes', e.target.value)} placeholder="Note opzionali..." rows={3} />
          </div>
        </Modal>
      )}

      {/* ═══ XML Viewer Modal ═══ */}
      {showXml && (
        <Modal
          title={`autounattend.xml - ${selected?.pc_name || ''}`}
          onClose={() => setShowXml(false)}
          wide
        >
          <div style={{
            background: '#0d1117',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 16,
            maxHeight: 500,
            overflowY: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.6,
            color: '#7ee787',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {xmlContent}
          </div>
        </Modal>
      )}

      {/* ═══ Detail Modal ═══ */}
      {showDetail && (
        <Modal
          title={`Dettaglio CR: ${showDetail.pc_name}`}
          onClose={() => { setShowDetail(null); setDetailSteps([]); }}
          wide
        >
          {/* CR Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <div className="section-title">Informazioni PC</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 13 }}>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>ID:</span>
                <span>{showDetail.id}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>PC Name:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{showDetail.pc_name}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Stato:</span>
                <span>{renderStatus(showDetail.status)}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Utente:</span>
                <span>{showDetail.assigned_user || '-'}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Creata:</span>
                <span>{showDetail.created_at ? new Date(showDetail.created_at).toLocaleString('it-IT') : '-'}</span>
                {showDetail.completed_at && (
                  <>
                    <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Completata:</span>
                    <span>{new Date(showDetail.completed_at).toLocaleString('it-IT')}</span>
                  </>
                )}
              </div>
            </div>
            <div>
              <div className="section-title">Dominio</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 13 }}>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Dominio:</span>
                <span>{showDetail.domain || '-'}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>OU:</span>
                <span style={{ fontSize: 11, wordBreak: 'break-all' }}>{showDetail.ou || '-'}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>DC IP:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{showDetail.dc_ip || '-'}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Workflow:</span>
                <span>{showDetail.workflow_id ? (getWorkflowName(showDetail.workflow_id) || `WF-${showDetail.workflow_id}`) : '-'}</span>
              </div>
            </div>
          </div>

          {/* Software list */}
          {Array.isArray(showDetail.software) && showDetail.software.length > 0 && (
            <>
              <div className="section-title">Software ({showDetail.software.length})</div>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16,
              }}>
                {showDetail.software.map((pkg, i) => (
                  <span key={i} className="tag blue" style={{ fontSize: 11 }}>{pkg}</span>
                ))}
              </div>
            </>
          )}

          {/* Notes */}
          {showDetail.notes && (
            <>
              <div className="section-title">Note</div>
              <div style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: 10, fontSize: 12,
                color: 'var(--text-secondary)', marginBottom: 16, whiteSpace: 'pre-wrap',
              }}>
                {showDetail.notes}
              </div>
            </>
          )}

          {/* Step Timeline */}
          {detailSteps.length > 0 && (
            <>
              <div className="section-title">Timeline Steps ({detailSteps.length})</div>
              <div style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: 12, maxHeight: 300, overflowY: 'auto',
              }}>
                {detailSteps.map((step, i) => {
                  const st = step.status || 'pending';
                  const color = st === 'completed' || st === 'done' ? 'var(--green)'
                    : st === 'running' ? 'var(--amber)'
                    : st === 'failed' || st === 'error' ? 'var(--red)'
                    : 'var(--text-dim)';
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                      borderBottom: i < detailSteps.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
                        boxShadow: st === 'running' ? `0 0 6px ${color}` : 'none',
                        animation: st === 'running' ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
                      }} />
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--text)' }}>
                        {step.step_name || step.nome || step.name || `Step ${i + 1}`}
                      </span>
                      <span style={{ fontSize: 11, color }}>{renderStatus(st)}</span>
                      {step.timestamp && (
                        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                          {new Date(step.timestamp).toLocaleString('it-IT')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {detailSteps.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)', fontSize: 12 }}>
              Nessuno step registrato per questa CR
            </div>
          )}
        </Modal>
      )}

      {/* ═══ Status Change Modal ═══ */}
      {showStatusChange && (
        <Modal
          title={`Cambia Stato: ${showStatusChange.pc_name}`}
          onClose={() => setShowStatusChange(null)}
          footer={
            <>
              <button className="btn" onClick={() => setShowStatusChange(null)}>Annulla</button>
              <button
                className="btn primary"
                onClick={() => handleSetStatus(newStatus)}
                disabled={newStatus === showStatusChange.status}
              >
                Conferma
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Stato attuale</label>
            <div style={{ marginBottom: 12 }}>{renderStatus(showStatusChange.status)}</div>
          </div>
          <div className="form-group">
            <label className="form-label">Nuovo stato</label>
            <select className="form-select" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
              <option value="open">Aperta</option>
              <option value="in_progress">In Corso</option>
              <option value="completed">Completata</option>
            </select>
          </div>
        </Modal>
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
