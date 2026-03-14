import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ToastContainer, useToast } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';
import api from './services/api';
import store from './services/store';
import logger from './services/logger';

/* ── Tab Components ──────────────────────────────────────── */
import NetworkTab from './tabs/NetworkTab';
import PcsTab from './tabs/PcsTab';
import CrTab from './tabs/CrTab';
import WorkflowsTab from './tabs/WorkflowsTab';
import AssignmentsTab from './tabs/AssignmentsTab';
import DeployTab from './tabs/DeployTab';
import CertsTab from './tabs/CertsTab';
import SoftwareTab from './tabs/SoftwareTab';
import PxeTab from './tabs/PxeTab';
import SettingsTab from './tabs/SettingsTab';

/* ── Placeholder for any future tabs ─────── */
const PlaceholderTab = ({ name }) => (
  <div className="empty-state">
    <div className="icon">&#9881;</div>
    <div className="title">{name}</div>
    <div className="desc">Questo modulo e in fase di sviluppo.</div>
  </div>
);

const AboutTab = () => (
  <div style={{ padding: 40, textAlign: 'center' }}>
    <div style={{
      fontSize: 48,
      fontFamily: 'var(--font-mono)',
      fontWeight: 700,
      color: 'var(--accent)',
      marginBottom: 8,
    }}>
      N
    </div>
    <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>NovaSCM</div>
    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
      v3.0.0 — Electron Edition
    </div>
    <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.8 }}>
      Enterprise Deployment &amp; Asset Management<br />
      SCCM-like change request workflows, PXE boot,<br />
      network scanning, and certificate management.<br /><br />
      &copy; 2026 PolarisCore
    </div>
  </div>
);

/* ── Navigation Definitions ──────────────────────────────── */
const NAV_SECTIONS = [
  {
    label: 'ASSET',
    items: [
      { id: 'rete',        icon: '\uD83C\uDF10', label: 'Rete' },
      { id: 'certificati', icon: '\uD83D\uDD12', label: 'Certificati' },
      { id: 'software',    icon: '\uD83D\uDCE6', label: 'Software' },
      { id: 'pc',          icon: '\uD83D\uDCBB', label: 'PC Gestiti' },
    ],
  },
  {
    label: 'DISTRIBUZIONE',
    items: [
      { id: 'cr',          icon: '\uD83D\uDCCB', label: 'Change Requests' },
      { id: 'workflows',   icon: '\u2699\uFE0F', label: 'Workflows' },
      { id: 'assignments', icon: '\uD83D\uDD17', label: 'Assegnazioni' },
      { id: 'deploy',      icon: '\uD83D\uDE80', label: 'Deploy Floor' },
    ],
  },
  {
    label: 'INFRASTRUTTURA',
    items: [
      { id: 'pxe', icon: '\uD83D\uDDA5\uFE0F', label: 'PXE Boot' },
    ],
  },
  {
    label: 'AMMINISTRAZIONE',
    items: [
      { id: 'settings', icon: '\u2699\uFE0F', label: 'Impostazioni' },
      { id: 'about',    icon: '\u2139\uFE0F', label: 'About' },
    ],
  },
];

/* Tab ID -> Component mapping */
const TAB_COMPONENTS = {
  rete:        NetworkTab,
  certificati: CertsTab,
  software:    SoftwareTab,
  pc:          PcsTab,
  cr:          CrTab,
  workflows:   WorkflowsTab,
  assignments: AssignmentsTab,
  deploy:      DeployTab,
  pxe:         PxeTab,
  settings:    SettingsTab,
  about:       AboutTab,
};

/* Build flat label lookup and ordered tab list */
const TAB_LABELS = {};
NAV_SECTIONS.forEach((s) => s.items.forEach((i) => { TAB_LABELS[i.id] = i.label; }));
const TAB_ORDER = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.id));

/* ── Ribbon Tab Names ────────────────────────────────────── */
const RIBBON_TABS = ['Home', 'Visualizza', 'Strumenti'];

/* ═══════════════════════════════════════════════════════════
   AppInner — main application shell
   Must live inside ToastContainer + ConfirmProvider
   ═══════════════════════════════════════════════════════════ */
