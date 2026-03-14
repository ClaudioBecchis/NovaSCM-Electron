import React, { useState, useEffect, useCallback, useRef } from 'react';
import DataGrid from '../components/DataGrid';
import Modal from '../components/Modal';
import * as api from '../services/api';

const STATUS_MAP = {
  pending: { label: 'In Attesa', color: 'muted' },
  running: { label: 'In Esecuzione', color: 'amber' },
  completed: { label: 'Completato', color: 'green' },
  failed: { label: 'Fallito', color: 'red' },
  paused: { label: 'In Pausa', color: 'muted' },
  done: { label: 'Completato', color: 'green' },
  error: { label: 'Errore', color: 'red' },
  skipped: { label: 'Saltato', color: 'muted' },
};

const STEP_STATUS_MAP = {
  pending: { label: 'In Attesa', color: 'var(--text-dim)', bg: 'var(--bg-surface2)' },
  running: { label: 'In Esecuzione', color: 'var(--amber)', bg: 'rgba(245, 158, 11, 0.1)' },
  done: { label: 'Completato', color: 'var(--green)', bg: 'rgba(16, 185, 129, 0.1)' },
  completed: { label: 'Completato', color: 'var(--green)', bg: 'rgba(16, 185, 129, 0.1)' },
  error: { label: 'Errore', color: 'var(--red)', bg: 'rgba(239, 68, 68, 0.1)' },
  failed: { label: 'Fallito', color: 'var(--red)', bg: 'rgba(239, 68, 68, 0.1)' },
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
  {
    key: 'assigned_at', label: 'Creata', width: 160,
    render: (v) => v ? new Date(v).toLocaleString('it-IT') : '',
  },
];

