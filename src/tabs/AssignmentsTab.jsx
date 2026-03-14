import React, { useState, useEffect, useCallback, useRef } from 'react';
import DataGrid from '../components/DataGrid';
import Modal from '../components/Modal';
import * as api from '../services/api';

const STATUS_MAP = {
  pending: { label: 'In Attesa', color: 'muted' },
  running: { label: 'In Esecuzione', color: 'blue' },
  completed: { label: 'Completato', color: 'green' },
  failed: { label: 'Fallito', color: 'red' },
  paused: { label: 'In Pausa', color: 'amber' },
  skipped: { label: 'Saltato', color: 'muted' },
};

function renderStatus(v) {
  const s = STATUS_MAP[v] || { label: v || 'N/D', color: 'muted' };
  return <span className={`tag ${s.color}`}>{s.label}</span>;
}

function renderProgress(v, row) {
  const pct = typeof v === 'number' ? v : (row.progress || 0);
  const color = pct >= 100 ? 'green' : pct > 0 ? '' : '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div className="progress-bar" style={{ flex: 1, height: 6 }}>
        <div className={`progress-fill ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', minWidth: 32, textAlign: 'right', color: 'var(--text-muted)' }}>
        {Math.round(pct)}%
      </span>
    </div>
  );
}

const columns = [
  { key: 'id', label: 'ID', width: 50 },
  { key: 'pc_name', label: 'PC' },
  { key: 'workflow_nome', label: 'Workflow' },
  { key: 'status', label: 'Stato', width: 130, render: renderStatus },
  { key: 'progress', label: 'Progresso', width: 180, render: renderProgress },
  { key: 'assigned_at', label: 'Assegnato', width: 160, render: (v) => v ? new Date(v).toLocaleString('it-IT') : '' },
  { key: 'last_seen', label: 'Ultimo Check-in', width: 160, render: (v) => v ? new Date(v).toLocaleString('it-IT') : 'Mai' },
];

export default function AssignmentsTab({ addLog }) {
  const [items, setItems] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const [showAssign, setShowAssign] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);

  const [assignPc, setAssignPc] = useState('');
  const [assignWfId, setAssignWfId] = useState('');
  const [bulkPcs, setBulkPcs] = useState('');
  const [bulkWfId, setBulkWfId] = useState('');

  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [pw, wf] = await Promise.all([api.getPcWorkflows(), api.getWorkflows()]);
      setItems(Array.isArray(pw) ? pw : pw?.assignments || []);
      setWorkflows(Array.isArray(wf) ? wf : wf?.workflows || []);
    } catch (e) {
      addLog(`Errore caricamento assegnazioni: ${e.message}`, 'error');
    }
  }, [addLog]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    timerRef.current = setInterval(load, 10000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const handleAssign = async () => {
    if (!assignPc.trim() || !assignWfId) return;
    try {
      await api.createPcWorkflow({ pc_name: assignPc.trim(), workflow_id: parseInt(assignWfId) });
      addLog(`Workflow assegnato a ${assignPc}`, 'success');
      setShowAssign(false);
      setAssignPc('');
      setAssignWfId('');
      await load();
    } catch (e) {
      addLog(`Errore assegnazione: ${e.message}`, 'error');
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkPcs.trim() || !bulkWfId) return;
    const pcNames = bulkPcs.split('\n').map(s => s.trim()).filter(Boolean);
    let ok = 0, fail = 0;
    for (const pc of pcNames) {
      try {
        await api.createPcWorkflow({ pc_name: pc, workflow_id: parseInt(bulkWfId) });
        ok++;
      } catch {
        fail++;
      }
    }
    addLog(`Assegnazione bulk: ${ok} ok, ${fail} errori`, ok > 0 ? 'success' : 'error');
    setShowBulk(false);
    setBulkPcs('');
    setBulkWfId('');
    await load();
  };

  const handleDelete = async () => {
    if (!selected || !confirm(`Eliminare l'assegnazione per "${selected.pc_name}"?`)) return;
    try {
      await api.deletePcWorkflow(selected.id);
      addLog(`Assegnazione eliminata per ${selected.pc_name}`, 'success');
      setSelected(null);
      await load();
    } catch (e) {
      addLog(`Errore eliminazione: ${e.message}`, 'error');
    }
  };

  const openDetail = async (row) => {
    setShowDetail(row);
    setDetailData(null);
    try {
      const data = await api.getPcWorkflow(row.id);
      setDetailData(data);
    } catch (e) {
      addLog(`Errore dettaglio: ${e.message}`, 'error');
    }
  };

  const stats = {
    total: items.length,
    running: items.filter(a => a.status === 'running').length,
    completed: items.filter(a => a.status === 'completed').length,
    failed: items.filter(a => a.status === 'failed').length,
  };

  const detailSteps = detailData?.steps || detailData?.assignment?.steps || [];
  const detailHw = detailData?.hardware || detailData?.assignment?.hardware || null;
  const detailLogs = detailData?.logs || detailData?.assignment?.logs || [];

  return (
    <div>
      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Totale</div>
          <div className="stat-value accent">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Esecuzione</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{stats.running}</div>
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

      {/* DataGrid */}
      <DataGrid
        columns={columns}
        data={items}
        loading={loading}
        onRowClick={setSelected}
        onRowDoubleClick={openDetail}
        selectable
        multiSelect
        emptyMessage="Nessuna assegnazione"
        contextMenu={[
          { label: 'Dettaglio', icon: '\uD83D\uDD0D', onClick: openDetail },
          { divider: true },
          { label: 'Elimina', icon: '\uD83D\uDDD1', onClick: (row) => {
            if (confirm(`Eliminare l'assegnazione per "${row.pc_name}"?`)) {
              api.deletePcWorkflow(row.id).then(() => { addLog(`Eliminata: ${row.pc_name}`, 'success'); load(); })
                .catch(e => addLog(`Errore: ${e.message}`, 'error'));
            }
          }},
        ]}
        actions={
          <>
            <button className="btn primary" onClick={() => setShowAssign(true)}>Assegna Workflow</button>
            <button className="btn" onClick={() => setShowBulk(true)}>Assegnazione Multipla</button>
            <button className="btn red" disabled={!selected} onClick={handleDelete}>{'\uD83D\uDDD1'} Elimina</button>
            <button className="btn" onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}>{'\uD83D\uDD04'} Aggiorna</button>
          </>
        }
      />

      {/* Assign Modal */}
      {showAssign && (
        <Modal
          title="Assegna Workflow"
          onClose={() => setShowAssign(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowAssign(false)}>Annulla</button>
              <button className="btn primary" onClick={handleAssign} disabled={!assignPc.trim() || !assignWfId}>Assegna</button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Nome PC</label>
            <input className="form-input" value={assignPc} onChange={e => setAssignPc(e.target.value)} placeholder="es. PC-DEPLOY-001" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Workflow</label>
            <select className="form-select" value={assignWfId} onChange={e => setAssignWfId(e.target.value)}>
              <option value="">-- Seleziona Workflow --</option>
              {workflows.map(wf => (
                <option key={wf.id} value={wf.id}>{wf.nome} (v{wf.versione || '1.0'})</option>
              ))}
            </select>
          </div>
        </Modal>
      )}

      {/* Bulk Assign Modal */}
      {showBulk && (
        <Modal
          title="Assegnazione Multipla"
          onClose={() => setShowBulk(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowBulk(false)}>Annulla</button>
              <button className="btn primary" onClick={handleBulkAssign} disabled={!bulkPcs.trim() || !bulkWfId}>Assegna Tutti</button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Nomi PC (uno per riga)</label>
            <textarea
              className="form-textarea"
              value={bulkPcs}
              onChange={e => setBulkPcs(e.target.value)}
              placeholder={'PC-DEPLOY-001\nPC-DEPLOY-002\nPC-DEPLOY-003'}
              style={{ minHeight: 120 }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Workflow</label>
            <select className="form-select" value={bulkWfId} onChange={e => setBulkWfId(e.target.value)}>
              <option value="">-- Seleziona Workflow --</option>
              {workflows.map(wf => (
                <option key={wf.id} value={wf.id}>{wf.nome} (v{wf.versione || '1.0'})</option>
              ))}
            </select>
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {showDetail && (
        <Modal
          title={`Dettaglio: ${showDetail.pc_name}`}
          onClose={() => { setShowDetail(null); setDetailData(null); }}
          wide
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <div className="section-title">Assegnazione</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 13 }}>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>PC:</span>
                <span>{showDetail.pc_name}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Workflow:</span>
                <span>{showDetail.workflow_nome || 'N/D'}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Stato:</span>
                <span>{renderStatus(showDetail.status)}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Progresso:</span>
                <span>{Math.round(showDetail.progress || 0)}%</span>
              </div>
            </div>
            {detailHw && (
              <div>
                <div className="section-title">Hardware</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 13 }}>
                  {detailHw.cpu && <><span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>CPU:</span><span>{detailHw.cpu}</span></>}
                  {detailHw.ram && <><span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>RAM:</span><span>{detailHw.ram}</span></>}
                  {detailHw.disk && <><span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Disco:</span><span>{detailHw.disk}</span></>}
                  {detailHw.os && <><span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>OS:</span><span>{detailHw.os}</span></>}
                </div>
              </div>
            )}
          </div>

          {/* Step Timeline */}
          {detailSteps.length > 0 && (
            <>
              <div className="section-title">Timeline Steps</div>
              <div className="wf-timeline" style={{ marginBottom: 16 }}>
                {detailSteps.map((step, i) => {
                  let bubbleClass = 'pending';
                  if (step.status === 'completed' || step.status === 'done') bubbleClass = 'done';
                  else if (step.status === 'running') bubbleClass = 'running';
                  else if (step.status === 'failed' || step.status === 'error') bubbleClass = 'error';
                  return (
                    <React.Fragment key={step.id || i}>
                      {i > 0 && <div className={`wf-connector ${bubbleClass === 'done' ? 'done' : ''}`} />}
                      <div className="wf-step">
                        <div className={`wf-bubble ${bubbleClass}`}>{i + 1}</div>
                        <div className="wf-step-label">{step.nome || step.name || `Step ${i + 1}`}</div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </>
          )}

          {/* Log output */}
          {detailLogs.length > 0 && (
            <>
              <div className="section-title">Log Output</div>
              <div style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: 12, maxHeight: 200, overflowY: 'auto',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
              }}>
                {detailLogs.map((log, i) => (
                  <div key={i} style={{ padding: '1px 0' }}>
                    {log.timestamp && <span style={{ color: 'var(--text-dim)', marginRight: 8 }}>{new Date(log.timestamp).toLocaleTimeString('it-IT')}</span>}
                    <span style={{ color: log.level === 'error' ? 'var(--red)' : log.level === 'warn' ? 'var(--amber)' : 'var(--text-muted)' }}>
                      {log.message || log.text || JSON.stringify(log)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {detailSteps.length === 0 && detailLogs.length === 0 && !detailHw && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 12 }}>
              Nessun dettaglio aggiuntivo disponibile
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
