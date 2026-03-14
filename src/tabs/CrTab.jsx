import React, { useState, useEffect, useCallback } from 'react';
import DataGrid from '../components/DataGrid';
import Modal from '../components/Modal';
import * as api from '../services/api';

const STATUS_MAP = {
  open: { label: 'Aperta', color: 'amber' },
  in_progress: { label: 'In Corso', color: 'blue' },
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
  'WinSCP.WinSCP',
];

function renderStatus(v) {
  const s = STATUS_MAP[v] || { label: v || 'N/D', color: 'muted' };
  return <span className={`tag ${s.color}`}>{s.label}</span>;
}

const columns = [
  { key: 'id', label: 'ID', width: 50 },
  { key: 'pc_name', label: 'PC Name' },
  { key: 'domain', label: 'Dominio', width: 180 },
  { key: 'ou', label: 'OU', width: 160 },
  { key: 'assigned_user', label: 'Utente', width: 120 },
  {
    key: 'software', label: 'Software', width: 100,
    render: (v) => {
      const list = Array.isArray(v) ? v : [];
      return <span className="tag blue">{list.length}</span>;
    },
  },
  { key: 'status', label: 'Stato', width: 110, render: renderStatus },
  {
    key: 'created_at', label: 'Creata', width: 150,
    render: (v) => v ? new Date(v).toLocaleString('it-IT') : '',
  },
];

const EMPTY_CR = {
  pc_name: '',
  assigned_user: '',
  domain: 'corp.polariscore.it',
  ou: 'OU=Workstations,DC=corp,DC=polariscore,DC=it',
  dc_ip: '192.168.10.199',
  join_user: 'Administrator',
  join_pass: '',
  admin_pass: '',
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

  const [showNew, setShowNew] = useState(false);
  const [showXml, setShowXml] = useState(false);
  const [xmlContent, setXmlContent] = useState('');

  const [form, setForm] = useState({ ...EMPTY_CR });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getCrList();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      addLog(`Errore caricamento CR: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  const loadWorkflows = useCallback(async () => {
    try {
      const data = await api.getWorkflows();
      setWorkflows(Array.isArray(data) ? data : data?.workflows || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    loadWorkflows();
  }, [load, loadWorkflows]);

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
      await load();
    } catch (e) {
      addLog(`Errore cambio stato: ${e.message}`, 'error');
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Eliminare la CR per "${selected.pc_name}"?`)) return;
    try {
      await api.deleteCr(selected.id);
      addLog(`CR eliminata: ${selected.pc_name}`, 'success');
      setSelected(null);
      await load();
    } catch (e) {
      addLog(`Errore eliminazione: ${e.message}`, 'error');
    }
  };

  const handleViewXml = async () => {
    if (!selected) return;
    try {
      const xml = await api.getCrXml(selected.pc_name);
      setXmlContent(typeof xml === 'string' ? xml : xml?.xml || JSON.stringify(xml, null, 2));
      setShowXml(true);
    } catch (e) {
      addLog(`Errore caricamento XML: ${e.message}`, 'error');
    }
  };

  const stats = {
    total: items.length,
    open: items.filter(c => c.status === 'open').length,
    in_progress: items.filter(c => c.status === 'in_progress').length,
    completed: items.filter(c => c.status === 'completed').length,
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
          <div className="stat-value amber">{stats.open}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Corso</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{stats.in_progress}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completate</div>
          <div className="stat-value green">{stats.completed}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 12, padding: '8px 12px',
        background: 'var(--bg-surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      }}>
        <button className="btn primary" onClick={() => setShowNew(true)}>+ Nuova CR</button>
        <button className="btn amber" onClick={() => handleSetStatus('in_progress')} disabled={!selected || selected.status !== 'open'}>
          {'\u25B6'} In Corso
        </button>
        <button className="btn green" onClick={() => handleSetStatus('completed')} disabled={!selected || selected.status === 'completed'}>
          {'\u2713'} Completa
        </button>
        <button className="btn" onClick={handleViewXml} disabled={!selected}>
          {'\uD83D\uDCC4'} Visualizza XML
        </button>
        <button className="btn red" onClick={handleDelete} disabled={!selected}>
          {'\uD83D\uDDD1'} Elimina
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn" onClick={load}>{'\uD83D\uDD04'} Aggiorna</button>
        </div>
      </div>

      {/* DataGrid */}
      <DataGrid
        columns={columns}
        data={items}
        loading={loading}
        onRowClick={setSelected}
        emptyMessage="Nessuna Change Request"
      />

      {/* New CR Modal */}
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
              <label className="form-label">Nome PC</label>
              <input className="form-input" value={form.pc_name} onChange={e => updateForm('pc_name', e.target.value)} placeholder="PC-DEPLOY-001" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Utente Assegnato</label>
              <input className="form-input" value={form.assigned_user} onChange={e => updateForm('assigned_user', e.target.value)} placeholder="mario.rossi" />
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

          {/* CREDENZIALI */}
          <div className="section-title" style={{ marginTop: 16 }}>Credenziali</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Admin Password</label>
              <input className="form-input" type="password" value={form.admin_pass} onChange={e => updateForm('admin_pass', e.target.value)} />
            </div>
            <div />
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

      {/* XML Viewer Modal */}
      {showXml && (
        <Modal
          title={`autounattend.xml - ${selected?.pc_name}`}
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
    </div>
  );
}
