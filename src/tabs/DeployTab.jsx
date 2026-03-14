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

export default function DeployTab({ addLog }) {
  const [deploys, setDeploys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedData, setExpandedData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef(null);
  const prevStatusRef = useRef({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const data = await api.getPcWorkflows();
      const list = Array.isArray(data) ? data : data?.assignments || [];

      // Check for status changes (completion/failure notifications)
      list.forEach(d => {
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

      setDeploys(list);
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
      setExpandedData(data);
    } catch (e) {
      addLog(`Errore dettaglio: ${e.message}`, 'error');
    }
  };

  const activeCount = deploys.filter(d => d.status === 'running').length;

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
        padding: '12px 16px', background: 'var(--bg-surface2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Deploy War Room</span>
        {activeCount > 0 && (
          <span className="tag blue">{activeCount} attivi</span>
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

      {/* Deploy Cards Grid */}
      {deploys.length === 0 ? (
        <div className="empty-state" style={{ minHeight: 300 }}>
          <div className="icon" style={{ fontSize: 64 }}>{'\uD83D\uDE80'}</div>
          <div className="title">Nessun Deploy Attivo</div>
          <div className="desc">I deploy appariranno qui quando verranno assegnati workflow ai PC</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 12,
        }}>
          {deploys.map(deploy => {
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
                }}
                onClick={() => handleExpand(deploy)}
              >
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>{'\uD83D\uDCBB'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{deploy.pc_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{deploy.workflow_nome || 'Workflow N/D'}</div>
                  </div>
                  <span className={`tag ${statusTagClass(deploy.status)}`}>{statusLabel(deploy.status)}</span>
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: 8 }}>
                  <div className="progress-bar" style={{ height: 6 }}>
                    <div
                      className={`progress-fill ${pct >= 100 ? 'green' : deploy.status === 'failed' ? 'red' : ''}`}
                      style={{ width: `${Math.min(pct, 100)}%`, transition: 'width 0.5s ease' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                      {steps.filter(s => s.status === 'completed' || s.status === 'done').length}/{steps.length} steps
                    </span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {Math.round(pct)}%
                    </span>
                  </div>
                </div>

                {/* Hardware info */}
                {(hw.cpu || hw.ram || hw.disk) && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>
                    {[hw.cpu, hw.ram, hw.disk].filter(Boolean).join(' / ')}
                  </div>
                )}

                {/* Last seen */}
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  Ultimo contatto: {deploy.last_seen ? new Date(deploy.last_seen).toLocaleString('it-IT') : 'Mai'}
                </div>

                {/* Mini timeline */}
                {steps.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 8, overflow: 'hidden' }}>
                    {steps.map((step, i) => {
                      let bg = 'var(--bg-surface3)';
                      if (step.status === 'completed' || step.status === 'done') bg = 'var(--green)';
                      else if (step.status === 'running') bg = 'var(--accent)';
                      else if (step.status === 'failed' || step.status === 'error') bg = 'var(--red)';
                      return (
                        <div
                          key={step.id || i}
                          title={step.nome || step.name || `Step ${i + 1}`}
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
                    <div className="wf-timeline" style={{ marginBottom: 12 }}>
                      {(expandedData.steps || expandedData?.assignment?.steps || steps).map((step, i) => {
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

                    {/* Hardware */}
                    {(expandedData.hardware || expandedData?.assignment?.hardware) && (
                      <>
                        <div className="section-title">Hardware</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                          {Object.entries(expandedData.hardware || expandedData?.assignment?.hardware || {}).map(([k, v]) => (
                            <div key={k}>
                              <span style={{ color: 'var(--text-dim)', fontWeight: 600, textTransform: 'capitalize' }}>{k}: </span>
                              <span>{v}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Logs */}
                    {(expandedData.logs || expandedData?.assignment?.logs || []).length > 0 && (
                      <>
                        <div className="section-title">Log Output</div>
                        <div style={{
                          background: 'var(--bg-primary)', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)', padding: 8, maxHeight: 150, overflowY: 'auto',
                          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)',
                        }}>
                          {(expandedData.logs || expandedData?.assignment?.logs || []).map((log, i) => (
                            <div key={i} style={{ padding: '1px 0' }}>
                              {log.timestamp && (
                                <span style={{ color: 'var(--text-dim)', marginRight: 6 }}>
                                  {new Date(log.timestamp).toLocaleTimeString('it-IT')}
                                </span>
                              )}
                              <span style={{
                                color: log.level === 'error' ? 'var(--red)' : log.level === 'warn' ? 'var(--amber)' : 'var(--text-muted)',
                              }}>
                                {log.message || log.text || JSON.stringify(log)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
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
