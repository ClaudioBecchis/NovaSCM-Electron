import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import DataGrid from '../components/DataGrid';
import Modal from '../components/Modal';
import * as api from '../services/api';

// ── Constants ────────────────────────────────────────────────────────────────

const BOOT_ACTIONS = [
  { value: 'auto', label: 'Auto', color: 'blue' },
  { value: 'deploy', label: 'Deploy', color: 'green' },
  { value: 'local', label: 'Local Boot', color: 'muted' },
  { value: 'block', label: 'Bloccato', color: 'red' },
];

const LOG_STATUS_COLORS = {
  success: 'rgba(16, 185, 129, 0.10)',
  completed: 'rgba(16, 185, 129, 0.10)',
  error: 'rgba(239, 68, 68, 0.10)',
  failed: 'rgba(239, 68, 68, 0.10)',
};

const EMPTY_HOST = {
  mac: '',
  pc_name: '',
  boot_action: 'auto',
  workflow_id: '',
  notes: '',
};

const HOST_REFRESH_MS = 15000;
const LOG_REFRESH_MS = 10000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderBootAction(v) {
  const action = BOOT_ACTIONS.find(a => a.value === v) || { label: v || 'N/D', color: 'muted' };
  return <span className={`tag ${action.color}`}>{action.label}</span>;
}

function fmtDate(v) {
  return v ? new Date(v).toLocaleString('it-IT') : 'Mai';
}

function fmtMono(v) {
  return v ? <span style={{ fontFamily: 'var(--font-mono)' }}>{v}</span> : '';
}

// ── Column Definitions ───────────────────────────────────────────────────────

const hostColumns = [
  { key: 'mac', label: 'MAC', width: 160, render: fmtMono },
  { key: 'pc_name', label: 'Hostname' },
  { key: 'boot_action', label: 'Azione Boot', width: 120, render: renderBootAction },
  { key: 'workflow_nome', label: 'Workflow', width: 160 },
  { key: 'created_at', label: 'Creato', width: 155, render: fmtDate },
  { key: 'last_boot_at', label: 'Ultimo Boot', width: 155, render: fmtDate },
];

