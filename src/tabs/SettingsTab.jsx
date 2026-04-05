import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../services/api';
import store from '../services/store';

// ---------------------------------------------------------------------------
// Deep equality check for dirty state
// ---------------------------------------------------------------------------
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return String(a) === String(b);
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// SettingsTab
// ---------------------------------------------------------------------------

export default function SettingsTab({ addLog, config: parentConfig, updateConfig: parentUpdateConfig, toast }) {
  const [config, setConfig] = useState({});
  const [savedConfig, setSavedConfig] = useState({});
  const [connStatus, setConnStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileInputRef = useRef(null);

  // Load config on mount
  useEffect(() => {
    const loaded = store.loadConfig();
    setConfig(loaded);
    setSavedConfig(loaded);
  }, []);

  // Track dirty state
  useEffect(() => {
    setDirty(!deepEqual(config, savedConfig));
  }, [config, savedConfig]);

  const updateField = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------
  const handleSave = useCallback(() => {
    const toSave = { ...config };

    // Ensure scanNetworks is stored as newline-separated string
    if (Array.isArray(toSave.scanNetworks)) {
      toSave.scanNetworks = toSave.scanNetworks.join('\n');
    }

    // Persist to localStorage
    store.saveConfig(toSave);
    setSavedConfig(toSave);
    setConfig(toSave);

    // Reconfigure API client with new URL/key
    if (toSave.apiUrl) {
      api.configure(toSave.apiUrl, toSave.apiKey || '');
    }

    // Notify parent
    parentUpdateConfig?.(toSave);

    if (toast) {
      toast('Impostazioni salvate', 'success');
    } else {
      addLog?.('Impostazioni salvate', 'success');
    }
  }, [config, addLog, toast, parentUpdateConfig]);

  // -----------------------------------------------------------------------
  // Reset to defaults
  // -----------------------------------------------------------------------
  const handleResetDefaults = useCallback(() => {
    if (!window.confirm('Ripristinare tutte le impostazioni ai valori predefiniti?')) return;
    const defaults = { ...store.DEFAULT_CONFIG };
    store.saveConfig(defaults);
    setConfig(defaults);
    setSavedConfig(defaults);

    // Reconfigure API
    api.configure(defaults.apiUrl, defaults.apiKey || '');
    parentUpdateConfig?.(defaults);

    if (toast) {
      toast('Impostazioni ripristinate ai valori predefiniti', 'success');
    } else {
      addLog?.('Impostazioni ripristinate ai valori predefiniti', 'success');
    }
  }, [addLog, toast, parentUpdateConfig]);

  // -----------------------------------------------------------------------
  // Export config as JSON download
  // -----------------------------------------------------------------------
  const handleExport = useCallback(() => {
    const exportData = { ...config };
    // scanNetworks is already a newline-separated string, keep as-is for export
    const json = JSON.stringify(exportData, null, 2);

    if (window.electronAPI?.dialog?.saveFile) {
      window.electronAPI.dialog.saveFile({
        defaultPath: 'novascm-config.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      }).then(filePath => {
        if (filePath) {
          window.electronAPI.fs.writeFile(filePath, json);
          if (toast) toast('Configurazione esportata', 'success');
          else addLog?.('Configurazione esportata', 'success');
        }
      }).catch(() => {});
    } else {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'novascm-config.json';
      a.click();
      URL.revokeObjectURL(url);
      if (toast) toast('Configurazione esportata', 'success');
      else addLog?.('Configurazione esportata', 'success');
    }
  }, [config, addLog, toast]);

  // -----------------------------------------------------------------------
  // Import config from JSON
  // -----------------------------------------------------------------------
  const handleImport = useCallback(() => {
    const doImport = (text) => {
      try {
        const imported = JSON.parse(text);
        // Merge with defaults to ensure no missing keys
        const merged = { ...store.DEFAULT_CONFIG, ...imported };
        store.saveConfig(merged);
        setConfig(merged);
        setSavedConfig(merged);

        // Reconfigure API
        if (merged.apiUrl) {
          api.configure(merged.apiUrl, merged.apiKey || '');
        }
        parentUpdateConfig?.(merged);

        if (toast) toast('Configurazione importata', 'success');
        else addLog?.('Configurazione importata', 'success');
      } catch (e) {
        if (toast) toast(`Errore importazione: ${e.message}`, 'error');
        else addLog?.(`Errore importazione: ${e.message}`, 'error');
      }
    };

    if (window.electronAPI?.dialog?.openFile) {
      window.electronAPI.dialog.openFile({
        filters: [{ name: 'JSON', extensions: ['json'] }],
      }).then(async (filePath) => {
        if (filePath) {
          const result = await window.electronAPI.fs.readFile(filePath, 'utf-8');
          if (result?.success && result.data) {
            doImport(result.data);
          } else if (result?.error) {
            if (toast) toast(`Errore lettura file: ${result.error}`, 'error');
            else addLog?.(`Errore lettura file: ${result.error}`, 'error');
          }
        }
      }).catch(() => {});
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => doImport(ev.target.result);
        reader.readAsText(file);
      };
      input.click();
    }
  }, [addLog, toast, parentUpdateConfig]);

  // -----------------------------------------------------------------------
  // Test Connection
  // -----------------------------------------------------------------------
  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setConnStatus(null);
    try {
      const url = config.apiUrl || store.DEFAULT_CONFIG.apiUrl;
      const key = config.apiKey || '';

      // Temporarily configure API with current (unsaved) values for testing
      api.configure(url, key);

      const [health, version] = await Promise.all([
        api.checkHealth(),
        api.getVersion().catch(() => null),
      ]);

      setConnStatus({
        ok: true,
        version: version?.version || version?.server_version || 'N/D',
      });

      if (toast) toast(`Connessione riuscita: ${url}`, 'success');
      else addLog?.(`Connessione riuscita: ${url}`, 'success');
    } catch (e) {
      setConnStatus({ ok: false, error: e.message });
      if (toast) toast(`Connessione fallita: ${e.message}`, 'error');
      else addLog?.(`Connessione fallita: ${e.message}`, 'error');
    } finally {
      setTesting(false);
    }
  }, [config.apiUrl, config.apiKey, addLog, toast]);

  // -----------------------------------------------------------------------
  // Display helpers
  // -----------------------------------------------------------------------

  // scanNetworks is stored as newline-separated string
  const scanNets = config.scanNetworks || '';

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div style={{ maxWidth: 800 }}>
      {/* ── SERVER ──────────────────────────────────────────────────────── */}
      <div className="section-title">Server</div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 20,
      }}>
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">API URL</label>
            <input
              className="form-input"
              value={config.apiUrl || ''}
              onChange={e => updateField('apiUrl', e.target.value)}
              placeholder="http://192.168.1.100:9091"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">API Key</label>
            <input
              className="form-input"
              type="password"
              value={config.apiKey || ''}
              onChange={e => updateField('apiKey', e.target.value)}
              placeholder="Chiave API (opzionale)"
              autoComplete="off"
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <button className="btn primary" onClick={handleTestConnection} disabled={testing}>
            {testing ? 'Test in corso...' : 'Test Connessione'}
          </button>
          {connStatus && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: connStatus.ok ? 'var(--green)' : 'var(--red)',
              }} />
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: connStatus.ok ? 'var(--green)' : 'var(--red)',
              }}>
                {connStatus.ok ? `Connesso v${connStatus.version}` : `Non connesso: ${connStatus.error}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── RETE ────────────────────────────────────────────────────────── */}
      <div className="section-title">Rete</div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 20,
      }}>
        <div className="form-group">
          <label className="form-label">Subnet da Scansionare (una per riga, CIDR)</label>
          <textarea
            className="form-textarea"
            value={scanNets}
            onChange={e => updateField('scanNetworks', e.target.value)}
            style={{ minHeight: 60, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            placeholder={'192.168.1.0/24\n192.168.2.0/24'}
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Timeout Scansione (secondi)</label>
            <input
              className="form-input"
              type="number"
              value={config.scanTimeout || 5}
              onChange={e => updateField('scanTimeout', parseInt(e.target.value) || 5)}
              min={1}
              max={60}
            />
          </div>
        </div>
      </div>

      {/* ── CERTIFICATI ─────────────────────────────────────────────────── */}
      <div className="section-title">Certificati</div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 20,
      }}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">CertPortal URL</label>
            <input
              className="form-input"
              value={config.certportalUrl || ''}
              onChange={e => updateField('certportalUrl', e.target.value)}
              style={{ fontFamily: 'var(--font-mono)' }}
              placeholder="http://192.168.1.100:9090"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Validita Certificato (giorni)</label>
            <input
              className="form-input"
              type="number"
              value={config.certDays || ''}
              onChange={e => updateField('certDays', parseInt(e.target.value) || '')}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Organizzazione</label>
            <input
              className="form-input"
              value={config.certOrg || ''}
              onChange={e => updateField('certOrg', e.target.value)}
              placeholder="MyOrg"
            />
          </div>
          <div className="form-group">
            <label className="form-label">SSID</label>
            <input
              className="form-input"
              value={config.certSsid || ''}
              onChange={e => updateField('certSsid', e.target.value)}
              placeholder="MyNetwork-Secure"
            />
          </div>
          <div className="form-group">
            <label className="form-label">RADIUS IP</label>
            <input
              className="form-input"
              value={config.certRadiusIp || ''}
              onChange={e => updateField('certRadiusIp', e.target.value)}
              style={{ fontFamily: 'var(--font-mono)' }}
              placeholder="192.168.1.105"
            />
          </div>
        </div>
      </div>

      {/* ── UNIFI ───────────────────────────────────────────────────────── */}
      <div className="section-title">UniFi</div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 20,
      }}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Controller URL</label>
            <input
              className="form-input"
              value={config.unifiUrl || ''}
              onChange={e => updateField('unifiUrl', e.target.value)}
              style={{ fontFamily: 'var(--font-mono)' }}
              placeholder="https://192.168.1.1"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              value={config.unifiUser || ''}
              onChange={e => updateField('unifiUser', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={config.unifiPass || ''}
              onChange={e => updateField('unifiPass', e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
      </div>

      {/* ── DEPLOY ──────────────────────────────────────────────────────── */}
      <div className="section-title">Deploy</div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 20,
      }}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Dominio Default</label>
            <input
              className="form-input"
              value={config.defaultDomain || ''}
              onChange={e => updateField('defaultDomain', e.target.value)}
              placeholder="corp.example.com"
            />
          </div>
          <div className="form-group">
            <label className="form-label">OU Default</label>
            <input
              className="form-input"
              value={config.defaultOu || ''}
              onChange={e => updateField('defaultOu', e.target.value)}
              placeholder="OU=Computers,DC=corp,DC=example,DC=com"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">DC IP</label>
            <input
              className="form-input"
              value={config.defaultDcIp || ''}
              onChange={e => updateField('defaultDcIp', e.target.value)}
              placeholder="192.168.1.199"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Prefisso Nome PC</label>
            <input
              className="form-input"
              value={config.pcNamePrefix || ''}
              onChange={e => updateField('pcNamePrefix', e.target.value)}
              placeholder="PC-"
            />
          </div>
        </div>
      </div>

      {/* ── INTERFACCIA ─────────────────────────────────────────────────── */}
      <div className="section-title">Interfaccia</div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 20,
      }}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Log Level</label>
            <select
              className="form-select"
              value={config.logLevel || 'info'}
              onChange={e => updateField('logLevel', e.target.value)}
            >
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Intervallo Auto-Refresh (secondi)</label>
            <input
              className="form-input"
              type="number"
              value={config.autoRefresh || 30}
              onChange={e => updateField('autoRefresh', parseInt(e.target.value) || 30)}
              min={2}
              max={120}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Tema</label>
            <select
              className="form-select"
              value={config.theme || 'dark'}
              onChange={e => updateField('theme', e.target.value)}
            >
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── ACTION BUTTONS ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 8, padding: '16px 0',
        borderTop: '1px solid var(--border)', marginTop: 8,
        position: 'sticky', bottom: 0, background: 'var(--bg-primary)', zIndex: 1,
      }}>
        <button className="btn primary" onClick={handleSave} disabled={!dirty}>
          Salva{dirty ? ' *' : ''}
        </button>
        <button className="btn amber" onClick={handleResetDefaults}>
          Ripristina Defaults
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn outline" onClick={handleExport}>
          Esporta Config
        </button>
        <button className="btn outline" onClick={handleImport}>
          Importa Config
        </button>
      </div>
    </div>
  );
}
