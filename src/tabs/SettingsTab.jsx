import React, { useState, useEffect } from 'react';
import * as api from '../services/api';
import store from '../services/store';

export default function SettingsTab({ addLog }) {
  const [config, setConfig] = useState({});
  const [connStatus, setConnStatus] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setConfig(store.loadConfig());
  }, []);

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const toSave = { ...config };
    // Convert scanNetworks from textarea to array if needed
    if (typeof toSave.scanNetworks === 'string') {
      toSave.scanNetworks = toSave.scanNetworks.split('\n').map(s => s.trim()).filter(Boolean);
    }
    if (typeof toSave.commonPorts === 'string') {
      toSave.commonPorts = toSave.commonPorts.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    }
    store.saveConfig(toSave);

    // Reconfigure API
    if (toSave.apiUrl) {
      api.default.configure(toSave.apiUrl, toSave.apiKey || '');
    }

    addLog('Impostazioni salvate', 'success');
  };

  const handleResetDefaults = () => {
    if (!confirm('Ripristinare tutte le impostazioni ai valori predefiniti?')) return;
    store.saveConfig(store.DEFAULT_CONFIG);
    setConfig({ ...store.DEFAULT_CONFIG });
    addLog('Impostazioni ripristinate ai valori predefiniti', 'success');
  };

  const handleExport = () => {
    const json = JSON.stringify(config, null, 2);
    if (window.electronAPI?.saveFile) {
      window.electronAPI.saveFile({
        defaultPath: 'novascm-config.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      }).then(path => {
        if (path) {
          window.electronAPI.writeFile(path, json);
          addLog('Configurazione esportata', 'success');
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
      addLog('Configurazione esportata', 'success');
    }
  };

  const handleImport = () => {
    const doImport = (text) => {
      try {
        const imported = JSON.parse(text);
        store.saveConfig(imported);
        setConfig(imported);
        addLog('Configurazione importata', 'success');
      } catch (e) {
        addLog(`Errore importazione: ${e.message}`, 'error');
      }
    };

    if (window.electronAPI?.openFile) {
      window.electronAPI.openFile().then(content => {
        if (content) doImport(content);
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
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setConnStatus(null);
    try {
      const url = config.apiUrl || store.DEFAULT_CONFIG.apiUrl;
      const key = config.apiKey || '';
      api.default.configure(url, key);

      const [health, version] = await Promise.all([
        api.checkHealth(),
        api.getVersion().catch(() => null),
      ]);
      setConnStatus({
        ok: true,
        version: version?.version || version?.server_version || 'N/D',
      });
      addLog(`Connessione riuscita: ${url}`, 'success');
    } catch (e) {
      setConnStatus({ ok: false, error: e.message });
      addLog(`Connessione fallita: ${e.message}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  // Convert arrays to string for display
  const scanNets = Array.isArray(config.scanNetworks)
    ? config.scanNetworks.join('\n')
    : (config.scanNetworks || '192.168.10.0/24\n192.168.20.0/24');
  const commonPorts = Array.isArray(config.commonPorts)
    ? config.commonPorts.join(',')
    : (config.commonPorts || '22,80,135,139,443,445,3389,5900,8006,8080,8096,8123,8443,9000,9090,9091');

  return (
    <div style={{ maxWidth: 800 }}>
      {/* CONNESSIONE SERVER */}
      <div className="section-title">Connessione Server</div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 20,
      }}>
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">API URL</label>
            <input className="form-input" value={config.apiUrl || ''} onChange={e => updateConfig('apiUrl', e.target.value)} placeholder="http://192.168.20.110:9091" style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">API Key</label>
            <input className="form-input" type="password" value={config.apiKey || ''} onChange={e => updateConfig('apiKey', e.target.value)} placeholder="Chiave API (opzionale)" />
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

      {/* RETE */}
      <div className="section-title">Rete</div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 20,
      }}>
        <div className="form-group">
          <label className="form-label">Subnet da Scansionare (una per riga)</label>
          <textarea
            className="form-textarea"
            value={scanNets}
            onChange={e => updateConfig('scanNetworks', e.target.value)}
            style={{ minHeight: 60, fontFamily: 'var(--font-mono)', fontSize: 12 }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Porte Comuni (separate da virgola)</label>
          <input className="form-input" value={commonPorts} onChange={e => updateConfig('commonPorts', e.target.value)} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
        </div>
      </div>

      {/* CERTIFICATI */}
      <div className="section-title">Certificati</div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 20,
      }}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">CertPortal URL</label>
            <input className="form-input" value={config.certportalUrl || ''} onChange={e => updateConfig('certportalUrl', e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
          <div className="form-group">
            <label className="form-label">RADIUS IP</label>
            <input className="form-input" value={config.radiusIp || ''} onChange={e => updateConfig('radiusIp', e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
          <div className="form-group">
            <label className="form-label">SSID</label>
            <input className="form-input" value={config.ssid || ''} onChange={e => updateConfig('ssid', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Validita Certificato (giorni)</label>
            <input className="form-input" type="number" value={config.certDays || ''} onChange={e => updateConfig('certDays', parseInt(e.target.value) || '')} />
          </div>
          <div className="form-group">
            <label className="form-label">Organizzazione</label>
            <input className="form-input" value={config.orgName || ''} onChange={e => updateConfig('orgName', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Dominio</label>
            <input className="form-input" value={config.domain || ''} onChange={e => updateConfig('domain', e.target.value)} />
          </div>
        </div>
      </div>

      {/* UNIFI */}
      <div className="section-title">UniFi</div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 20,
      }}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Controller URL</label>
            <input className="form-input" value={config.unifiUrl || ''} onChange={e => updateConfig('unifiUrl', e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" value={config.unifiUser || ''} onChange={e => updateConfig('unifiUser', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={config.unifiPass || ''} onChange={e => updateConfig('unifiPass', e.target.value)} />
          </div>
        </div>
      </div>

      {/* DEPLOY */}
      <div className="section-title">Deploy</div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 20,
      }}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Admin Password (Default Deploy)</label>
            <input className="form-input" type="password" value={config.adminPass || ''} onChange={e => updateConfig('adminPass', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Dominio Default</label>
            <input className="form-input" value={config.deployDomain || config.domain || ''} onChange={e => updateConfig('deployDomain', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">OU Default</label>
            <input className="form-input" value={config.deployOu || ''} onChange={e => updateConfig('deployOu', e.target.value)} placeholder="OU=PC,DC=corp,DC=polariscore,DC=it" />
          </div>
          <div className="form-group">
            <label className="form-label">DC IP</label>
            <input className="form-input" value={config.deployDcIp || ''} onChange={e => updateConfig('deployDcIp', e.target.value)} placeholder="192.168.10.199" style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
        </div>
      </div>

      {/* INTERFACCIA */}
      <div className="section-title">Interfaccia</div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 20,
      }}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Tema</label>
            <select className="form-select" value={config.theme || 'dark'} onChange={e => updateConfig('theme', e.target.value)}>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Intervallo Refresh (secondi)</label>
            <input className="form-input" type="number" value={config.refreshInterval || 10} onChange={e => updateConfig('refreshInterval', parseInt(e.target.value) || 10)} min={2} max={120} />
          </div>
          <div className="form-group">
            <label className="form-label">Log Level</label>
            <select className="form-select" value={config.logLevel || 'info'} onChange={e => updateConfig('logLevel', e.target.value)}>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        display: 'flex', gap: 8, padding: '16px 0',
        borderTop: '1px solid var(--border)', marginTop: 8,
        position: 'sticky', bottom: 0, background: 'var(--bg-primary)', zIndex: 1,
      }}>
        <button className="btn primary" onClick={handleSave}>Salva</button>
        <button className="btn amber" onClick={handleResetDefaults}>Ripristina Defaults</button>
        <button className="btn" onClick={handleExport}>Esporta Config</button>
        <button className="btn" onClick={handleImport}>Importa Config</button>
      </div>
    </div>
  );
}
