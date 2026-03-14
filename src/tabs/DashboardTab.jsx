import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../services/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr) {
  if (!dateStr) return 'N/D';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'adesso';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} or${hours === 1 ? 'a' : 'e'} fa`;
  const days = Math.floor(hours / 24);
  return `${days} giorn${days === 1 ? 'o' : 'i'} fa`;
}

function activityIcon(type) {
  if (type === 'cr') return '\uD83D\uDCCB';       // clipboard
  if (type === 'deploy') return '\uD83D\uDE80';    // rocket
  if (type === 'error') return '\u26A0\uFE0F';     // warning
  return '\uD83D\uDD35';                            // blue circle
}

function activityColor(type) {
  if (type === 'cr') return 'var(--accent)';
  if (type === 'deploy') return 'var(--green)';
  if (type === 'error') return 'var(--red)';
  return 'var(--text-muted)';
}

// ---------------------------------------------------------------------------
// Skeleton placeholders
// ---------------------------------------------------------------------------

function SkeletonStatCards() {
  return (
    <div className="stat-row">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="stat-card">
          <div className="skeleton skeleton-line w-50" style={{ marginBottom: 12 }} />
          <div className="skeleton skeleton-line w-25" style={{ height: 28, marginBottom: 8 }} />
          <div className="skeleton skeleton-line w-75" />
        </div>
      ))}
    </div>
  );
}

function SkeletonPanel() {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="skeleton skeleton-line w-50" style={{ marginBottom: 12 }} />
      <div className="skeleton skeleton-line w-75" style={{ marginBottom: 6 }} />
      <div className="skeleton skeleton-line w-75" style={{ marginBottom: 6 }} />
      <div className="skeleton skeleton-line w-50" />
    </div>
  );
}

function SkeletonActivityFeed() {
  return (
    <div className="card">
      <div className="skeleton skeleton-line w-50" style={{ marginBottom: 16 }} />
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div className="skeleton skeleton-circle" style={{ width: 28, height: 28 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton skeleton-line w-75" style={{ marginBottom: 4 }} />
            <div className="skeleton skeleton-line w-25" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({ icon, label, value, color, borderColor }) {
  return (
    <div className={`stat-card stat-bordered-${borderColor}`}>
      <div className="stat-header">
        <span className="stat-icon" style={{ color: `var(--${borderColor})` }}>{icon}</span>
      </div>
      <div className={`stat-value ${color}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Server Status Panel
// ---------------------------------------------------------------------------