export default function AssignmentsTab({ addLog }) {
  const [items, setItems] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(false);

  // Modals
  const [showAssign, setShowAssign] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);

  // Assign form - supports comma-separated bulk
  const [assignPcNames, setAssignPcNames] = useState('');
  const [assignWfId, setAssignWfId] = useState('');

  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [pw, wf] = await Promise.all([api.getPcWorkflows(), api.getWorkflows()]);
      const pwList = Array.isArray(pw) ? pw : pw?.assignments || [];
      // Compute progress from steps if not provided by API
      const enriched = pwList.map(item => {
        if (typeof item.progress !== 'number' || item.progress === 0) {
          // Will be computed when detail is loaded; use status as hint
          if (item.status === 'completed') return { ...item, progress: 100 };
        }
        return item;
      });
      setItems(enriched);
      setWorkflows(Array.isArray(wf) ? wf : wf?.workflows || []);
      setError(false);
    } catch (e) {
      setError(true);
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
    if (!assignPcNames.trim() || !assignWfId) return;
    // Support comma-separated PC names for bulk assignment
    const pcNames = assignPcNames.split(',').map(s => s.trim()).filter(Boolean);
    if (pcNames.length === 0) return;

    let ok = 0, fail = 0;
    const errors = [];
    for (const pc of pcNames) {
      try {
        await api.createPcWorkflow({ pc_name: pc, workflow_id: parseInt(assignWfId) });
        ok++;
      } catch (e) {
        fail++;
        errors.push(`${pc}: ${e.response?.data?.error || e.message}`);
      }
    }

    if (ok > 0 && fail === 0) {
      addLog(`Workflow assegnato a ${pcNames.length === 1 ? pcNames[0] : `${ok} PC`}`, 'success');
    } else if (ok > 0) {
      addLog(`Assegnazione: ${ok} ok, ${fail} errori`, 'warning');
      errors.forEach(err => addLog(err, 'error'));
    } else {
      addLog(`Errore assegnazione: ${errors[0]}`, 'error');
    }

    setShowAssign(false);
    setAssignPcNames('');
    setAssignWfId('');
    await load();
  };

  const handleDelete = async (row) => {
    const target = row || selected;
    if (!target || !confirm(`Eliminare l'assegnazione per "${target.pc_name}"?`)) return;
    try {
      await api.deletePcWorkflow(target.id);
      addLog(`Assegnazione eliminata per ${target.pc_name}`, 'success');
      setSelected(null);
      await load();
    } catch (e) {
      addLog(`Errore eliminazione: ${e.message}`, 'error');
    }
  };

  const openDetail = async (row) => {
    const target = row || selected;
    if (!target) return;
    setShowDetail(target);
    setDetailData(null);
    try {
      const data = await api.getPcWorkflow(target.id);
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

  const detailSteps = detailData?.steps || [];
  const detailHw = detailData?.hardware || null;
  const detailLog = detailData?.log || null;

  // Compute step-based progress for detail view
  const stepsTotal = detailSteps.length;
  const stepsDone = detailSteps.filter(s => s.status === 'done' || s.status === 'completed').length;
  const detailProgress = stepsTotal > 0 ? Math.round((stepsDone / stepsTotal) * 100) : 0;

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
          <div className="stat-value amber">{stats.running}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completati</div>
          <div className="stat-value green">{stats.completed}</div>
        </div>
        {stats.failed > 0 && (
          <div className="stat-card">
            <div className="stat-label">Falliti</div>
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

      {/* DataGrid */}
      <DataGrid
        columns={columns}
        data={items}
        loading={loading}
        onRowClick={setSelected}
        onRowDoubleClick={openDetail}
        selectable
        emptyMessage="Nessuna assegnazione"
        contextMenu={[
          { label: 'Dettagli', icon: '\uD83D\uDD0D', onClick: openDetail },
          { divider: true },
          { label: 'Elimina', icon: '\uD83D\uDDD1', onClick: handleDelete },
        ]}
        actions={
          <>
            <button className="btn primary" onClick={() => setShowAssign(true)}>+ Nuova Assegnazione</button>
            <button className="btn" onClick={() => openDetail(selected)} disabled={!selected}>{'\uD83D\uDD0D'} Dettagli</button>
            <button className="btn red" disabled={!selected} onClick={() => handleDelete(selected)}>{'\uD83D\uDDD1'} Elimina</button>
            <button className="btn" onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}>{'\uD83D\uDD04'} Aggiorna</button>
          </>
        }
      />

      {/* ═══ Assign Modal ═══ */}
      {showAssign && (
        <Modal
          title="Nuova Assegnazione"
          onClose={() => setShowAssign(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowAssign(false)}>Annulla</button>
              <button className="btn primary" onClick={handleAssign} disabled={!assignPcNames.trim() || !assignWfId}>Assegna</button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Nome PC</label>
            <input
              className="form-input"
              value={assignPcNames}
              onChange={e => setAssignPcNames(e.target.value)}
              placeholder="PC-001, PC-002, PC-003"
              autoFocus
            />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              Separa con virgola per assegnazione multipla
            </div>
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

      {/* ═══ Detail Modal ═══ */}
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
                <span style={{ fontFamily: 'var(--font-mono)' }}>{showDetail.pc_name}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Workflow:</span>
                <span>{detailData?.workflow_nome || showDetail.workflow_nome || 'N/D'}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Stato:</span>
                <span>{renderStatus(detailData?.status || showDetail.status)}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Progresso:</span>
                <span>
                  {detailData ? `${detailProgress}% (${stepsDone}/${stepsTotal} steps)` : `${Math.round(showDetail.progress || 0)}%`}
                </span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Assegnato:</span>
                <span>{showDetail.assigned_at ? new Date(showDetail.assigned_at).toLocaleString('it-IT') : '-'}</span>
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
                  {detailHw.serial && <><span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Seriale:</span><span>{detailHw.serial}</span></>}
                  {detailHw.model && <><span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Modello:</span><span>{detailHw.model}</span></>}
                </div>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {detailData && stepsTotal > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                <span>Progresso complessivo</span>
                <span>{detailProgress}%</span>
              </div>
              <div className="progress-bar" style={{ height: 8 }}>
                <div className={`progress-fill ${detailProgress >= 100 ? 'green' : ''}`} style={{ width: `${detailProgress}%` }} />
              </div>
            </div>
          )}

          {/* Step Timeline */}
          {detailSteps.length > 0 && (
            <>
              <div className="section-title">Timeline Steps ({stepsDone}/{stepsTotal})</div>
              <div style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', maxHeight: 400, overflowY: 'auto',
              }}>
                {detailSteps.map((step, i) => {
                  const st = step.status || 'pending';
                  const stepStyle = STEP_STATUS_MAP[st] || STEP_STATUS_MAP.pending;
                  const isRunning = st === 'running';
                  const isDone = st === 'done' || st === 'completed';
                  const isError = st === 'error' || st === 'failed';

                  return (
                    <div key={step.step_id || i} style={{
                      display: 'flex', alignItems: 'stretch', gap: 0,
                      borderBottom: i < detailSteps.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      background: stepStyle.bg,
                    }}>
                      {/* Left indicator */}
                      <div style={{
                        width: 4, flexShrink: 0,
                        background: stepStyle.color,
                        animation: isRunning ? 'pulse-bar 1.5s ease-in-out infinite' : 'none',
                      }} />

                      {/* Step number */}
                      <div style={{
                        width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: stepStyle.color, flexShrink: 0,
                      }}>
                        {isDone ? '\u2713' : isError ? '\u2717' : step.ordine || (i + 1)}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, padding: '8px 12px 8px 0', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                            {step.nome || step.name || `Step ${i + 1}`}
                          </span>
                          {step.tipo && (
                            <span style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 3,
                              background: 'var(--bg-surface3)', color: 'var(--text-dim)',
                              fontFamily: 'var(--font-mono)',
                            }}>
                              {step.tipo}
                            </span>
                          )}
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: stepStyle.color, fontWeight: 500 }}>
                            {(STEP_STATUS_MAP[st] || { label: st }).label}
                          </span>
                        </div>

                        {/* Timestamps */}
                        {step.timestamp && (
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                            {new Date(step.timestamp).toLocaleString('it-IT')}
                            {step.elapsed_sec > 0 && ` (${step.elapsed_sec}s)`}
                          </div>
                        )}

                        {/* Log/output snippet */}
                        {step.log && (
                          <div style={{
                            fontSize: 10, color: isError ? 'var(--red)' : 'var(--text-muted)',
                            marginTop: 4, fontFamily: 'var(--font-mono)',
                            maxHeight: 40, overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                          }}>
                            {String(step.log).slice(0, 200)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Full log output */}
          {detailLog && (
            <>
              <div className="section-title" style={{ marginTop: 16 }}>Log Output</div>
              <div style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: 12, maxHeight: 200, overflowY: 'auto',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {detailLog}
              </div>
            </>
          )}

          {!detailData && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 12 }}>
              Caricamento dettagli...
            </div>
          )}

          {detailData && detailSteps.length === 0 && !detailHw && !detailLog && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 12 }}>
              Nessun dettaglio aggiuntivo disponibile
            </div>
          )}
        </Modal>
      )}

      <style>{`
        @keyframes pulse-bar {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
