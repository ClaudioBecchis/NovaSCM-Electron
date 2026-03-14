import React, { useState, useEffect, useCallback } from 'react';
import DataGrid from '../components/DataGrid';
import Modal from '../components/Modal';
import * as api from '../services/api';

const STEP_TYPES = [
  { value: 'powershell_cmd', label: 'PowerShell Command', color: 'blue' },
  { value: 'ps_script', label: 'PowerShell Script', color: 'blue' },
  { value: 'shell_cmd', label: 'Shell Command', color: 'green' },
  { value: 'shell_script', label: 'Shell Script', color: 'green' },
  { value: 'winget_install', label: 'Winget Install', color: 'accent' },
  { value: 'choco_install', label: 'Chocolatey Install', color: 'amber' },
  { value: 'apt_install', label: 'APT Install', color: 'green' },
  { value: 'snap_install', label: 'Snap Install', color: 'green' },
  { value: 'file_download', label: 'File Download', color: 'muted' },
  { value: 'file_copy', label: 'File Copy', color: 'muted' },
  { value: 'reg_set', label: 'Registry Set', color: 'amber' },
  { value: 'reboot', label: 'Reboot', color: 'red' },
  { value: 'windows_update', label: 'Windows Update', color: 'blue' },
  { value: 'domain_join', label: 'Domain Join', color: 'accent' },
  { value: 'systemd_service', label: 'Systemd Service', color: 'green' },
  { value: 'message', label: 'Message', color: 'muted' },
  { value: 'send_notification', label: 'Send Notification', color: 'muted' },
];

const PARAM_HINTS = {
  powershell_cmd: '{ "command": "Get-Process" }',
  ps_script: '{ "script_path": "C:\\\\Scripts\\\\setup.ps1", "args": "-Force" }',
  shell_cmd: '{ "command": "apt update && apt upgrade -y" }',
  shell_script: '{ "script_path": "/opt/scripts/setup.sh", "args": "--all" }',
  winget_install: '{ "package_id": "Mozilla.Firefox", "version": "", "scope": "machine" }',
  choco_install: '{ "package_id": "firefox", "version": "" }',
  apt_install: '{ "packages": ["nginx", "curl"] }',
  snap_install: '{ "snap_name": "code", "classic": true }',
  file_download: '{ "url": "https://example.com/file.zip", "dest": "C:\\\\Temp\\\\file.zip" }',
  file_copy: '{ "source": "\\\\\\\\server\\\\share\\\\file.exe", "dest": "C:\\\\Program Files\\\\app.exe" }',
  reg_set: '{ "path": "HKLM:\\\\SOFTWARE\\\\Policies", "name": "Value", "type": "DWORD", "data": "1" }',
  reboot: '{ "delay_seconds": 5, "message": "Riavvio in corso..." }',
  windows_update: '{ "categories": ["Security", "Critical"], "reboot": true }',
  domain_join: '{ "domain": "corp.polariscore.it", "ou": "OU=PC,DC=corp,DC=polariscore,DC=it", "user": "admin", "pass": "" }',
  systemd_service: '{ "service": "nginx", "action": "restart", "enable": true }',
  message: '{ "text": "Step completato", "level": "info" }',
  send_notification: '{ "title": "Deploy", "body": "Completato", "channel": "deploy" }',
};

function getStepTypeInfo(type) {
  return STEP_TYPES.find(t => t.value === type) || { value: type, label: type, color: 'muted' };
}

const wfColumns = [
  { key: 'id', label: 'ID', width: 50 },
  { key: 'nome', label: 'Nome' },
  { key: 'descrizione', label: 'Descrizione' },
  { key: 'versione', label: 'Versione', width: 80 },
  {
    key: 'step_count', label: 'Steps', width: 80,
    render: (v) => <span className="tag blue">{v || 0}</span>,
  },
];