const logColumns = [
  { key: 'ts', label: 'Timestamp', width: 175, render: fmtDate },
  { key: 'mac', label: 'MAC', width: 160, render: fmtMono },
  { key: 'ip', label: 'IP', width: 130, render: fmtMono },
  { key: 'pc_name', label: 'Hostname' },
  { key: 'action', label: 'Azione', width: 120, render: renderBootAction },
  {
    key: 'status', label: 'Stato', width: 110,
    render: (v) => {
      if (!v) return '';
      const color = v === 'success' || v === 'completed' ? 'green'
        : v === 'error' || v === 'failed' ? 'red'
        : 'blue';
      return <span className={`tag ${color}`}>{v}</span>;
    },
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// PxeTab Component
// ═════════════════════════════════════════════════════════════════════════════

export default function PxeTab({ addLog, config, toast, serverOnline }) {
  // ── Inner tab state ────────────────────────────────────────────────────────
  const [innerTab, setInnerTab] = useState('hosts');

  // ── Data state ─────────────────────────────────────────────────────────────
  const [hosts, setHosts] = useState([]);
  const [bootLog, setBootLog] = useState([]);
  const [settings, setSettings] = useState({});
  const [pxeStatus, setPxeStatus] = useState(null);
  const [workflows, setWorkflows] = useState([]);

  // ── Loading state ──────────────────────────────────────────────────────────
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // ── Host editor state ──────────────────────────────────────────────────────
  const [selectedHost, setSelectedHost] = useState(null);
  const [showHostEditor, setShowHostEditor] = useState(false);
  const [editingHost, setEditingHost] = useState(null);
  const [hostForm, setHostForm] = useState({ ...EMPTY_HOST });
  const [savingHost, setSavingHost] = useState(false);

  // ── Settings form state ────────────────────────────────────────────────────
  const [settingsForm, setSettingsForm] = useState({});
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingTftp, setTestingTftp] = useState(false);

  // ── Refs for auto-refresh ──────────────────────────────────────────────────
  const hostsTimerRef = useRef(null);
  const logTimerRef = useRef(null);

  // ── Toaster helper (use toast if available, fallback to addLog) ────────────
  const notify = useCallback((msg, level = 'info') => {
    if (toast) {
      toast(msg, level);
    }
    addLog?.(msg, level);
  }, [toast, addLog]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchStatus = useCallback(async () => {
    try {
      setLoadingStatus(true);
      const data = await api.getPxeStatus();
      setPxeStatus(data);
    } catch (e) {
      // silent — status bar is optional
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const fetchWorkflows = useCallback(async () => {
    try {
      const data = await api.getWorkflows();
      setWorkflows(Array.isArray(data) ? data : data?.workflows || []);
    } catch {
      // silent
    }
  }, []);

  const fetchHosts = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingHosts(true);
      const data = await api.getPxeHosts();
      setHosts(Array.isArray(data) ? data : data?.hosts || []);
    } catch (e) {
      if (!silent) notify(`Errore caricamento host PXE: ${e.message}`, 'error');
    } finally {
      if (!silent) setLoadingHosts(false);
    }
  }, [notify]);

  const fetchBootLog = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingLog(true);
      const data = await api.getPxeBootLog();
      setBootLog(Array.isArray(data) ? data : data?.logs || []);
    } catch (e) {
      if (!silent) notify(`Errore caricamento boot log: ${e.message}`, 'error');
    } finally {
      if (!silent) setLoadingLog(false);
    }
  }, [notify]);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.getPxeSettings();
      const cfg = data?.settings || data || {};
      setSettings(cfg);
      setSettingsForm(cfg);
      setSettingsDirty(false);
    } catch (e) {
      notify(`Errore caricamento impostazioni PXE: ${e.message}`, 'error');
    }
  }, [notify]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetchStatus();
    fetchWorkflows();
    fetchHosts();
    fetchBootLog();
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-refresh for hosts (15s) ──────────────────────────────────────────
  useEffect(() => {
    if (innerTab === 'hosts') {
      hostsTimerRef.current = setInterval(() => fetchHosts(true), HOST_REFRESH_MS);
    }
    return () => {
      if (hostsTimerRef.current) {
        clearInterval(hostsTimerRef.current);
        hostsTimerRef.current = null;
      }
    };
  }, [innerTab, fetchHosts]);

  // ── Auto-refresh for boot log (10s) ───────────────────────────────────────
  useEffect(() => {
    if (innerTab === 'log') {
      logTimerRef.current = setInterval(() => fetchBootLog(true), LOG_REFRESH_MS);
    }
    return () => {
      if (logTimerRef.current) {
        clearInterval(logTimerRef.current);
        logTimerRef.current = null;
      }
    };
  }, [innerTab, fetchBootLog]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Host CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  const openHostEditor = useCallback((host = null) => {
    if (host) {
      setEditingHost(host);
      setHostForm({
        mac: host.mac || '',
        pc_name: host.pc_name || '',
        boot_action: host.boot_action || 'auto',
        workflow_id: host.workflow_id != null ? String(host.workflow_id) : '',
        notes: host.notes || '',
      });
    } else {
      setEditingHost(null);
      setHostForm({ ...EMPTY_HOST });
    }
    setShowHostEditor(true);
  }, []);

  const handleSaveHost = useCallback(async () => {
    if (!hostForm.mac.trim()) return;
    setSavingHost(true);
    const payload = { ...hostForm };
    if (payload.workflow_id) payload.workflow_id = parseInt(payload.workflow_id, 10);
    else delete payload.workflow_id;

    try {
      if (editingHost) {
        await api.updatePxeHost(editingHost.mac, payload);
        notify(`Host PXE aggiornato: ${hostForm.mac}`, 'success');
      } else {
        await api.createPxeHost(payload);
        notify(`Host PXE creato: ${hostForm.mac}`, 'success');
      }
      setShowHostEditor(false);
      await fetchHosts();
      await fetchStatus();
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      notify(`Errore salvataggio host: ${msg}`, 'error');
    } finally {
      setSavingHost(false);
    }
  }, [hostForm, editingHost, notify, fetchHosts, fetchStatus]);

  const handleDeleteHost = useCallback(async (host) => {
    const target = host || selectedHost;
    if (!target) return;
    if (!window.confirm(`Eliminare l'host PXE "${target.mac}"?`)) return;
    try {
      await api.deletePxeHost(target.mac);
      notify(`Host PXE eliminato: ${target.mac}`, 'success');
      setSelectedHost(null);
      await fetchHosts();
      await fetchStatus();
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      notify(`Errore eliminazione host: ${msg}`, 'error');
    }
  }, [selectedHost, notify, fetchHosts, fetchStatus]);

  const handleSetBootAction = useCallback(async (host, action) => {
    try {
      await api.updatePxeHost(host.mac, { boot_action: action });
      notify(`Boot action di ${host.mac} impostata a "${action}"`, 'success');
      await fetchHosts(true);
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      notify(`Errore aggiornamento boot action: ${msg}`, 'error');
    }
  }, [notify, fetchHosts]);

  const handleCopyMac = useCallback((host) => {
    navigator.clipboard?.writeText(host.mac)
      .then(() => notify(`MAC ${host.mac} copiato`, 'success'))
      .catch(() => notify('Errore copia MAC', 'error'));
  }, [notify]);

  // ── Context menu for hosts ─────────────────────────────────────────────────
  const hostContextMenu = useMemo(() => [
    {
      icon: '\u270F\uFE0F',
      label: 'Modifica',
      onClick: (row) => openHostEditor(row),
    },
    {
      icon: '\uD83D\uDDD1',
      label: 'Elimina',
      onClick: (row) => handleDeleteHost(row),
    },
    { divider: true },
    {
      icon: '\uD83D\uDCCB',
      label: 'Copia MAC',
      onClick: (row) => handleCopyMac(row),
    },
    { divider: true },
    ...BOOT_ACTIONS.map(a => ({
      icon: a.value === 'auto' ? '\uD83D\uDD04' : a.value === 'deploy' ? '\uD83D\uDE80' : a.value === 'local' ? '\uD83D\uDCBB' : '\u26D4',
      label: `Boot: ${a.label}`,
      onClick: (row) => handleSetBootAction(row, a.value),
    })),
  ], [openHostEditor, handleDeleteHost, handleCopyMac, handleSetBootAction]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Settings
  // ═══════════════════════════════════════════════════════════════════════════

  const updateSetting = useCallback((key, value) => {
    setSettingsForm(prev => ({ ...prev, [key]: value }));
    setSettingsDirty(true);
  }, []);

  const handleSaveSettings = useCallback(async () => {
    setSavingSettings(true);
    try {
      await api.updatePxeSettings(settingsForm);
      notify('Impostazioni PXE salvate', 'success');
      setSettingsDirty(false);
      setSettings({ ...settingsForm });
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      notify(`Errore salvataggio impostazioni: ${msg}`, 'error');
    } finally {
      setSavingSettings(false);
    }
  }, [settingsForm, notify]);

  const handleCancelSettings = useCallback(() => {
    setSettingsForm({ ...settings });
    setSettingsDirty(false);
  }, [settings]);

  const handleTestTftp = useCallback(async () => {
    setTestingTftp(true);
    try {
      const data = await api.getPxeStatus();
      setPxeStatus(data);
      if (data?.tftp_alive) {
        notify('TFTP Server raggiungibile', 'success');
      } else {
        notify('TFTP Server non raggiungibile', 'error');
      }
    } catch (e) {
      notify(`Errore test TFTP: ${e.message}`, 'error');
    } finally {
      setTestingTftp(false);
    }
  }, [notify]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Derived values
  // ═══════════════════════════════════════════════════════════════════════════

  const tftpOnline = pxeStatus?.tftp_alive === true;
  const pxeEnabled = pxeStatus?.pxe_enabled === true || pxeStatus?.pxe_enabled === '1';
  const winpeReady = pxeStatus?.winpe_ready === true;
  const hostCount = pxeStatus?.host_count ?? hosts.length;
  const bootToday = pxeStatus?.boot_today ?? 0;
  const autoProvision = settingsForm.pxe_auto_provision === '1' || settingsForm.pxe_auto_provision === true;

  // Boot log with row styling
  const styledBootLog = useMemo(() => {
    return bootLog.map(row => ({
      ...row,
      _rowStyle: LOG_STATUS_COLORS[row.status] ? { background: LOG_STATUS_COLORS[row.status] } : undefined,
    }));
  }, [bootLog]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div>
      {/* ── STATUS PANEL (always visible) ──────────────────────────────────── */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Host PXE</div>
          <div className="stat-value accent">{hostCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Boot Oggi</div>
          <div className="stat-value amber">{bootToday}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TFTP Server</div>
          <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: tftpOnline ? 'var(--green)' : 'var(--red)',
              boxShadow: tftpOnline ? '0 0 6px var(--green)' : '0 0 6px var(--red)',
            }} />
            <span className={tftpOnline ? 'green' : 'red'}>
              {tftpOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">WinPE</div>
          <div className={`stat-value ${winpeReady ? 'green' : 'amber'}`}>
            {winpeReady ? 'Pronto' : 'Incompleto'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Auto-Provision</div>
          <div className="stat-value" style={{ color: autoProvision ? 'var(--green)' : 'var(--text-dim)' }}>
            {autoProvision ? 'ON' : 'OFF'}
          </div>
        </div>
      </div>

      {/* ── Server offline warning ─────────────────────────────────────────── */}
      {serverOnline === false && (
        <div style={{
          padding: '10px 16px',
          marginBottom: 12,
          background: 'var(--red-bg)',
          border: '1px solid var(--red)',
          borderRadius: 'var(--radius)',
          color: 'var(--red)',
          fontSize: 13,
        }}>
          Server non raggiungibile — i dati potrebbero non essere aggiornati.
        </div>
      )}

      {/* ── Inner Tabs ─────────────────────────────────────────────────────── */}
      <div className="inner-tabs">
        {[
          { key: 'hosts', label: 'Host PXE' },
          { key: 'log', label: 'Boot Log' },
          { key: 'settings', label: 'Impostazioni' },
        ].map(t => (
          <div
            key={t.key}
            className={`inner-tab ${innerTab === t.key ? 'active' : ''}`}
            onClick={() => setInnerTab(t.key)}
          >
            {t.label}
          </div>
        ))}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          TAB 1: HOSTS
          ═════════════════════════════════════════════════════════════════════ */}
      {innerTab === 'hosts' && (
        <DataGrid
          columns={hostColumns}
          data={hosts}
          loading={loadingHosts}
          onRowClick={setSelectedHost}
          onRowDoubleClick={(row) => openHostEditor(row)}
          rowKey="mac"
          emptyMessage="Nessun host PXE registrato"
          contextMenu={hostContextMenu}
          actions={
            <>
              <button className="btn primary" onClick={() => openHostEditor()}>
                + Aggiungi Host
              </button>
              <button
                className="btn"
                onClick={() => selectedHost && openHostEditor(selectedHost)}
                disabled={!selectedHost}
              >
                Modifica
              </button>
              <button
                className="btn red"
                onClick={() => handleDeleteHost()}
                disabled={!selectedHost}
              >
                Elimina
              </button>
              <button className="btn" onClick={() => fetchHosts()}>
                Aggiorna
              </button>
            </>
          }
        />
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          TAB 2: BOOT LOG
          ═════════════════════════════════════════════════════════════════════ */}
      {innerTab === 'log' && (
        <DataGrid
          columns={logColumns}
          data={styledBootLog}
          loading={loadingLog}
          rowKey="id"
          emptyMessage="Nessun boot registrato"
          actions={
            <button className="btn" onClick={() => fetchBootLog()}>
              Aggiorna
            </button>
          }
        />
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          TAB 3: SETTINGS
          ═════════════════════════════════════════════════════════════════════ */}
      {innerTab === 'settings' && (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 20,
        }}>
          {/* ── TFTP Status ────────────────────────────────────────────────── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20,
            padding: '12px 16px',
            background: tftpOnline ? 'var(--green-bg)' : 'var(--red-bg)',
            border: `1px solid ${tftpOnline ? 'var(--green)' : 'var(--red)'}`,
            borderRadius: 'var(--radius)',
          }}>
            <span style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: tftpOnline ? 'var(--green)' : 'var(--red)',
              boxShadow: tftpOnline ? '0 0 8px var(--green)' : '0 0 8px var(--red)',
            }} />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>
              TFTP Server: <strong>{tftpOnline ? 'Online' : 'Offline'}</strong>
            </span>
            {pxeStatus?.winpe_files && (
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 16 }}>
                File WinPE: {Object.entries(pxeStatus.winpe_files).map(([name, size]) => (
                  <span key={name} style={{
                    marginRight: 8,
                    color: size ? 'var(--green)' : 'var(--red)',
                  }}>
                    {name} {size ? `(${size})` : '(mancante)'}
                  </span>
                ))}
              </span>
            )}
            <button
              className="btn"
              style={{ marginLeft: 'auto' }}
              onClick={handleTestTftp}
              disabled={testingTftp}
            >
              {testingTftp ? 'Test...' : 'Test TFTP'}
            </button>
          </div>

          {/* ── PXE Enabled + Auto-Provision ───────────────────────────────── */}
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-check">
                <input
                  type="checkbox"
                  checked={settingsForm.pxe_enabled === '1' || settingsForm.pxe_enabled === true}
                  onChange={e => updateSetting('pxe_enabled', e.target.checked ? '1' : '0')}
                />
                <span style={{ fontSize: 13 }}>PXE Abilitato</span>
              </label>
            </div>
            <div className="form-group">
              <label className="form-check">
                <input
                  type="checkbox"
                  checked={autoProvision}
                  onChange={e => updateSetting('pxe_auto_provision', e.target.checked ? '1' : '0')}
                />
                <span style={{ fontSize: 13 }}>Auto-Provision (registra automaticamente host al primo boot)</span>
              </label>
            </div>
          </div>

          {/* ── Defaults per Nuovi PC ──────────────────────────────────────── */}
          <div className="section-title" style={{ marginTop: 8 }}>Default per Nuovi PC</div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Prefisso Nome PC</label>
              <input
                className="form-input"
                value={settingsForm.pxe_pc_prefix || ''}
                onChange={e => updateSetting('pxe_pc_prefix', e.target.value)}
                placeholder="PC"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Dominio</label>
              <input
                className="form-input"
                value={settingsForm.pxe_default_domain || ''}
                onChange={e => updateSetting('pxe_default_domain', e.target.value)}
                placeholder="corp.example.com"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">OU (Organizational Unit)</label>
              <input
                className="form-input"
                value={settingsForm.pxe_default_ou || ''}
                onChange={e => updateSetting('pxe_default_ou', e.target.value)}
                placeholder="OU=Workstations,DC=corp,DC=example,DC=com"
              />
            </div>
            <div className="form-group">
              <label className="form-label">DC IP</label>
              <input
                className="form-input"
                value={settingsForm.pxe_default_dc_ip || ''}
                onChange={e => updateSetting('pxe_default_dc_ip', e.target.value)}
                placeholder="192.168.1.199"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Join User</label>
              <input
                className="form-input"
                value={settingsForm.pxe_default_join_user || ''}
                onChange={e => updateSetting('pxe_default_join_user', e.target.value)}
                placeholder="Administrator"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Join Password</label>
              <input
                className="form-input"
                type="password"
                value={settingsForm.pxe_default_join_pass || ''}
                onChange={e => updateSetting('pxe_default_join_pass', e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Admin Password Default</label>
              <input
                className="form-input"
                type="password"
                value={settingsForm.pxe_default_admin_pass || ''}
                onChange={e => updateSetting('pxe_default_admin_pass', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Workflow Default</label>
              <select
                className="form-select"
                value={settingsForm.pxe_default_workflow_id || ''}
                onChange={e => updateSetting('pxe_default_workflow_id', e.target.value)}
              >
                <option value="">-- Nessuno --</option>
                {workflows.map(wf => (
                  <option key={wf.id} value={wf.id}>{wf.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Save / Cancel ──────────────────────────────────────────────── */}
          <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
            <button
              className="btn primary"
              onClick={handleSaveSettings}
              disabled={!settingsDirty || savingSettings}
            >
              {savingSettings ? 'Salvataggio...' : 'Salva Impostazioni'}
            </button>
            <button
              className="btn"
              onClick={handleCancelSettings}
              disabled={!settingsDirty}
            >
              Annulla Modifiche
            </button>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          HOST EDITOR MODAL
          ═════════════════════════════════════════════════════════════════════ */}
      {showHostEditor && (
        <Modal
          title={editingHost ? `Modifica Host: ${editingHost.mac}` : 'Aggiungi Host PXE'}
          onClose={() => setShowHostEditor(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowHostEditor(false)}>Annulla</button>
              <button
                className="btn primary"
                onClick={handleSaveHost}
                disabled={!hostForm.mac.trim() || savingHost}
              >
                {savingHost ? 'Salvataggio...' : editingHost ? 'Salva' : 'Crea'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Indirizzo MAC</label>
            <input
              className="form-input"
              value={hostForm.mac}
              onChange={e => setHostForm(prev => ({ ...prev, mac: e.target.value }))}
              placeholder="AA:BB:CC:DD:EE:FF"
              disabled={!!editingHost}
              autoFocus={!editingHost}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Hostname</label>
            <input
              className="form-input"
              value={hostForm.pc_name}
              onChange={e => setHostForm(prev => ({ ...prev, pc_name: e.target.value }))}
              placeholder="PC-DEPLOY-001"
              autoFocus={!!editingHost}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Azione Boot</label>
              <select
                className="form-select"
                value={hostForm.boot_action}
                onChange={e => setHostForm(prev => ({ ...prev, boot_action: e.target.value }))}
              >
                {BOOT_ACTIONS.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Workflow</label>
              <select
                className="form-select"
                value={hostForm.workflow_id}
                onChange={e => setHostForm(prev => ({ ...prev, workflow_id: e.target.value }))}
              >
                <option value="">-- Nessuno --</option>
                {workflows.map(wf => (
                  <option key={wf.id} value={wf.id}>{wf.nome}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Note</label>
            <textarea
              className="form-input"
              value={hostForm.notes}
              onChange={e => setHostForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Note opzionali..."
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
