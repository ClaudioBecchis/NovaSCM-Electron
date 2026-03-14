import React, { useState, useEffect } from 'react';
import * as api from '../services/api';

export default function AboutTab({ addLog }) {
  const [serverInfo, setServerInfo] = useState(null);

  useEffect(() => {
    api.getVersion()
      .then(data => setServerInfo(data))
      .catch(() => setServerInfo(null));
  }, []);

  const electronVersion = window.electronAPI?.versions?.electron || (typeof process !== 'undefined' ? process.versions?.electron : null) || 'N/D';
  const nodeVersion = window.electronAPI?.versions?.node || (typeof process !== 'undefined' ? process.versions?.node : null) || 'N/D';
  const chromeVersion = window.electronAPI?.versions?.chrome || (typeof process !== 'undefined' ? process.versions?.chrome : null) || 'N/D';
  const platform = window.electronAPI?.platform || (typeof process !== 'undefined' ? process.platform : navigator.platform) || 'N/D';
  const arch = window.electronAPI?.arch || (typeof process !== 'undefined' ? process.arch : null) || 'N/D';

  const serverVersion = serverInfo?.version || serverInfo?.server_version || null;
  const serverUrl = api.default.getBaseUrl() || 'Non configurato';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: 'calc(100vh - 240px)', padding: 40,
    }}>
      {/* Large N Logo */}
      <div style={{
        width: 100, height: 100, borderRadius: 20,
        background: 'linear-gradient(135deg, var(--accent), #1d4ed8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 52, fontWeight: 900, color: '#fff',
        fontFamily: 'var(--font-mono)', letterSpacing: -2,
        marginBottom: 20, boxShadow: '0 8px 32px rgba(59,130,246,0.3)',
      }}>
        N
      </div>

      {/* Title */}
      <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, letterSpacing: -0.5 }}>
        NovaSCM <span style={{ color: 'var(--accent)' }}>v3.0.0</span>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>
        Enterprise Deployment &amp; Asset Management
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 32 }}>
        Electron Edition
      </div>

      {/* Info cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 32 }}>
        {/* Build info */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 20, minWidth: 280,
        }}>
          <div className="section-title">Build Info</div>
          <InfoRow label="Platform" value={platform} />
          <InfoRow label="Architecture" value={arch} />
          <InfoRow label="Electron" value={electronVersion} />
        </div>

        {/* Server info */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 20, minWidth: 280,
        }}>
          <div className="section-title">Server Info</div>
          <InfoRow label="Versione" value={serverVersion || 'Non connesso'} color={serverVersion ? 'var(--green)' : 'var(--red)'} />
          <InfoRow label="URL" value={serverUrl} mono />
        </div>

        {/* System info */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 20, minWidth: 280,
        }}>
          <div className="section-title">System Info</div>
          <InfoRow label="Node.js" value={nodeVersion} />
          <InfoRow label="Chrome" value={chromeVersion} />
          <InfoRow label="Electron" value={electronVersion} />
          <InfoRow label="Platform" value={platform} />
          <InfoRow label="Arch" value={arch} />
        </div>
      </div>

      {/* Copyright */}
      <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', marginBottom: 12 }}>
        &copy; 2026 PolarisCore. Tutti i diritti riservati.
      </div>

      {/* Links */}
      <div style={{ display: 'flex', gap: 16 }}>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            const shell = window.electronAPI?.shell;
            if (shell?.openExternal) shell.openExternal('https://github.com/polariscore/novascm');
            else window.open('https://github.com/polariscore/novascm', '_blank');
          }}
          style={{ color: 'var(--accent)', fontSize: 12, textDecoration: 'none' }}
        >
          GitHub
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            const shell = window.electronAPI?.shell;
            if (shell?.openExternal) shell.openExternal('https://novascm.polariscore.it');
            else window.open('https://novascm.polariscore.it', '_blank');
          }}
          style={{ color: 'var(--accent)', fontSize: 12, textDecoration: 'none' }}
        >
          Documentazione
        </a>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono = false, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        color: color || 'var(--text)',
        fontSize: 12,
      }}>
        {value}
      </span>
    </div>
  );
}
