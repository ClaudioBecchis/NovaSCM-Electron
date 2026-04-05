import React from 'react';

/* ── Helper: open link via Electron shell or fallback ──── */
function openExternal(url) {
  const shell = window.electronAPI?.shell;
  if (shell?.openExternal) shell.openExternal(url);
  else window.open(url, '_blank');
}

/* ── Reusable info row ─────────────────────────────────── */
function InfoRow({ label, value, mono = false, color }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        color: color || 'var(--text)',
        fontSize: 12,
        maxWidth: 260,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {value}
      </span>
    </div>
  );
}

/* ── Card wrapper ──────────────────────────────────────── */
function Card({ title, children, style }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius, 8px)',
      padding: 20,
      minWidth: 300,
      ...style,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: 1.2, color: 'var(--accent)', marginBottom: 12,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   AboutTab
   Props: { config }
   ═══════════════════════════════════════════════════════════ */
export default function AboutTab({ config }) {
  /* ── System versions ─────────────────────────────────── */
  const ev = window.electronAPI?.versions?.electron
    || (typeof process !== 'undefined' ? process.versions?.electron : null) || 'N/D';
  const cv = window.electronAPI?.versions?.chrome
    || (typeof process !== 'undefined' ? process.versions?.chrome : null) || 'N/D';
  const nv = window.electronAPI?.versions?.node
    || (typeof process !== 'undefined' ? process.versions?.node : null) || 'N/D';
  const plat = window.electronAPI?.platform
    || (typeof process !== 'undefined' ? process.platform : navigator.platform) || 'N/D';

  const serverUrl = config?.apiUrl || 'Non configurato';

  /* ── Keyboard shortcuts data ─────────────────────────── */
  const shortcuts = [
    { keys: 'Ctrl + 1..9', desc: 'Cambia scheda' },
    { keys: 'Ctrl + K', desc: 'Apri ricerca rapida' },
    { keys: 'Ctrl + L', desc: 'Mostra/nascondi pannello log' },
    { keys: 'F5', desc: 'Health check server' },
    { keys: 'Escape', desc: 'Chiudi modale / ricerca' },
  ];

  /* ── Tech stack items ────────────────────────────────── */
  const techStack = [
    { name: 'Electron + React 19 + Vite', desc: 'Frontend desktop cross-platform' },
    { name: 'NovaSCM API Server (Flask)', desc: 'Backend REST API' },
    { name: 'Dark Navy Enterprise Theme', desc: 'Tema scuro ottimizzato per uso prolungato' },
  ];

  /* ═══════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════ */
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '40px 24px', overflowY: 'auto', minHeight: 0,
    }}>

      {/* ── App Info ──────────────────────────────────────── */}
      <div style={{
        width: 96, height: 96, borderRadius: 22,
        background: 'linear-gradient(135deg, var(--accent), #1d4ed8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 52, fontWeight: 900, color: '#fff',
        fontFamily: 'var(--font-mono)', letterSpacing: -2,
        marginBottom: 20,
        boxShadow: '0 8px 32px rgba(59,130,246,0.3)',
        userSelect: 'none',
      }}>
        N
      </div>

      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>
        NovaSCM{' '}
        <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 20 }}>
          v3.1.0
        </span>
      </div>

      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>
        Electron Edition &mdash; Enterprise Deployment &amp; Asset Management
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 36 }}>
        &copy; 2026 PolarisCore. Tutti i diritti riservati.
      </div>

      {/* ── Cards grid ────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 16,
        justifyContent: 'center', maxWidth: 960, width: '100%',
        marginBottom: 32,
      }}>

        {/* ── Scorciatoie da Tastiera ─────────────────────── */}
        <Card title="Scorciatoie da Tastiera" style={{ flex: '1 1 300px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Combinazione</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Azione</th>
              </tr>
            </thead>
            <tbody>
              {shortcuts.map((s) => (
                <tr key={s.keys} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '5px 0' }}>
                    <kbd style={kbdStyle}>{s.keys}</kbd>
                  </td>
                  <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--text-muted)' }}>
                    {s.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* ── Informazioni di Sistema ─────────────────────── */}
        <Card title="Informazioni di Sistema" style={{ flex: '1 1 300px' }}>
          <InfoRow label="Electron" value={ev} mono />
          <InfoRow label="Chrome" value={cv} mono />
          <InfoRow label="Node.js" value={nv} mono />
          <InfoRow label="Piattaforma" value={plat} />
          <InfoRow label="Server URL" value={serverUrl} mono color="var(--accent)" />
        </Card>

        {/* ── Stack Tecnologico ────────────────────────────── */}
        <Card title="Stack Tecnologico" style={{ flex: '1 1 300px' }}>
          {techStack.map((t) => (
            <div key={t.name} style={{
              padding: '6px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                {t.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {t.desc}
              </div>
            </div>
          ))}
        </Card>

      </div>

      {/* ── Links ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); openExternal('https://github.com/ClaudioBecchis/NovaSCM-Electron'); }}
          style={linkStyle}
        >
          GitHub
        </a>
        <span style={{ color: 'var(--border)' }}>|</span>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); openExternal('https://www.example.com'); }}
          style={linkStyle}
        >
          PolarisCore
        </a>
        <span style={{ color: 'var(--border)' }}>|</span>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); openExternal('https://novascm.example.com'); }}
          style={linkStyle}
        >
          Documentazione
        </a>
      </div>

    </div>
  );
}

/* ── Shared styles ─────────────────────────────────────── */
const thStyle = {
  textAlign: 'left',
  padding: '4px 0 6px',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  color: 'var(--text-dim)',
};

const kbdStyle = {
  display: 'inline-block',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '2px 8px',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--text)',
  lineHeight: '18px',
};

const linkStyle = {
  color: 'var(--accent)',
  fontSize: 12,
  textDecoration: 'none',
  fontWeight: 600,
};
