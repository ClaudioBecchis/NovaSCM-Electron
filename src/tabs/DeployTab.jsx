import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../services/api';

const STATUS_COLORS = {
  completed: 'var(--green)',
  done: 'var(--green)',
  running: 'var(--accent)',
  failed: 'var(--red)',
  error: 'var(--red)',
  pending: 'var(--border-light)',
  paused: 'var(--amber)',
};

function statusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.pending;
}

function statusLabel(status) {
  const labels = {
    completed: 'Completato', done: 'Completato', running: 'In Esecuzione',
    failed: 'Fallito', error: 'Errore', pending: 'In Attesa', paused: 'In Pausa',
  };
  return labels[status] || status || 'N/D';
}

function statusTagClass(status) {
  if (status === 'completed' || status === 'done') return 'green';
  if (status === 'running') return 'blue';
  if (status === 'failed' || status === 'error') return 'red';
  if (status === 'paused') return 'amber';
  return 'muted';
}

function formatElapsed(startedAt) {
  if (!startedAt) return '';
  const diff = Date.now() - new Date(startedAt).getTime();
  if (diff < 0) return '0s';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function getCurrentStepName(steps) {
  if (!steps || steps.length === 0) return null;
  const running = steps.find(s => s.status === 'running');
  if (running) return running.nome || running.name || 'Step in corso';
  // Find the first pending step (next to run)
  const pending = steps.find(s => s.status === 'pending');
  if (pending) return pending.nome || pending.name || 'Prossimo step';
  // All done or failed
  const failed = steps.find(s => s.status === 'failed' || s.status === 'error');
  if (failed) return failed.nome || failed.name || 'Step fallito';
  return 'Completato';
}

export default function DeployTab({ addLog }) {
  const [deploys, setDeploys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedData, setExpandedData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all | running | pending | completed | failed
  const timerRef = useRef(null);
  const prevStatusRef = useRef({});
  const detailCacheRef = useRef({});

  // Fetch all pc-workflows, then fetch detail for active ones to get steps
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const data = await api.getPcWorkflows();
      const list = Array.isArray(data) ? data : data?.assignments || [];

      // Fetch step details for running/pending deploys (batch, limit concurrency)
      const active = list.filter(d => d.status === 'running' || d.status === 'pending');
      const detailPromises = active.map(async (d) => {
        try {
          const detail = await api.getPcWorkflow(d.id);
          detailCacheRef.current[d.id] = detail;
          return { id: d.id, detail };
        } catch {
          return { id: d.id, detail: detailCacheRef.current[d.id] || null };
        }
      });
      const details = await Promise.all(detailPromises);
      const detailMap = {};
      details.forEach(({ id, detail }) => { if (detail) detailMap[id] = detail; });

      // Merge step/hardware info into the flat list
      const enriched = list.map(d => {
        const detail = detailMap[d.id] || detailCacheRef.current[d.id];
        const steps = detail?.steps || [];
        const totalSteps = steps.length;
        const doneSteps = steps.filter(s => s.status === 'completed' || s.status === 'done').length;
        const progress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
        return {
          ...d,
          steps,
          hardware: detail?.hardware || null,
          log: detail?.log || null,
          logs: detail?.logs || [],
          screenshot: detail?.screenshot || null,
          progress,
          doneSteps,
          totalSteps,
          currentStep: getCurrentStepName(steps),
        };
      });

      // Check for status changes (completion/failure notifications)
      enriched.forEach(d => {
        const prev = prevStatusRef.current[d.id];
        if (prev && prev !== d.status) {
          if (d.status === 'completed' || d.status === 'done') {
            addLog(`Deploy completato: ${d.pc_name}`, 'success');
          } else if (d.status === 'failed' || d.status === 'error') {
            addLog(`Deploy FALLITO: ${d.pc_name}`, 'error');
          }
        }
        prevStatusRef.current[d.id] = d.status;
      });

      setDeploys(enriched);
    } catch (e) {
      if (!silent) addLog(`Errore caricamento deploy: ${e.message}`, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addLog]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    timerRef.current = setInterval(() => load(true), 5000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const handleExpand = async (deploy) => {
    if (expandedId === deploy.id) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }
    setExpandedId(deploy.id);
    try {
      const data = await api.getPcWorkflow(deploy.id);
      detailCacheRef.current[deploy.id] = data;
      setExpandedData(data);
    } catch (e) {
      // Use cached data if available
      if (detailCacheRef.current[deploy.id]) {
        setExpandedData(detailCacheRef.current[deploy.id]);
      }
      addLog(`Errore dettaglio: ${e.message}`, 'error');
    }
  };

  // Stats
  const stats = {
    total: deploys.length,
    running: deploys.filter(d => d.status === 'running').length,
    pending: deploys.filter(d => d.status === 'pending').length,
    completed: deploys.filter(d => d.status === 'completed' || d.status === 'done').length,
    failed: deploys.filter(d => d.status === 'failed' || d.status === 'error').length,
  };

  // Filtered list
  const filtered = filter === 'all' ? deploys : deploys.filter(d => {
    if (filter === 'running') return d.status === 'running';
    if (filter === 'pending') return d.status === 'pending';
    if (filter === 'completed') return d.status === 'completed' || d.status === 'done';
    if (filter === 'failed') return d.status === 'failed' || d.status === 'error';
    return true;
  });

  return (
    <div>
      {/* Stats Bar */}
      <div className="stat-row">
        <div className="stat-card" style={{ cursor: 'pointer', outline: filter === 'all' ? '1px solid var(--accent)' : 'none' }}
          onClick={() => setFilter('all')}>
          <div className="stat-label">Totale Deploy</div>
          <div className="stat-value accent">{stats.total}</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer', outline: filter === 'running' ? '1px solid var(--accent)' : 'none' }}
          onClick={() => setFilter(f => f === 'running' ? 'all' : 'running')}>
          <div className="stat-label">In Esecuzione</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{stats.running}</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer', outline: filter === 'pending' ? '1px solid var(--accent)' : 'none' }}
          onClick={() => setFilter(f => f === 'pending' ? 'all' : 'pending')}>
          <div className="stat-label">In Attesa</div>
          <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{stats.pending}</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer', outline: filter === 'completed' ? '1px solid var(--accent)' : 'none' }}
          onClick={() => setFilter(f => f === 'completed' ? 'all' : 'completed')}>
          <div className="stat-label">Completati</div>
          <div className="stat-value green">{stats.completed}</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer', outline: filter === 'failed' ? '1px solid var(--accent)' : 'none' }}
          onClick={() => setFilter(f => f === 'failed' ? 'all' : 'failed')}>
          <div className="stat-label">Falliti</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{stats.failed}</div>
        </div>
      </div>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
        padding: '12px 16px', background: 'var(--bg-surface2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Deploy War Room</span>
        {stats.running > 0 && (
          <span className="tag blue">{stats.running} attivi</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Auto-refresh indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-dim)' }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',
              animation: refreshing ? 'pulse 1s infinite' : 'none',
            }} />
            Auto-refresh 5s
          </div>
          <button className="btn" onClick={() => load()}>{'\uD83D\uDD04'} Aggiorna</button>
        </div>
      </div>

      {/* Loading state */}
      {loading && deploys.length === 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="progress-bar"><div className="progress-fill" style={{ width: '100%' }} /></div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Caricamento deploy...</div>
        </div>
      )}

      {/* Deploy Cards Grid */}
      {!loading && filtered.length === 0 ? (
        <div className="empty-state" style={{ minHeight: 300 }}>
          <div className="icon" style={{ fontSize: 64 }}>{'\uD83D\uDE80'}</div>
          <div className="title">
            {filter !== 'all' ? `Nessun deploy ${statusLabel(filter).toLowerCase()}` : 'Nessun Deploy Attivo'}
          </div>
          <div className="desc">
            {filter !== 'all'
              ? 'Prova a selezionare un filtro diverso'
              : 'I deploy appariranno qui quando verranno assegnati workflow ai PC'}
          </div>
          {filter !== 'all' && (
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setFilter('all')}>
              Mostra Tutti
            </button>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 12,
        }}>
          {filtered.map(deploy => {
            const isExpanded = expandedId === deploy.id;
            const steps = deploy.steps || [];
            const pct = deploy.progress || 0;
            const hw = deploy.hardware || {};

            return (
              <div
                key={deploy.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderLeft: `4px solid ${statusColor(deploy.status)}`,
                  borderRadius: 'var(--radius)',
                  padding: 16,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  ...(isExpanded ? { gridColumn: '1 / -1' } : {}),
                }}
                onClick={() => handleExpand(deploy)}
              >
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>{'\uD83D\uDCBB'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{deploy.pc_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{deploy.workflow_nome || 'Workflow N/D'}</div>
                  </div>
                  <span className={`tag ${statusTagClass(deploy.status)}`}>{statusLabel(deploy.status)}</span>
                </div>

                {/* Current step */}
                {deploy.currentStep && deploy.status === 'running' && (
                  <div style={{
                    fontSize: 11, color: 'var(--accent-light)', marginBottom: 6,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{
                      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                      background: 'var(--accent)', animation: 'pulse 1.5s infinite',
                    }} />
                    {deploy.currentStep}
                  </div>
                )}

                {/* Progress bar */}
                <div style={{ marginBottom: 8 }}>
                  <div className="progress-bar" style={{ height: 6 }}>
                    <div
                      className={`progress-fill ${pct >= 100 ? 'green' : deploy.status === 'failed' || deploy.status === 'error' ? 'red' : ''}`}
                      style={{ width: `${Math.min(pct, 100)}%`, transition: 'width 0.5s ease' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                      {deploy.doneSteps}/{deploy.totalSteps} steps
                    </span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {pct}%
                    </span>
                  </div>
                </div>

                {/* Time elapsed */}
                {deploy.started_at && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>
                    Tempo: {formatElapsed(deploy.started_at)}
                    {deploy.assigned_at && deploy.assigned_at !== deploy.started_at && (
                      <span style={{ marginLeft: 8 }}>
                        Assegnato: {new Date(deploy.assigned_at).toLocaleString('it-IT')}
                      </span>
                    )}
                  </div>
                )}

                {/* Hardware info */}
                {hw && (hw.cpu || hw.ram || hw.disk) && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>
                    {[hw.cpu, hw.ram, hw.disk].filter(Boolean).join(' / ')}
                  </div>
                )}

                {/* Last seen */}
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  Ultimo contatto: {deploy.last_seen ? new Date(deploy.last_seen).toLocaleString('it-IT') : 'Mai'}
                </div>

                {/* Mini timeline */}
                {steps.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 8, overflow: 'hidden', flexWrap: 'wrap' }}>
                    {steps.map((step, i) => {
                      let bg = 'var(--bg-surface3)';
                      if (step.status === 'completed' || step.status === 'done') bg = 'var(--green)';
                      else if (step.status === 'running') bg = 'var(--accent)';
                      else if (step.status === 'failed' || step.status === 'error') bg = 'var(--red)';
                      else if (step.status === 'skipped') bg = 'var(--text-dim)';
                      return (
                        <div
                          key={step.step_id || step.id || i}
                          title={`${step.nome || step.name || `Step ${i + 1}`} — ${statusLabel(step.status)}`}
                          style={{
                            width: 12, height: 12, borderRadius: '50%', background: bg,
                            flexShrink: 0, border: '1px solid var(--border)',
                            animation: step.status === 'running' ? 'pulse 1.5s infinite' : 'none',
                          }}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Expanded detail */}
                {isExpanded && expandedData && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                    {/* Full timeline */}
                    <div className="section-title">Timeline Dettagliata</div>
                    <div className="wf-timeline" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                      {(expandedData.steps || steps).map((step, i) => {
                        let bubbleClass = 'pending';
                        if (step.status === 'completed' || step.status === 'done') bubbleClass = 'done';
                        else if (step.status === 'running') bubbleClass = 'running';
                        else if (step.status === 'failed' || step.status === 'error') bubbleClass = 'error';
                        else if (step.status === 'skipped') bubbleClass = 'done';
                        return (
                          <React.Fragment key={step.step_id || step.id || i}>
                            {i > 0 && <div className={`wf-connector ${bubbleClass === 'done' ? 'done' : ''}`} />}
                            <div className="wf-step">
                              <div className={`wf-bubble ${bubbleClass}`}>{step.ordine || i + 1}</div>
                              <div className="wf-step-label">
                                {step.nome || step.name || `Step ${i + 1}`}
                                {step.elapsed_sec > 0 && (
                                  <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
                                    {step.elapsed_sec < 60 ? `${Math.round(step.elapsed_sec)}s` : `${Math.round(step.elapsed_sec / 60)}m`}
                                  </div>
                                )}
                                {step.timestamp && (
                                  <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                                    {new Date(step.timestamp).toLocaleTimeString('it-IT')}
                                  </div>
                                )}
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {/* Step detail table */}
                    <div className="section-title">Dettaglio Steps</div>
                    <div style={{
                      maxHeight: 250, overflowY: 'auto', marginBottom: 12,
                      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-surface2)', position: 'sticky', top: 0 }}>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>#</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Nome</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Tipo</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Stato</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Durata</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Ora</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(expandedData.steps || steps).map((step, i) => (
                            <tr key={step.step_id || step.id || i} style={{
                              borderTop: '1px solid var(--border)',
                              background: step.status === 'running' ? 'var(--accent-dim)' : 'transparent',
                            }}>
                              <td style={{ padding: '5px 10px', color: 'var(--text-dim)' }}>{step.ordine || i + 1}</td>
                              <td style={{ padding: '5px 10px', fontWeight: step.status === 'running' ? 600 : 400 }}>
                                {step.nome || step.name || `Step ${i + 1}`}
                              </td>
                              <td style={{ padding: '5px 10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                                {step.tipo || ''}
                              </td>
                              <td style={{ padding: '5px 10px' }}>
                                <span className={`tag ${statusTagClass(step.status)}`} style={{ fontSize: 9 }}>
                                  {statusLabel(step.status)}
                                </span>
                              </td>
                              <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                                {step.elapsed_sec > 0 ? (step.elapsed_sec < 60 ? `${Math.round(step.elapsed_sec)}s` : `${Math.round(step.elapsed_sec / 60)}m`) : '-'}
                              </td>
                              <td style={{ padding: '5px 10px', fontSize: 10, color: 'var(--text-dim)' }}>
                                {step.timestamp ? new Date(step.timestamp).toLocaleTimeString('it-IT') : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Hardware */}
                    {expandedData.hardware && Object.keys(expandedData.hardware).length > 0 && (
                      <>
                        <div className="section-title">Hardware</div>
                        <div style={{
                          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px',
                          fontSize: 12, color: 'var(--text-muted)', marginBottom: 12,
                          padding: 10, background: 'var(--bg-primary)', borderRadius: 'var(--radius)',
                          border: '1px solid var(--border)',
                        }}>
                          {Object.entries(expandedData.hardware).map(([k, v]) => (
                            <React.Fragment key={k}>
                              <span style={{ color: 'var(--text-dim)', fontWeight: 600, textTransform: 'capitalize' }}>{k}:</span>
                              <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                            </React.Fragment>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Log output */}
                    {expandedData.log && (
                      <>
                        <div className="section-title">Log Output</div>
                        <pre style={{
                          background: 'var(--bg-primary)', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)', padding: 10, maxHeight: 200, overflowY: 'auto',
                          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)',
                          whiteSpace: 'pre-wrap', margin: '0 0 12px 0',
                        }}>
                          {expandedData.log}
                        </pre>
                      </>
                    )}

                    {/* Screenshot */}
                    {expandedData.screenshot && (
                      <>
                        <div className="section-title">Screenshot</div>
                        <img
                          src={`data:image/png;base64,${expandedData.screenshot}`}
                          alt="Screenshot deploy"
                          style={{
                            maxWidth: '100%', maxHeight: 300, borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)',
                          }}
                        />
                      </>
                    )}

                    {/* Timestamps */}
                    <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>
                      {deploy.assigned_at && <span>Assegnato: {new Date(deploy.assigned_at).toLocaleString('it-IT')}</span>}
                      {deploy.started_at && <span>Avviato: {new Date(deploy.started_at).toLocaleString('it-IT')}</span>}
                      {deploy.completed_at && <span>Completato: {new Date(deploy.completed_at).toLocaleString('it-IT')}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
