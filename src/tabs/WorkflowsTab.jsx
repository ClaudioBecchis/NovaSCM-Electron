import React, { useState, useEffect, useCallback, useRef } from 'react';
import DataGrid from '../components/DataGrid';
import Modal from '../components/Modal';
import * as api from '../services/api';

// ---------------------------------------------------------------------------
// Step types aligned with server tipi_validi + extras for UI display
// Server valid: shell_script, file_copy, reboot, message,
//   winget_install, ps_script, reg_set, windows_update,
//   apt_install, snap_install, systemd_service
// ---------------------------------------------------------------------------
const STEP_TYPES = [
  { value: 'ps_script',        label: 'PowerShell Script',   color: 'blue',   platform: 'windows' },
  { value: 'shell_script',     label: 'Shell Script',        color: 'green',  platform: 'linux' },
  { value: 'winget_install',   label: 'Winget Install',      color: 'purple', platform: 'windows' },
  { value: 'apt_install',      label: 'APT Install',         color: 'purple', platform: 'linux' },
  { value: 'snap_install',     label: 'Snap Install',        color: 'purple', platform: 'linux' },
  { value: 'file_copy',        label: 'File Copy',           color: 'amber',  platform: 'all' },
  { value: 'reg_set',          label: 'Registry Set',        color: 'blue',   platform: 'windows' },
  { value: 'reboot',           label: 'Reboot',              color: 'red',    platform: 'all' },
  { value: 'windows_update',   label: 'Windows Update',      color: 'amber',  platform: 'windows' },
  { value: 'systemd_service',  label: 'Systemd Service',     color: 'green',  platform: 'linux' },
  { value: 'message',          label: 'Message',             color: 'muted',  platform: 'all' },
];

const PARAM_HINTS = {
  ps_script:        '{ "script_path": "C:\\\\Scripts\\\\setup.ps1", "args": "-Force" }',
  shell_script:     '{ "script_path": "/opt/scripts/setup.sh", "args": "--all" }',
  winget_install:   '{ "package_id": "Mozilla.Firefox", "version": "", "scope": "machine" }',
  apt_install:      '{ "packages": ["nginx", "curl"] }',
  snap_install:     '{ "snap_name": "code", "classic": true }',
  file_copy:        '{ "source": "\\\\\\\\server\\\\share\\\\file.exe", "dest": "C:\\\\Program Files\\\\app.exe" }',
  reg_set:          '{ "path": "HKLM:\\\\SOFTWARE\\\\Policies", "name": "Value", "type": "DWORD", "data": "1" }',
  reboot:           '{ "delay_seconds": 5, "message": "Riavvio in corso..." }',
  windows_update:   '{ "categories": ["Security", "Critical"], "reboot": true }',
  systemd_service:  '{ "service": "nginx", "action": "restart", "enable": true }',
  message:          '{ "text": "Step completato", "level": "info" }',
};

function getStepTypeInfo(type) {
  return STEP_TYPES.find(t => t.value === type) || { value: type, label: type, color: 'muted', platform: 'all' };
}