function ServerStatusPanel({ serverOnline, serverInfo, lastCheck }) {
  const baseUrl = api.getBaseUrl() || 'Non configurato';

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{'\uD83D\uDDA5\uFE0F'}</span>
        Stato Server
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
        <div>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>URL</span>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {baseUrl}
          </div>
        </div>
        <div>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Stato</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: serverOnline ? 'var(--green)' : 'var(--red)',
              boxShadow: serverOnline ? '0 0 8px var(--green)' : '0 0 8px var(--red)',
            }} />
            <span style={{ fontSize: 12, color: serverOnline ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
              {serverOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
        <div>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Versione API</span>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {serverInfo?.version || 'N/D'}
          </div>
        </div>
        <div>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ultimo Controllo</span>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {lastCheck ? new Date(lastCheck).toLocaleTimeString('it-IT') : 'Mai'}
          </div>
        </div>
        {serverInfo?.uptime != null && (
          <div>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Uptime</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {serverInfo.uptime}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Feed
// ---------------------------------------------------------------------------

function ActivityFeed({ activities }) {
  if (activities.length === 0) {
    return (
      <div className="card">
        <div className="card-header">{'\uD83D\uDCCA'} Attivit\u00E0 Recente</div>
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-dim)', fontSize: 12 }}>
          Nessuna attivit\u00E0 recente
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">{'\uD83D\uDCCA'} Attivit\u00E0 Recente</div>
      <div style={{ maxHeight: 340, overflowY: 'auto' }} className="scrollbar-thin">
        {activities.map((item, i) => (
          <div
            key={item.id || i}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0',
              borderBottom: i < activities.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}
          >
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, flexShrink: 0,
              background: `color-mix(in srgb, ${activityColor(item.type)} 12%, transparent)`,
            }}>
              {activityIcon(item.type)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {item.description}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                {relativeTime(item.date)}
              </div>
            </div>
            <span className={`tag ${item.tagClass}`} style={{ flexShrink: 0, fontSize: 10 }}>
              {item.tagLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Actions
// ---------------------------------------------------------------------------

function QuickActions({ onNavigate }) {
  const actions = [
    { label: 'Nuovo CR', icon: '\uD83D\uDCDD', tab: 'cr', variant: 'primary' },
    { label: 'Scan Rete', icon: '\uD83D\uDD0D', tab: 'network', variant: 'outline' },
    { label: 'Assegna Workflow', icon: '\u2699\uFE0F', tab: 'assignments', variant: 'outline' },
  ];

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">{'\u26A1'} Azioni Rapide</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {actions.map(a => (
          <button
            key={a.tab}
            className={`btn ${a.variant}`}
            onClick={() => onNavigate?.(a.tab)}
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fleet Health Bar
// ---------------------------------------------------------------------------

function FleetHealthBar({ online, deploying, offline, error }) {
  const total = online + deploying + offline + error;
  if (total === 0) return null;

  const segments = [
    { count: online, color: 'var(--green)', label: 'Online' },
    { count: deploying, color: 'var(--accent)', label: 'In Deploy' },
    { count: offline, color: 'var(--text-dim)', label: 'Offline' },
    { count: error, color: 'var(--red)', label: 'Errore' },
  ];

  return (
    <div className="card">
      <div className="card-header">{'\uD83C\uDFE2'} Salute Flotta</div>
      {/* Bar */}
      <div style={{
        display: 'flex', height: 18, borderRadius: 'var(--radius-pill)',
        overflow: 'hidden', background: 'var(--bg-primary)', marginBottom: 10,
      }}>
        {segments.map((seg, i) => {
          if (seg.count === 0) return null;
          const pct = (seg.count / total) * 100;
          return (
            <div
              key={i}
              title={`${seg.label}: ${seg.count}`}
              style={{
                width: `${pct}%`, background: seg.color, minWidth: seg.count > 0 ? 4 : 0,
                transition: 'width 0.5s ease',
              }}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-muted)' }}>{seg.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL = 30000;

export default function DashboardTab({ addLog, config, updateConfig, toast, serverOnline, onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);
  const [serverInfo, setServerInfo] = useState(null);

  // Data
  const [pcOnline, setPcOnline] = useState(0);
  const [activeDeploys, setActiveDeploys] = useState(0);
  const [openCrs, setOpenCrs] = useState(0);
  const [workflowCount, setWorkflowCount] = useState(0);
  const [activities, setActivities] = useState([]);
  const [fleet, setFleet] = useState({ online: 0, deploying: 0, offline: 0, error: 0 });

  const timerRef = useRef(null);

  // -----------------------------------------------------------------------
  // Fetch all dashboard data
  // -----------------------------------------------------------------------
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (silent) setRefreshing(true);
    const now = Date.now();

    // PC Online -- from localStorage network scan cache
    let currentPcOnline = 0;
    try {
      const cached = localStorage.getItem('networkScanResults');
      if (cached) {
        const parsed = JSON.parse(cached);
        const list = Array.isArray(parsed) ? parsed : parsed?.hosts || parsed?.results || [];
        currentPcOnline = list.filter(h => h.online !== false && h.status !== 'offline').length;
        setPcOnline(currentPcOnline);
      }
    } catch { /* ignore parse errors */ }

    // Check if API is configured
    if (!api.getBaseUrl()) {
      setLastCheck(now);
      setActiveDeploys(0);
      setOpenCrs(0);
      setWorkflowCount(0);
      setActivities([]);
      setFleet({ online: 0, deploying: 0, offline: 0, error: 0 });
      setServerInfo(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      // Parallel API calls via Promise.allSettled (graceful per-call failure)
      const results = await Promise.allSettled([
        api.getPcWorkflows(),
        api.getCrList(),
        api.getWorkflows(),
        api.getVersion(),
        api.checkHealth(),
      ]);

      // Track how many calls succeeded
      const anySuccess = results.some(r => r.status === 'fulfilled');

      // If ALL calls failed, server is likely offline -- reset everything
      if (!anySuccess) {
        setActiveDeploys(0);
        setOpenCrs(0);
        setWorkflowCount(0);
        setActivities([]);
        setFleet({ online: 0, deploying: 0, offline: 0, error: 0 });
        setServerInfo(null);
        setLastCheck(now);
        if (!silent) addLog?.('Server non raggiungibile', 'error');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // --- PC Workflows (deploys) ---
      const deploysRaw = results[0].status === 'fulfilled' ? results[0].value : null;
      const deploysList = Array.isArray(deploysRaw) ? deploysRaw : deploysRaw?.assignments || [];
      const running = deploysList.filter(d => d.status === 'running');
      const failed = deploysList.filter(d => d.status === 'failed' || d.status === 'error');
      setActiveDeploys(running.length);

      // --- CRs ---
      const crsRaw = results[1].status === 'fulfilled' ? results[1].value : null;
      const crsList = Array.isArray(crsRaw) ? crsRaw : crsRaw?.crs || crsRaw?.change_requests || [];
      const open = crsList.filter(cr => cr.status !== 'completed' && cr.status !== 'done');
      setOpenCrs(open.length);

      // --- Workflows ---
      const wfRaw = results[2].status === 'fulfilled' ? results[2].value : null;
      const wfList = Array.isArray(wfRaw) ? wfRaw : wfRaw?.workflows || [];
      setWorkflowCount(wfList.length);

      // --- Version ---
      if (results[3].status === 'fulfilled') {
        setServerInfo(prev => ({ ...prev, ...results[3].value }));
      }

      // --- Health ---
      if (results[4].status === 'fulfilled') {
        const health = results[4].value;
        setServerInfo(prev => ({
          ...prev,
          uptime: health?.uptime || prev?.uptime,
        }));
      }

      setLastCheck(now);

      // --- Build activity feed ---
      const acts = [];

      crsList.forEach(cr => {
        const statusLabel = cr.status === 'completed' || cr.status === 'done' ? 'Completato'
          : cr.status === 'failed' || cr.status === 'error' ? 'Errore'
          : cr.status === 'running' ? 'In Corso'
          : 'Aperto';
        const tagClass = cr.status === 'completed' || cr.status === 'done' ? 'green'
          : cr.status === 'failed' || cr.status === 'error' ? 'red'
          : 'blue';
        const isError = cr.status === 'failed' || cr.status === 'error';
        acts.push({
          id: `cr-${cr.id}`,
          type: isError ? 'error' : 'cr',
          description: `CR: ${cr.name || cr.nome || cr.id}`,
          date: cr.updated_at || cr.created_at || cr.date,
          tagLabel: statusLabel,
          tagClass,
        });
      });

      deploysList.forEach(d => {
        const statusLabel = d.status === 'completed' || d.status === 'done' ? 'Completato'
          : d.status === 'failed' || d.status === 'error' ? 'Fallito'
          : d.status === 'running' ? 'In Corso'
          : 'In Attesa';
        const tagClass = d.status === 'completed' || d.status === 'done' ? 'green'
          : d.status === 'failed' || d.status === 'error' ? 'red'
          : d.status === 'running' ? 'blue'
          : 'muted';
        const isError = d.status === 'failed' || d.status === 'error';
        acts.push({
          id: `deploy-${d.id}`,
          type: isError ? 'error' : 'deploy',
          description: `Deploy: ${d.pc_name || d.id}`,
          date: d.updated_at || d.created_at || d.last_seen,
          tagLabel: statusLabel,
          tagClass,
        });
      });

      // Sort by date descending, take 10
      acts.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da;
      });
      setActivities(acts.slice(0, 10));

      // --- Fleet health (use currentPcOnline from this closure, not stale state) ---
      setFleet({
        online: Math.max(0, currentPcOnline - running.length - failed.length),
        deploying: running.length,
        offline: 0,
        error: failed.length,
      });

    } catch (e) {
      // Unexpected top-level error
      setActiveDeploys(0);
      setOpenCrs(0);
      setWorkflowCount(0);
      setActivities([]);
      setFleet({ online: 0, deploying: 0, offline: 0, error: 0 });
      setServerInfo(null);
      if (!silent) addLog?.(`Errore caricamento dashboard: ${e.message}`, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addLog]);

  // Initial load
  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    timerRef.current = setInterval(() => fetchData(true), REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetchData]);

  // Manual refresh handler
  const handleRefresh = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          padding: '12px 16px', background: 'var(--bg-surface2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>Dashboard</span>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
            Caricamento...
          </div>
        </div>
        <SkeletonStatCards />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <SkeletonPanel />
            <SkeletonPanel />
          </div>
          <SkeletonActivityFeed />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
        padding: '12px 16px', background: 'var(--bg-surface2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Dashboard</span>
        <span className="tag blue" style={{ fontSize: 10 }}>Panoramica</span>
        {!serverOnline && (
          <span className="tag red" style={{ fontSize: 10 }}>Server Offline</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-dim)' }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: serverOnline ? 'var(--green)' : 'var(--red)',
            }} />
            Auto-refresh 30s
          </div>
          <button
            className="btn btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Aggiorno...' : '\uD83D\uDD04 Aggiorna'}
          </button>
        </div>
      </div>

      {/* 1. Stat Cards */}
      <div className="stat-row">
        <StatCard
          icon={'\uD83D\uDCBB'}
          label="PC Online"
          value={serverOnline ? pcOnline : 0}
          color="green"
          borderColor="green"
        />
        <StatCard
          icon={'\uD83D\uDE80'}
          label="Deploy Attivi"
          value={serverOnline ? activeDeploys : 0}
          color="accent"
          borderColor="accent"
        />
        <StatCard
          icon={'\uD83D\uDCCB'}
          label="CR Aperti"
          value={serverOnline ? openCrs : 0}
          color="amber"
          borderColor="amber"
        />
        <StatCard
          icon={'\u2699\uFE0F'}
          label="Workflow"
          value={serverOnline ? workflowCount : 0}
          color="accent"
          borderColor="accent"
        />
      </div>

      {/* 2-column layout: left (server + quick actions + fleet) | right (activity) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div>
          {/* 2. Server Status */}
          <ServerStatusPanel
            serverOnline={serverOnline}
            serverInfo={serverInfo}
            lastCheck={lastCheck}
          />

          {/* 4. Quick Actions */}
          <QuickActions onNavigate={onNavigate} />

          {/* 5. Fleet Health */}
          <FleetHealthBar
            online={fleet.online}
            deploying={fleet.deploying}
            offline={fleet.offline}
            error={fleet.error}
          />
        </div>

        {/* 3. Activity Feed */}
        <ActivityFeed activities={serverOnline ? activities : []} />
      </div>
    </div>
  );
}