export default function WorkflowsTab({ addLog }) {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);

  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showStep, setShowStep] = useState(false);
  const [editStep, setEditStep] = useState(null);

  const [form, setForm] = useState({ nome: '', descrizione: '' });
  const [importJson, setImportJson] = useState('');

  const [stepForm, setStepForm] = useState({
    nome: '', tipo: 'powershell_cmd', piattaforma: 'all', su_errore: 'stop', parametri: '{}',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getWorkflows();
      setWorkflows(Array.isArray(data) ? data : data?.workflows || []);
    } catch (e) {
      addLog(`Errore caricamento workflows: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (wf) => {
    if (!wf) { setDetail(null); return; }
    try {
      const d = await api.getWorkflow(wf.id);
      setDetail(d);
    } catch (e) {
      addLog(`Errore dettaglio workflow: ${e.message}`, 'error');
    }
  }, [addLog]);

  const handleCreate = async () => {
    if (!form.nome.trim()) return;
    try {
      await api.createWorkflow({ nome: form.nome.trim(), descrizione: form.descrizione.trim(), versione: 1 });
      addLog(`Workflow "${form.nome}" creato`, 'success');
      setShowNew(false);
      setForm({ nome: '', descrizione: '' });
      await load();
    } catch (e) {
      addLog(`Errore creazione workflow: ${e.message}`, 'error');
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Eliminare il workflow "${selected.nome}"?`)) return;
    try {
      await api.deleteWorkflow(selected.id);
      addLog(`Workflow "${selected.nome}" eliminato`, 'success');
      setSelected(null);
      setDetail(null);
      await load();
    } catch (e) {
      addLog(`Errore eliminazione: ${e.message}`, 'error');
    }
  };

  const handleExport = async () => {
    if (!detail) return;
    try {
      const data = await api.exportWorkflow(detail.id);
      const json = JSON.stringify(data, null, 2);
      if (window.electronAPI?.saveFile) {
        const path = await window.electronAPI.saveFile({
          defaultPath: `${detail.nome}.json`,
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
        a.download = `workflow-${detail.nome}.json`;
        a.click();
        URL.revokeObjectURL(url);
        addLog(`Workflow "${detail.nome}" esportato`, 'success');
      }
    } catch (e) {
      addLog(`Errore esportazione: ${e.message}`, 'error');
    }
  };

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

  const openStepEditor = (step = null) => {
    if (step) {
      setEditStep(step);
      setStepForm({
        nome: step.nome || '',
        tipo: step.tipo || 'powershell_cmd',
        piattaforma: step.piattaforma || step.platform || 'all',
        su_errore: step.su_errore || 'stop',
        parametri: typeof step.parametri === 'object' ? JSON.stringify(step.parametri, null, 2) : (step.parametri || '{}'),
      });
    } else {
      setEditStep(null);
      setStepForm({ nome: '', tipo: 'powershell_cmd', piattaforma: 'all', su_errore: 'stop', parametri: '{}' });
    }
    setShowStep(true);
  };

  const handleSaveStep = async () => {
    if (!detail || !stepForm.nome.trim()) return;
    let params = stepForm.parametri;
    try { params = JSON.parse(params); } catch { /* keep as string */ }
    const ordine = editStep ? editStep.ordine : (detail.steps?.length || 0) + 1;
    const payload = {
      nome: stepForm.nome.trim(),
      tipo: stepForm.tipo,
      piattaforma: stepForm.piattaforma,
      platform: stepForm.piattaforma,
      su_errore: stepForm.su_errore,
      parametri: typeof params === 'string' ? params : JSON.stringify(params),
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
      await load();
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
      await load();
    } catch (e) {
      addLog(`Errore eliminazione step: ${e.message}`, 'error');
    }
  };

  const steps = detail?.steps || [];

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 220px)' }}>
      {/* Left panel: workflow list */}
      <div style={{ width: 480, minWidth: 380, display: 'flex', flexDirection: 'column' }}>
        <DataGrid
          columns={wfColumns}
          data={workflows}
          loading={loading}
          onRowClick={(row) => { setSelected(row); loadDetail(row); }}
          emptyMessage="Nessun workflow"
          actions={
            <>
              <button className="btn primary" onClick={() => setShowNew(true)}>+ Nuovo</button>
              <button className="btn red" onClick={handleDelete} disabled={!selected}>Elimina</button>
              <button className="btn" onClick={() => setShowImport(true)}>Importa JSON</button>
              <button className="btn" onClick={load}>Aggiorna</button>
            </>
          }
        />
      </div>

      {/* Right panel: step detail */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16,
      }}>
        {detail ? (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>
                {detail.nome} <span className="tag blue">v{detail.versione}</span>
              </span>
              <button className="btn" onClick={handleExport}>Esporta</button>
              <button className="btn primary" onClick={() => openStepEditor()}>+ Aggiungi Step</button>
            </div>

            {/* Description */}
            {detail.descrizione && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                {detail.descrizione}
              </div>
            )}

            {/* Visual timeline */}
            {steps.length > 0 && (
              <div className="wf-timeline" style={{ marginBottom: 16 }}>
                {steps.map((step, i) => (
                  <React.Fragment key={step.id || i}>
                    {i > 0 && <div className="wf-connector done" />}
                    <div className="wf-step" title={`${step.nome} (${step.tipo})`}>
                      <div
                        className="wf-bubble done"
                        style={{ cursor: 'pointer' }}
                        onClick={() => openStepEditor(step)}
                      >
                        {step.ordine || i + 1}
                      </div>
                      <div className="wf-step-label">{step.nome}</div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Steps table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {steps.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 20px' }}>
                  <div className="icon">&#128736;</div>
                  <div className="title">Nessuno step definito</div>
                  <div className="desc">Aggiungi step per definire le azioni del workflow</div>
                </div>
              ) : (
                <table className="datagrid" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Nome</th>
                      <th style={{ width: 160 }}>Tipo</th>
                      <th style={{ width: 100 }}>Piattaforma</th>
                      <th style={{ width: 80 }}>On Error</th>
                      <th style={{ width: 120, textAlign: 'center' }}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((step, i) => {
                      const info = getStepTypeInfo(step.tipo);
                      return (
                        <tr key={step.id || i}>
                          <td style={{ fontWeight: 600, color: 'var(--text-dim)' }}>{step.ordine || i + 1}</td>
                          <td>{step.nome}</td>
                          <td><span className={`tag ${info.color}`}>{info.label}</span></td>
                          <td>{step.piattaforma || step.platform || 'all'}</td>
                          <td>{step.su_errore || 'stop'}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn"
                              style={{ padding: '2px 8px', fontSize: 11, marginRight: 4 }}
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
          <div className="empty-state" style={{ flex: 1, justifyContent: 'center' }}>
            <div className="icon">{'\u2699\uFE0F'}</div>
            <div className="title">Seleziona un Workflow</div>
            <div className="desc">Clicca su un workflow a sinistra per vederne i dettagli e gestire gli step</div>
          </div>
        )}
      </div>

      {/* New Workflow Modal */}
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
            <input className="form-input" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="es. Windows 11 Deploy" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Descrizione</label>
            <textarea className="form-textarea" value={form.descrizione} onChange={e => setForm({ ...form, descrizione: e.target.value })} placeholder="Descrizione del workflow..." rows={3} />
          </div>
        </Modal>
      )}

      {/* Import Modal */}
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
              placeholder='Incolla il JSON del workflow esportato...'
              style={{ minHeight: 300, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <button className="btn" onClick={async () => {
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
            }}>
              Scegli File...
            </button>
          </div>
        </Modal>
      )}

      {/* Step Editor Modal */}
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
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nome Step</label>
              <input className="form-input" value={stepForm.nome} onChange={e => setStepForm({ ...stepForm, nome: e.target.value })} placeholder="Nome dello step" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-select" value={stepForm.tipo} onChange={e => {
                const newType = e.target.value;
                setStepForm({ ...stepForm, tipo: newType, parametri: PARAM_HINTS[newType] || '{}' });
              }}>
                {STEP_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Piattaforma</label>
              <select className="form-select" value={stepForm.piattaforma} onChange={e => setStepForm({ ...stepForm, piattaforma: e.target.value })}>
                <option value="all">Tutte</option>
                <option value="windows">Windows</option>
                <option value="linux">Linux</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Su Errore</label>
              <select className="form-select" value={stepForm.su_errore} onChange={e => setStepForm({ ...stepForm, su_errore: e.target.value })}>
                <option value="stop">Stop</option>
                <option value="skip">Skip</option>
                <option value="retry">Retry</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Parametri (JSON)</label>
            <textarea
              className="form-textarea"
              value={stepForm.parametri}
              onChange={e => setStepForm({ ...stepForm, parametri: e.target.value })}
              style={{ minHeight: 150, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
              Template per <strong>{getStepTypeInfo(stepForm.tipo).label}</strong>:{' '}
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{PARAM_HINTS[stepForm.tipo] || 'Nessun template disponibile'}</code>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