function platformBadge(platform) {
  if (!platform || platform === 'all') return null;
  const colors = { windows: '#0078d4', linux: '#e95420' };
  const labels = { windows: 'WIN', linux: 'LNX' };
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 9,
      fontWeight: 700,
      padding: '1px 5px',
      borderRadius: 3,
      background: colors[platform] || 'var(--bg-surface3)',
      color: '#fff',
      marginLeft: 4,
      verticalAlign: 'middle',
      letterSpacing: 0.5,
    }}>
      {labels[platform] || platform.toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DataGrid columns for workflow list
// ---------------------------------------------------------------------------
const wfColumns = [
  { key: 'id', label: 'ID', width: 50 },
  { key: 'nome', label: 'Nome' },
  {
    key: 'step_count', label: 'Steps', width: 70,
    render: (v) => <span className="tag blue">{v || 0}</span>,
  },
  {
    key: 'versione', label: 'Versione', width: 70,
    render: (v) => <span style={{ color: 'var(--text-muted)' }}>v{v || 1}</span>,
  },
  {
    key: 'created_at', label: 'Creato', width: 140,
    render: (v) => {
      if (!v) return '';
      try {
        const d = new Date(v);
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
          + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      } catch { return v; }
    },
  },
];

// ---------------------------------------------------------------------------
// WorkflowsTab Component
// ---------------------------------------------------------------------------
export default function WorkflowsTab({ addLog }) {
  // Workflow list state
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Modal visibility
  const [showNew, setShowNew] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showStep, setShowStep] = useState(false);

  // Edit state
  const [editStep, setEditStep] = useState(null);

  // Forms
  const [form, setForm] = useState({ nome: '', descrizione: '' });
  const [importJson, setImportJson] = useState('');
  const [stepForm, setStepForm] = useState({
    nome: '', tipo: 'ps_script', platform: 'all', su_errore: 'stop',
    parametri: '{}', condizione: '', timeout: 300,
  });

  // Drag reorder
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  // ── Load workflows ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getWorkflows();
      const list = Array.isArray(data) ? data : data?.workflows || [];
      // Enrich with step_count if not present
      setWorkflows(list.map(w => ({
        ...w,
        step_count: w.step_count ?? 0,
      })));
    } catch (e) {
      addLog(`Errore caricamento workflows: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  useEffect(() => { load(); }, [load]);

  // ── Load workflow detail ────────────────────────────────────────────
  const loadDetail = useCallback(async (wf) => {
    if (!wf) { setDetail(null); return; }
    setDetailLoading(true);
    try {
      const d = await api.getWorkflow(wf.id);
      setDetail(d);
      // Update step_count in list
      setWorkflows(prev => prev.map(w => w.id === wf.id ? { ...w, step_count: d.steps?.length || 0 } : w));
    } catch (e) {
      addLog(`Errore dettaglio workflow: ${e.message}`, 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [addLog]);

  // ── Create workflow ─────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.nome.trim()) return;
    try {
      await api.createWorkflow({
        nome: form.nome.trim(),
        descrizione: form.descrizione.trim(),
        versione: 1,
      });
      addLog(`Workflow "${form.nome}" creato`, 'success');
      setShowNew(false);
      setForm({ nome: '', descrizione: '' });
      await load();
    } catch (e) {
      addLog(`Errore creazione workflow: ${e.message}`, 'error');
    }
  };

  // ── Edit workflow metadata ──────────────────────────────────────────
  const openEditWorkflow = () => {
    if (!detail) return;
    setForm({ nome: detail.nome || '', descrizione: detail.descrizione || '' });
    setShowEdit(true);
  };

  const handleEditWorkflow = async () => {
    if (!detail || !form.nome.trim()) return;
    try {
      await api.updateWorkflow(detail.id, {
        nome: form.nome.trim(),
        descrizione: form.descrizione.trim(),
      });
      addLog(`Workflow "${form.nome}" aggiornato`, 'success');
      setShowEdit(false);
      await load();
      await loadDetail({ id: detail.id });
    } catch (e) {
      addLog(`Errore aggiornamento workflow: ${e.message}`, 'error');
    }
  };

  // ── Delete workflow ─────────────────────────────────────────────────
  const handleDelete = async (wf) => {
    const target = wf || selected;
    if (!target) return;
    if (!confirm(`Eliminare il workflow "${target.nome}"?`)) return;
    try {
      await api.deleteWorkflow(target.id);
      addLog(`Workflow "${target.nome}" eliminato`, 'success');
      if (selected?.id === target.id) {
        setSelected(null);
        setDetail(null);
      }
      await load();
    } catch (e) {
      addLog(`Errore eliminazione: ${e.message}`, 'error');
    }
  };

  // ── Duplicate workflow ──────────────────────────────────────────────
  const handleDuplicate = async (wf) => {
    const target = wf || selected;
    if (!target) return;
    try {
      // Export original, then import as copy
      const exported = await api.exportWorkflow(target.id);
      exported.workflow.nome = `${exported.workflow.nome} (copia)`;
      await api.importWorkflow(exported);
      addLog(`Workflow "${target.nome}" duplicato`, 'success');
      await load();
    } catch (e) {
      addLog(`Errore duplicazione: ${e.message}`, 'error');
    }
  };

  // ── Export workflow ─────────────────────────────────────────────────
  const handleExport = async (wf) => {
    const target = wf || detail;
    if (!target) return;
    try {
      const data = await api.exportWorkflow(target.id);
      const json = JSON.stringify(data, null, 2);
      if (window.electronAPI?.saveFile) {
        const path = await window.electronAPI.saveFile({
          defaultPath: `${target.nome}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (path) {
          await window.electronAPI.writeFile(path, json);
          addLog(`Workflow esportato: ${path}`, 'success');
        }
      } else {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workflow-${target.nome}.json`;
        a.click();
        URL.revokeObjectURL(url);
        addLog(`Workflow "${target.nome}" esportato`, 'success');
      }
    } catch (e) {
      addLog(`Errore esportazione: ${e.message}`, 'error');
    }
  };

  // ── Import workflow ─────────────────────────────────────────────────
  const handleImport = async () => {
    try {
      const data = JSON.parse(importJson);
      await api.importWorkflow(data);
      addLog('Workflow importato con successo', 'success');
      setShowImport(false);
      setImportJson('');
      await load();
    } catch (e) {
      addLog(`Errore importazione: ${e.message}`, 'error');
    }
  };

  const handleFileImport = async () => {
    try {
      if (window.electronAPI?.openFile) {
        const content = await window.electronAPI.openFile();
        if (content) setImportJson(content);
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (ev) => {
          const file = ev.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (re) => setImportJson(re.target.result);
          reader.readAsText(file);
        };
        input.click();
      }
    } catch (err) {
      addLog(`Errore apertura file: ${err.message}`, 'error');
    }
  };

  // ── Step editor ─────────────────────────────────────────────────────
  const openStepEditor = (step = null) => {
    if (step) {
      setEditStep(step);
      let params = step.parametri || '{}';
      if (typeof params === 'object') params = JSON.stringify(params, null, 2);
      // Try to pretty-print if it's a JSON string
      try {
        const parsed = JSON.parse(params);
        params = JSON.stringify(parsed, null, 2);
      } catch { /* keep as-is */ }
      setStepForm({
        nome: step.nome || '',
        tipo: step.tipo || 'ps_script',
        platform: step.platform || step.piattaforma || 'all',
        su_errore: step.su_errore || 'stop',
        parametri: params,
        condizione: step.condizione || '',
        timeout: step.timeout || 300,
      });
    } else {
      setEditStep(null);
      setStepForm({
        nome: '', tipo: 'ps_script', platform: 'all', su_errore: 'stop',
        parametri: PARAM_HINTS['ps_script'] || '{}', condizione: '', timeout: 300,
      });
    }
    setShowStep(true);
  };

  const handleSaveStep = async () => {
    if (!detail || !stepForm.nome.trim()) return;
    let parametri = stepForm.parametri;
    try { parametri = JSON.parse(parametri); } catch { /* keep as string */ }
    const ordine = editStep ? editStep.ordine : (detail.steps?.length || 0) + 1;
    const payload = {
      nome: stepForm.nome.trim(),
      tipo: stepForm.tipo,
      platform: stepForm.platform,
      su_errore: stepForm.su_errore,
      parametri: typeof parametri === 'string' ? parametri : JSON.stringify(parametri),
      condizione: stepForm.condizione || '',
      ordine,
    };
    try {
      if (editStep) {
        await api.updateStep(detail.id, editStep.id, payload);
        addLog(`Step "${stepForm.nome}" aggiornato`, 'success');
      } else {
        await api.createStep(detail.id, payload);
        addLog(`Step "${stepForm.nome}" aggiunto`, 'success');
      }
      setShowStep(false);
      setEditStep(null);
      await loadDetail(detail);
    } catch (e) {
      addLog(`Errore salvataggio step: ${e.message}`, 'error');
    }
  };

  const handleDeleteStep = async (step) => {
    if (!detail || !confirm(`Eliminare lo step "${step.nome}"?`)) return;
    try {
      await api.deleteStep(detail.id, step.id);
      addLog(`Step "${step.nome}" eliminato`, 'success');
      await loadDetail(detail);
    } catch (e) {
      addLog(`Errore eliminazione step: ${e.message}`, 'error');
    }
  };

  // ── Move step up/down ───────────────────────────────────────────────
  const moveStep = async (step, direction) => {
    if (!detail?.steps) return;
    const steps = [...detail.steps].sort((a, b) => a.ordine - b.ordine);
    const idx = steps.findIndex(s => s.id === step.id);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= steps.length) return;

    const other = steps[targetIdx];
    try {
      // Swap ordine values
      await api.updateStep(detail.id, step.id, { ...step, ordine: other.ordine, parametri: step.parametri });
      await api.updateStep(detail.id, other.id, { ...other, ordine: step.ordine, parametri: other.parametri });
      addLog(`Step "${step.nome}" spostato`, 'success');
      await loadDetail(detail);
    } catch (e) {
      addLog(`Errore riordino: ${e.message}`, 'error');
    }
  };

  // ── Context menu for workflow list ──────────────────────────────────
  const workflowContextMenu = [
    {
      icon: '\u270F\uFE0F',
      label: 'Modifica',
      onClick: (row) => {
        setSelected(row);
        loadDetail(row).then(() => {
          setForm({ nome: row.nome || '', descrizione: row.descrizione || '' });
          setShowEdit(true);
        });
      },
    },
    {
      icon: '\uD83D\uDCCB',
      label: 'Duplica',
      onClick: (row) => handleDuplicate(row),
    },
    {
      icon: '\uD83D\uDCE4',
      label: 'Esporta JSON',
      onClick: (row) => handleExport(row),
    },
    { divider: true },
    {
      icon: '\uD83D\uDDD1\uFE0F',
      label: 'Elimina',
      onClick: (row) => handleDelete(row),
    },
  ];

  const steps = detail?.steps?.slice().sort((a, b) => (a.ordine || 0) - (b.ordine || 0)) || [];

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 220px)' }}>

      {/* ════════════════════════════════════════════════════════════════
          LEFT PANEL — Workflow List (40%)
         ════════════════════════════════════════════════════════════════ */}
      <div style={{ width: '40%', minWidth: 380, display: 'flex', flexDirection: 'column' }}>
        <DataGrid
          columns={wfColumns}
          data={workflows}
          loading={loading}
          onRowClick={(row) => { setSelected(row); loadDetail(row); }}
          contextMenu={workflowContextMenu}
          emptyMessage="Nessun workflow"
          emptyIcon={'\u2699\uFE0F'}
          actions={
            <>
              <button className="btn primary" onClick={() => { setForm({ nome: '', descrizione: '' }); setShowNew(true); }}>
                + Nuovo
              </button>
              <button className="btn" onClick={() => setShowImport(true)}>Importa</button>
              <button className="btn" onClick={load}>Aggiorna</button>
            </>
          }
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════
          RIGHT PANEL — Step Editor (60%)
         ════════════════════════════════════════════════════════════════ */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16,
      }}>
        {detailLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="skeleton-bar" style={{ width: 200, height: 18, margin: '0 auto 12px' }} />
              <div className="skeleton-bar" style={{ width: 140, height: 12, margin: '0 auto' }} />
            </div>
          </div>
        ) : detail ? (
          <>
            {/* ── Header ───────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>
                {detail.nome}
                <span className="tag blue" style={{ marginLeft: 8 }}>v{detail.versione || 1}</span>
              </span>
              <button className="btn" onClick={openEditWorkflow} title="Modifica workflow">
                Modifica
              </button>
              <button className="btn" onClick={() => handleExport()} title="Esporta JSON">
                Esporta
              </button>
              <button className="btn primary" onClick={() => openStepEditor()}>
                + Aggiungi Step
              </button>
            </div>

            {/* Description */}
            {detail.descrizione && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.4 }}>
                {detail.descrizione}
              </div>
            )}

            {/* ── Visual Timeline ──────────────────────────────────── */}
            {steps.length > 0 && (
              <div className="wf-timeline" style={{ marginBottom: 16, paddingBottom: 4 }}>
                {steps.map((step, i) => {
                  const info = getStepTypeInfo(step.tipo);
                  return (
                    <React.Fragment key={step.id || i}>
                      {i > 0 && <div className="wf-connector done" />}
                      <div className="wf-step" title={`${step.nome} (${info.label})`}>
                        <div
                          className="wf-bubble done"
                          style={{ cursor: 'pointer' }}
                          onClick={() => openStepEditor(step)}
                        >
                          {step.ordine || i + 1}
                        </div>
                        <div className="wf-step-label">{step.nome}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                          <span className={`tag ${info.color}`} style={{ fontSize: 9, padding: '0 4px', lineHeight: '16px' }}>
                            {info.label}
                          </span>
                          {platformBadge(step.platform)}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {/* ── Steps Table ──────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {steps.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 20px' }}>
                  <div className="icon">{'\uD83D\uDD27'}</div>
                  <div className="title">Nessuno step definito</div>
                  <div className="desc">Aggiungi step per definire le azioni del workflow</div>
                </div>
              ) : (
                <table className="datagrid" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Nome</th>
                      <th style={{ width: 150 }}>Tipo</th>
                      <th style={{ width: 80 }}>Platform</th>
                      <th style={{ width: 75 }}>On Error</th>
                      <th style={{ width: 170, textAlign: 'center' }}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((step, i) => {
                      const info = getStepTypeInfo(step.tipo);
                      return (
                        <tr key={step.id || i}>
                          <td style={{ fontWeight: 600, color: 'var(--text-dim)' }}>{step.ordine || i + 1}</td>
                          <td style={{ fontWeight: 500 }}>{step.nome}</td>
                          <td><span className={`tag ${info.color}`}>{info.label}</span></td>
                          <td>
                            {step.platform === 'windows' ? (
                              <span style={{ color: '#0078d4', fontWeight: 600, fontSize: 11 }}>Windows</span>
                            ) : step.platform === 'linux' ? (
                              <span style={{ color: '#e95420', fontWeight: 600, fontSize: 11 }}>Linux</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>All</span>
                            )}
                          </td>
                          <td>
                            <span style={{
                              fontSize: 11,
                              color: step.su_errore === 'stop' ? 'var(--red)' :
                                step.su_errore === 'retry' ? 'var(--amber)' : 'var(--text-muted)',
                            }}>
                              {step.su_errore || 'stop'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              className="btn"
                              style={{ padding: '2px 6px', fontSize: 11, marginRight: 2 }}
                              onClick={() => moveStep(step, -1)}
                              disabled={i === 0}
                              title="Sposta su"
                            >
                              {'\u25B2'}
                            </button>
                            <button
                              className="btn"
                              style={{ padding: '2px 6px', fontSize: 11, marginRight: 4 }}
                              onClick={() => moveStep(step, 1)}
                              disabled={i === steps.length - 1}
                              title="Sposta giu"
                            >
                              {'\u25BC'}
                            </button>
                            <button
                              className="btn"
                              style={{ padding: '2px 8px', fontSize: 11, marginRight: 2 }}
                              onClick={() => openStepEditor(step)}
                            >
                              Modifica
                            </button>
                            <button
                              className="btn red"
                              style={{ padding: '2px 8px', fontSize: 11 }}
                              onClick={() => handleDeleteStep(step)}
                            >
                              Elimina
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="icon">{'\u2699\uFE0F'}</div>
            <div className="title">Seleziona un Workflow</div>
            <div className="desc">Clicca su un workflow a sinistra per vederne i dettagli e gestire gli step</div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          MODALS
         ════════════════════════════════════════════════════════════════ */}

      {/* ── New Workflow Modal ──────────────────────────────────────── */}
      {showNew && (
        <Modal
          title="Nuovo Workflow"
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowNew(false)}>Annulla</button>
              <button className="btn primary" onClick={handleCreate} disabled={!form.nome.trim()}>Crea</button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Nome</label>
            <input
              className="form-input"
              value={form.nome}
              onChange={e => setForm({ ...form, nome: e.target.value })}
              placeholder="es. Windows 11 Deploy"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && form.nome.trim() && handleCreate()}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Descrizione</label>
            <textarea
              className="form-textarea"
              value={form.descrizione}
              onChange={e => setForm({ ...form, descrizione: e.target.value })}
              placeholder="Descrizione del workflow..."
              rows={3}
            />
          </div>
        </Modal>
      )}

      {/* ── Edit Workflow Modal ─────────────────────────────────────── */}
      {showEdit && (
        <Modal
          title={`Modifica Workflow: ${detail?.nome || ''}`}
          onClose={() => setShowEdit(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowEdit(false)}>Annulla</button>
              <button className="btn primary" onClick={handleEditWorkflow} disabled={!form.nome.trim()}>Salva</button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Nome</label>
            <input
              className="form-input"
              value={form.nome}
              onChange={e => setForm({ ...form, nome: e.target.value })}
              placeholder="Nome workflow"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && form.nome.trim() && handleEditWorkflow()}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Descrizione</label>
            <textarea
              className="form-textarea"
              value={form.descrizione}
              onChange={e => setForm({ ...form, descrizione: e.target.value })}
              placeholder="Descrizione..."
              rows={3}
            />
          </div>
        </Modal>
      )}

      {/* ── Import Workflow Modal ──────────────────────────────────── */}
      {showImport && (
        <Modal
          title="Importa Workflow da JSON"
          onClose={() => setShowImport(false)}
          wide
          footer={
            <>
              <button className="btn" onClick={() => setShowImport(false)}>Annulla</button>
              <button className="btn primary" onClick={handleImport} disabled={!importJson.trim()}>Importa</button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">JSON Workflow</label>
            <textarea
              className="form-textarea"
              value={importJson}
              onChange={e => setImportJson(e.target.value)}
              placeholder='Incolla il JSON del workflow esportato oppure usa "Scegli File..."'
              style={{ minHeight: 300, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <button className="btn" onClick={handleFileImport}>
              Scegli File...
            </button>
          </div>
        </Modal>
      )}

      {/* ── Step Editor Modal ──────────────────────────────────────── */}
      {showStep && (
        <Modal
          title={editStep ? `Modifica Step: ${editStep.nome}` : 'Nuovo Step'}
          onClose={() => { setShowStep(false); setEditStep(null); }}
          wide
          footer={
            <>
              <button className="btn" onClick={() => { setShowStep(false); setEditStep(null); }}>Annulla</button>
              <button className="btn primary" onClick={handleSaveStep} disabled={!stepForm.nome.trim()}>
                {editStep ? 'Salva' : 'Aggiungi'}
              </button>
            </>
          }
        >
          {/* Row 1: Nome + Tipo */}
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Nome Step</label>
              <input
                className="form-input"
                value={stepForm.nome}
                onChange={e => setStepForm({ ...stepForm, nome: e.target.value })}
                placeholder="es. Installa Firefox"
                autoFocus
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Tipo</label>
              <select
                className="form-select"
                value={stepForm.tipo}
                onChange={e => {
                  const newType = e.target.value;
                  const hint = PARAM_HINTS[newType] || '{}';
                  // Auto-set platform from step type default
                  const typeInfo = getStepTypeInfo(newType);
                  setStepForm({
                    ...stepForm,
                    tipo: newType,
                    parametri: editStep ? stepForm.parametri : hint,
                    platform: editStep ? stepForm.platform : (typeInfo.platform || 'all'),
                  });
                }}
              >
                {STEP_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Platform + On Error + Timeout */}
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Piattaforma</label>
              <select
                className="form-select"
                value={stepForm.platform}
                onChange={e => setStepForm({ ...stepForm, platform: e.target.value })}
              >
                <option value="all">Tutte</option>
                <option value="windows">Windows</option>
                <option value="linux">Linux</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Su Errore</label>
              <select
                className="form-select"
                value={stepForm.su_errore}
                onChange={e => setStepForm({ ...stepForm, su_errore: e.target.value })}
              >
                <option value="stop">Stop</option>
                <option value="continue">Continue (skip)</option>
                <option value="retry">Retry</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Timeout (sec)</label>
              <input
                className="form-input"
                type="number"
                min={0}
                step={30}
                value={stepForm.timeout}
                onChange={e => setStepForm({ ...stepForm, timeout: parseInt(e.target.value) || 0 })}
                placeholder="300"
              />
            </div>
          </div>

          {/* Condizione (optional) */}
          <div className="form-group">
            <label className="form-label">Condizione <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(opzionale)</span></label>
            <input
              className="form-input"
              value={stepForm.condizione}
              onChange={e => setStepForm({ ...stepForm, condizione: e.target.value })}
              placeholder='es. $env:COMPUTERNAME -like "PC-*"'
            />
          </div>

          {/* Parameters JSON */}
          <div className="form-group">
            <label className="form-label">Parametri (JSON)</label>
            <textarea
              className="form-textarea"
              value={stepForm.parametri}
              onChange={e => setStepForm({ ...stepForm, parametri: e.target.value })}
              style={{ minHeight: 150, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                Template: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                  {PARAM_HINTS[stepForm.tipo] || 'Nessun template'}
                </code>
              </div>
              <button
                className="btn"
                style={{ padding: '2px 8px', fontSize: 10 }}
                onClick={() => setStepForm({ ...stepForm, parametri: PARAM_HINTS[stepForm.tipo] || '{}' })}
              >
                Carica Template
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