function AppInner() {
  const { toast } = useToast();

  /* ── Core State ────────────────────────────────────────── */
  const [activeTab, setActiveTab]             = useState('rete');
  const [ribbonTab, setRibbonTab]             = useState('Home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showLog, setShowLog]                 = useState(false);
  const [config, setConfig]                   = useState(() => store.loadConfig());
  const [serverOnline, setServerOnline]       = useState(false);
  const [serverVersion, setServerVersion]     = useState('');
  const [clock, setClock]                     = useState('');
  const [logs, setLogs]                       = useState(() => logger.getEntries());
  const [logFilter, setLogFilter]             = useState('all');
  const [uptime, setUptime]                   = useState(0);

  /* ── Refs ──────────────────────────────────────────────── */
  const startTimeRef   = useRef(Date.now());
  const logEndRef      = useRef(null);
  const healthTimerRef = useRef(null);

  /* ── Clock (updates every second) ──────────────────────── */
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(
        now.getHours().toString().padStart(2, '0') + ':' +
        now.getMinutes().toString().padStart(2, '0') + ':' +
        now.getSeconds().toString().padStart(2, '0')
      );
      setUptime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /* ── Format uptime as HH:MM:SS ────────────────────────── */
  const formatUptime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return (
      h.toString().padStart(2, '0') + ':' +
      m.toString().padStart(2, '0') + ':' +
      s.toString().padStart(2, '0')
    );
  };

  /* ── Logger listener — sync UI with logger service ─────── */
  useEffect(() => {
    const unsub = logger.onEntry(() => {
      setLogs([...logger.getEntries()]);
    });
    return unsub;
  }, []);

  /* ── Auto-scroll log panel to bottom ───────────────────── */
  useEffect(() => {
    if (showLog && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLog]);

  /* ── addLog: write to logger + trigger UI refresh ──────── */
  const addLog = useCallback((msg, level = 'info') => {
    logger.log(msg, level);
  }, []);

  /* ── Health Check ──────────────────────────────────────── */
  const checkServerHealth = useCallback(async () => {
    try {
      const data = await api.checkHealth();
      setServerOnline(true);
      if (data && data.version) {
        setServerVersion(data.version);
      }
    } catch {
      setServerOnline(false);
      setServerVersion('');
    }
  }, []);

  /* ── Initialization on mount ───────────────────────────── */
  useEffect(() => {
    const cfg = store.loadConfig();
    setConfig(cfg);
    api.configure(cfg.apiUrl, cfg.apiKey);

    addLog('NovaSCM v3.0.0 avviato');
    addLog('Server configurato: ' + cfg.apiUrl);

    // Immediate health check, then poll every 30 seconds
    checkServerHealth();
    healthTimerRef.current = setInterval(checkServerHealth, 30000);

    return () => {
      if (healthTimerRef.current) clearInterval(healthTimerRef.current);
    };
  }, [addLog, checkServerHealth]);

  /* ── Config save helper (used by SettingsTab etc.) ─────── */
  const updateConfig = useCallback((newCfg) => {
    const merged = { ...config, ...newCfg };
    store.saveConfig(merged);
    setConfig(merged);
    api.configure(merged.apiUrl, merged.apiKey);
    addLog('Configurazione aggiornata');
  }, [config, addLog]);

  /* ── Keyboard Shortcuts ────────────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      /* Ctrl+1..9 — switch tabs by index */
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 9 && num <= TAB_ORDER.length) {
          e.preventDefault();
          setActiveTab(TAB_ORDER[num - 1]);
          return;
        }
      }
      /* F5 — refresh / health check */
      if (e.key === 'F5') {
        e.preventDefault();
        checkServerHealth();
        toast('Health check eseguito', 'info');
        return;
      }
      /* Ctrl+L — toggle log panel */
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        setShowLog((v) => !v);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [checkServerHealth, toast]);

  /* ── Ribbon Action Dispatcher ──────────────────────────── */
  const ribbonAction = useCallback((action) => {
    switch (action) {
      /* -- Home ribbon -- */
      case 'nuovo-cr':
        setActiveTab('cr');
        addLog('Navigato a Change Requests (Nuovo)');
        break;
      case 'proprieta':
        toast('Seleziona un elemento per vederne le proprieta', 'info');
        break;
      case 'elimina':
        toast('Seleziona un elemento da eliminare', 'warning');
        break;
      case 'distribuisci':
        setActiveTab('deploy');
        addLog('Navigato a Deploy Floor');
        break;
      case 'stato':
        checkServerHealth();
        toast('Aggiornamento stato...', 'info');
        break;
      case 'aggiorna':
        checkServerHealth();
        addLog('Aggiornamento manuale eseguito');
        break;
      case 'importa':
        toast('Importazione: seleziona un file JSON', 'info');
        break;
      case 'esporta':
        toast('Esportazione dati...', 'info');
        break;
      case 'impostazioni':
        setActiveTab('settings');
        break;

      /* -- Visualizza ribbon -- */
      case 'toggle-log':
        setShowLog((v) => !v);
        break;
      case 'toggle-sidebar':
        setSidebarCollapsed((v) => !v);
        break;
      case 'tema':
        toast('Tema: dark (unico tema disponibile)', 'info');
        break;

      /* -- Strumenti ribbon -- */
      case 'scanner-rete':
        setActiveTab('rete');
        addLog('Avvio scanner rete');
        break;
      case 'test-connessione':
        checkServerHealth().then(() => {
          toast(
            serverOnline ? 'Server raggiungibile' : 'Server non raggiungibile',
            serverOnline ? 'success' : 'error'
          );
        });
        break;
      case 'genera-token':
        api.getEnrollmentToken()
          .then((data) => {
            const token = data.token || JSON.stringify(data);
            toast('Token: ' + token, 'success');
            addLog('Token enrollment generato');
          })
          .catch(() => toast('Errore generazione token', 'error'));
        break;
      case 'scarica-agent':
        toast('Download agent in corso...', 'info');
        addLog('Richiesta download agent');
        break;
      default:
        break;
    }
  }, [addLog, checkServerHealth, serverOnline, toast]);

  /* ── Log Helpers ───────────────────────────────────────── */
  const clearLogs = useCallback(() => {
    logger.clear();
    setLogs([]);
    toast('Log cancellati', 'info');
  }, [toast]);

  const exportLogs = useCallback(() => {
    const text = logger.export();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'novascm-log-' + new Date().toISOString().slice(0, 10) + '.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast('Log esportati', 'success');
  }, [toast]);

  /* Filtered log entries */
  const filteredLogs = logFilter === 'all'
    ? logs
    : logs.filter((l) => l.level === logFilter);

  /* ── Window Controls (Electron IPC) ────────────────────── */
  const winMinimize = () => { window.electronAPI?.window?.minimize?.(); };
  const winMaximize = () => { window.electronAPI?.window?.maximize?.(); };
  const winClose    = () => { window.electronAPI?.window?.close?.(); };

  /* ── Resolve Active Tab Component ──────────────────────── */
  const ActiveComponent = TAB_COMPONENTS[activeTab] || (() => <PlaceholderTab name={activeTab} />);

  /* ── Ribbon Actions Content (changes per ribbon tab) ───── */
  const renderRibbonActions = () => {
    switch (ribbonTab) {
      case 'Home':
        return (
          <>
            <div className="ribbon-group">
              <button className="rbtn" onClick={() => ribbonAction('nuovo-cr')}>
                <span className="icon">+</span>Nuovo CR
              </button>
              <button className="rbtn" onClick={() => ribbonAction('proprieta')}>
                <span className="icon">{'\u229E'}</span>Proprieta
              </button>
              <button className="rbtn" onClick={() => ribbonAction('elimina')}>
                <span className="icon">{'\u2715'}</span>Elimina
              </button>
            </div>
            <div className="ribbon-group">
              <button className="rbtn" onClick={() => ribbonAction('distribuisci')}>
                <span className="icon">{'\u25B6'}</span>Distribuisci
              </button>
              <button className="rbtn" onClick={() => ribbonAction('stato')}>
                <span className="icon">{'\u25C9'}</span>Stato
              </button>
              <button className="rbtn" onClick={() => ribbonAction('aggiorna')}>
                <span className="icon">{'\u21BB'}</span>Aggiorna
              </button>
            </div>
            <div className="ribbon-group">
              <button className="rbtn" onClick={() => ribbonAction('importa')}>
                <span className="icon">{'\u2193'}</span>Importa
              </button>
              <button className="rbtn" onClick={() => ribbonAction('esporta')}>
                <span className="icon">{'\u2191'}</span>Esporta
              </button>
              <button className="rbtn" onClick={() => ribbonAction('impostazioni')}>
                <span className="icon">{'\u2699'}</span>Impostazioni
              </button>
            </div>
          </>
        );

      case 'Visualizza':
        return (
          <div className="ribbon-group">
            <button className="rbtn" onClick={() => ribbonAction('toggle-log')}>
              <span className="icon">{'\u2630'}</span>Pannello Log
            </button>
            <button className="rbtn" onClick={() => ribbonAction('toggle-sidebar')}>
              <span className="icon">{'\u25E7'}</span>Sidebar
            </button>
            <button className="rbtn" onClick={() => ribbonAction('tema')}>
              <span className="icon">{'\u25D0'}</span>Tema
            </button>
          </div>
        );

      case 'Strumenti':
        return (
          <div className="ribbon-group">
            <button className="rbtn" onClick={() => ribbonAction('scanner-rete')}>
              <span className="icon">{'\u2295'}</span>Scanner Rete
            </button>
            <button className="rbtn" onClick={() => ribbonAction('test-connessione')}>
              <span className="icon">{'\u21C6'}</span>Test Connessione
            </button>
            <button className="rbtn" onClick={() => ribbonAction('genera-token')}>
              <span className="icon">{'\uD83D\uDD11'}</span>Genera Token
            </button>
            <button className="rbtn" onClick={() => ribbonAction('scarica-agent')}>
              <span className="icon">{'\u2B07'}</span>Scarica Agent
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  /* ═════════════════════════════════════════════════════════
     RENDER
     ═════════════════════════════════════════════════════════ */
  return (
    <>
      {/* ────────────────────────────────────────────────────
          TITLEBAR (36px, custom frameless)
          ──────────────────────────────────────────────────── */}
      <div className="titlebar" style={{ height: 36 }}>
        {/* Logo */}
        <span className="titlebar-logo">
          <span style={{ fontSize: 14, marginRight: 6 }}>N</span>
          NOVASCM
        </span>

        {/* Version */}
        <span className="titlebar-version">v3.0.0</span>

        {/* Spacer (already handled by margin-right:auto on version) */}

        {/* Connection status dot */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: serverOnline ? 'var(--green)' : 'var(--red)',
            marginRight: 10,
            flexShrink: 0,
            boxShadow: serverOnline
              ? '0 0 6px rgba(16,185,129,0.5)'
              : '0 0 6px rgba(239,68,68,0.5)',
          }}
          title={serverOnline ? 'Online' + (serverVersion ? ' (' + serverVersion + ')' : '') : 'Offline'}
        />

        {/* Clock */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-muted)',
          marginRight: 12,
          WebkitAppRegion: 'no-drag',
        }}>
          {clock}
        </span>

        {/* Window buttons */}
        <button className="titlebar-btn" onClick={winMinimize} title="Minimizza">
          <svg width="10" height="1"><rect width="10" height="1" fill="currentColor" /></svg>
        </button>
        <button className="titlebar-btn" onClick={winMaximize} title="Massimizza">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        </button>
        <button className="titlebar-btn close" onClick={winClose} title="Chiudi">
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <line x1="0" y1="0" x2="10" y2="10" />
            <line x1="10" y1="0" x2="0" y2="10" />
          </svg>
        </button>
      </div>

      {/* ────────────────────────────────────────────────────
          RIBBON BAR
          ──────────────────────────────────────────────────── */}
      <div className="ribbon">
        {/* Ribbon tab strip */}
        <div className="ribbon-tabs">
          {RIBBON_TABS.map((tab) => (
            <div
              key={tab}
              className={'ribbon-tab' + (ribbonTab === tab ? ' active' : '')}
              onClick={() => setRibbonTab(tab)}
            >
              {tab}
            </div>
          ))}
        </div>

        {/* Ribbon action row (changes per selected ribbon tab) */}
        <div className="ribbon-actions">
          {renderRibbonActions()}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────
          BODY (sidebar + content)
          ──────────────────────────────────────────────────── */}
      <div className="app-body">

        {/* ── Sidebar (240px, collapsible) ─────────────── */}
        <div
          className={'sidebar' + (sidebarCollapsed ? ' collapsed' : '')}
          style={{ width: sidebarCollapsed ? 0 : 240 }}
        >
          {NAV_SECTIONS.map((section) => (
            <div className="sidebar-section" key={section.label}>
              <div
                className="sidebar-header"
                onDoubleClick={() => setSidebarCollapsed(true)}
                title="Doppio clic per comprimere"
              >
                {section.label}
              </div>
              {section.items.map((item) => (
                <div
                  key={item.id}
                  className={'sidebar-item' + (activeTab === item.id ? ' active' : '')}
                  onClick={() => setActiveTab(item.id)}
                  style={activeTab === item.id ? {
                    borderLeft: '3px solid var(--accent)',
                    paddingLeft: 21,
                    background: 'rgba(59,130,246,0.08)',
                  } : undefined}
                >
                  <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                  {item.badge != null && (
                    <span className="badge">{item.badge}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* ── Content Area ─────────────────────────────── */}
        <div className="content">
          <div className="tab-content">
            <ActiveComponent
              addLog={addLog}
              config={config}
              updateConfig={updateConfig}
              setConfig={updateConfig}
              toast={toast}
              serverOnline={serverOnline}
            />
          </div>

          {/* ── Log Panel (collapsible, bottom of content) */}
          {showLog && (
            <div style={{
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 200,
              flexShrink: 0,
            }}>
              {/* Log header bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 12px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-surface2)',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-muted)',
                flexShrink: 0,
              }}>
                <span style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  Log di Sistema
                </span>

                {/* Level filter dropdown */}
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    marginLeft: 8,
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">Tutti</option>
                  <option value="info">Info</option>
                  <option value="success">Successo</option>
                  <option value="warn">Warning</option>
                  <option value="error">Errori</option>
                </select>

                <span style={{ flex: 1 }} />

                <button
                  className="btn"
                  style={{ padding: '2px 8px', fontSize: 10 }}
                  onClick={clearLogs}
                >
                  Pulisci
                </button>
                <button
                  className="btn"
                  style={{ padding: '2px 8px', fontSize: 10 }}
                  onClick={exportLogs}
                >
                  Esporta
                </button>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: '0 4px',
                    lineHeight: 1,
                  }}
                  onClick={() => setShowLog(false)}
                  title="Chiudi log"
                >
                  {'\u2715'}
                </button>
              </div>

              {/* Log entries (scrollable) */}
              <div className="log-panel" style={{ flex: 1, maxHeight: 'none', overflow: 'auto' }}>
                {filteredLogs.length === 0 && (
                  <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
                    Nessun log.
                  </div>
                )}
                {filteredLogs.map((entry, i) => (
                  <div key={i} className={'log-entry ' + entry.level}>
                    <span className="ts">{entry.ts.slice(11, 19)}</span>
                    <span style={{ marginRight: 6 }}>
                      [{entry.level.toUpperCase().padEnd(7)}]
                    </span>
                    {entry.msg}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────
          STATUS BAR (28px)
          ──────────────────────────────────────────────────── */}
      <div className="statusbar" style={{ height: 28 }}>
        {/* Server status */}
        <span className="statusbar-item">
          <span className={'statusbar-dot ' + (serverOnline ? 'green' : 'red')} />
          {serverOnline ? 'Server Online' : 'Server Offline'}
          {serverOnline && serverVersion && (
            <span style={{ marginLeft: 4, color: 'var(--text-dim)', fontSize: 10 }}>
              ({serverVersion})
            </span>
          )}
        </span>

        {/* Active tab name */}
        <span className="statusbar-item" style={{ color: 'var(--accent)' }}>
          {TAB_LABELS[activeTab] || activeTab}
        </span>

        {/* Right side */}
        <span className="statusbar-right">
          <span className="statusbar-item">
            Log: {logs.length}
          </span>
          <span className="statusbar-item" style={{ fontFamily: 'var(--font-mono)' }}>
            {formatUptime(uptime)}
          </span>
          <span className="statusbar-item">
            &copy; 2026 PolarisCore
          </span>
        </span>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   App — Root component.
   Wraps AppInner in ToastContainer + ConfirmProvider
   so that useToast() and useConfirm() are available everywhere.
   ═══════════════════════════════════════════════════════════ */
export default function App() {
  return (
    <ToastContainer>
      <ConfirmProvider>
        <AppInner />
      </ConfirmProvider>
    </ToastContainer>
  );
}
