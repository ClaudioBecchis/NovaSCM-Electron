import React, { useState, useCallback, useEffect, useRef } from 'react';
import DataGrid from '../components/DataGrid';
import Modal from '../components/Modal';
import store from '../services/store';

const COMMON_PORTS = [22, 80, 135, 139, 443, 445, 3389, 5900, 8006, 8080, 8096, 8123, 8443, 9000, 9090, 9091];

const PORT_SERVICES = {
  22: 'SSH', 80: 'HTTP', 135: 'RPC', 139: 'NetBIOS', 443: 'HTTPS', 445: 'SMB',
  3389: 'RDP', 5900: 'VNC', 8006: 'Proxmox', 8080: 'HTTP-Alt', 8096: 'Jellyfin',
  8123: 'Home Assistant', 8443: 'HTTPS-Alt', 9000: 'Portainer', 9090: 'CertPortal', 9091: 'NovaSCM',
};

const OUI_VENDORS = {
  'FC:EC:DA': 'Ubiquiti', '8C:30:66': 'Ubiquiti', '78:8A:20': 'Ubiquiti',
  '00:50:56': 'VMware', '00:0C:29': 'VMware', 'BC:24:11': 'Proxmox',
  '3C:7C:3F': 'ASUSTek', '04:42:1A': 'ASUSTek', '00:1A:2B': 'Ayecom',
  'B4:2E:99': 'Giga-Byte', '18:C0:4D': 'Giga-Byte', 'D8:BB:C1': 'Micro-Star',
  '00:15:5D': 'Hyper-V', '52:54:00': 'QEMU/KVM', '00:1C:42': 'Parallels',
  '00:25:90': 'Super Micro', 'AC:1F:6B': 'Super Micro',
  '00:11:32': 'Synology', '00:1E:06': 'WIBRAIN', 'DC:A6:32': 'Raspberry Pi',
  'B8:27:EB': 'Raspberry Pi', 'E4:5F:01': 'Raspberry Pi',
  '00:17:88': 'Philips Hue', '00:04:4B': 'Nvidia',
};

function lookupVendor(mac) {
  if (!mac) return 'Sconosciuto';
  const prefix = mac.substring(0, 8).toUpperCase();
  return OUI_VENDORS[prefix] || 'Sconosciuto';
}

function detectType(ports, vendor) {
  if (ports.includes(8006)) return { icon: '\uD83D\uDDA5\uFE0F', type: 'Proxmox' };
  if (ports.includes(8123)) return { icon: '\uD83C\uDFE0', type: 'Home Assistant' };
  if (ports.includes(9091)) return { icon: '\uD83D\uDCE6', type: 'NovaSCM Server' };
  if (ports.includes(3389) && ports.includes(445)) return { icon: '\uD83D\uDCBB', type: 'Windows' };
  if (ports.includes(3389)) return { icon: '\uD83D\uDCBB', type: 'Windows' };
  if (ports.includes(22) && !ports.includes(3389)) return { icon: '\uD83D\uDC27', type: 'Linux' };
  if (vendor?.includes('Ubiquiti')) return { icon: '\uD83D\uDCE1', type: 'UniFi' };
  if (vendor?.includes('Raspberry')) return { icon: '\uD83E\uDD67', type: 'Raspberry Pi' };
  if (ports.includes(631) || ports.includes(9100)) return { icon: '\uD83D\uDDA8\uFE0F', type: 'Stampante' };
  if (ports.includes(80) || ports.includes(443)) return { icon: '\uD83C\uDF10', type: 'Web Device' };
  return { icon: '\uD83D\uDD0C', type: 'Dispositivo' };
}

const columns = [
  { key: 'icon', label: '', width: 36 },
  { key: 'ip', label: 'IP', width: 130 },
  { key: 'mac', label: 'MAC', width: 150 },
  { key: 'vendor', label: 'Vendor', width: 130 },
  { key: 'deviceType', label: 'Tipo Dispositivo', width: 140 },
  { key: 'ports', label: 'Porte Aperte', render: (v) => (
    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{v?.join(', ') || ''}</span>
  )},
  { key: 'status', label: 'Stato', width: 100, render: v => (
    <span className={`tag ${v === 'Online' ? 'green' : 'red'}`}>{v}</span>
  )},
];

const SCAN_RESULTS_KEY = 'novascm-scan-results';
const AUTOSCAN_KEY = 'novascm-autoscan';
const AUTOSCAN_INTERVALS = [
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '60 min', value: 60 },
];

function saveScanResults(devices) {
  try {
    localStorage.setItem(SCAN_RESULTS_KEY, JSON.stringify({
      devices,
      timestamp: new Date().toISOString(),
    }));
  } catch { /* ignore quota errors */ }
}

function loadScanResults() {
  try {
    const raw = localStorage.getItem(SCAN_RESULTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

function exportCsv(devices) {
  const headers = ['IP', 'MAC', 'Vendor', 'Tipo', 'Porte Aperte', 'Stato'];
  const rows = devices.map(d => [
    d.ip, d.mac, d.vendor, d.deviceType, (d.ports || []).join(';'), d.status,
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `network-scan-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function NetworkTab({ addLog }) {
  const [devices, setDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [subnets, setSubnets] = useState([]);
  const [detailDevice, setDetailDevice] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [lastScanTime, setLastScanTime] = useState(null);
  const [tracerouteModal, setTracerouteModal] = useState(null);
  const [tracerouteLoading, setTracerouteLoading] = useState(false);
  const [speedTestModal, setSpeedTestModal] = useState(false);
  const [speedTestResults, setSpeedTestResults] = useState(null);
  const [speedTestRunning, setSpeedTestRunning] = useState(false);
  const [speedTestPhase, setSpeedTestPhase] = useState('');
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [autoScanInterval, setAutoScanInterval] = useState(15);
  const autoScanTimerRef = useRef(null);
  const contextRef = useRef(null);

  // Load subnets from config and previous scan results
  useEffect(() => {
    const config = store.loadConfig();
    const nets = config.scanNetworks || ['192.168.10.0/24', '192.168.20.0/24'];
    setSubnets(nets);

    const saved = loadScanResults();
    if (saved?.devices?.length) {
      setDevices(saved.devices);
      setLastScanTime(saved.timestamp);
    }
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Load auto-scan preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTOSCAN_KEY);
      if (saved) {
        const pref = JSON.parse(saved);
        setAutoScanEnabled(pref.enabled || false);
        setAutoScanInterval(pref.interval || 15);
      }
    } catch { /* ignore */ }
  }, []);

  // Keep a ref to scanning state so the interval callback doesn't need it as a dep
  const scanningRef = useRef(scanning);
  useEffect(() => { scanningRef.current = scanning; }, [scanning]);

  // Keep a ref to the scan function so auto-scan timer can call it without dep issues
  const scanRef = useRef(null);

  // Save auto-scan preference
  const toggleAutoScan = (enabled) => {
    setAutoScanEnabled(enabled);
    try {
      localStorage.setItem(AUTOSCAN_KEY, JSON.stringify({ enabled, interval: autoScanInterval }));
    } catch { /* ignore */ }
  };

  const updateAutoScanInterval = (interval) => {
    setAutoScanInterval(interval);
    try {
      localStorage.setItem(AUTOSCAN_KEY, JSON.stringify({ enabled: autoScanEnabled, interval }));
    } catch { /* ignore */ }
  };

  // Wake-on-LAN handler
  const sendWol = async (device) => {
    if (!device.mac) {
      addLog(`WoL fallito: MAC address non disponibile per ${device.ip}`, 'error');
      return;
    }
    try {
      await window.electronAPI.net.wol(device.mac);
      addLog(`WoL magic packet inviato a ${device.mac} (${device.ip})`, 'success');
    } catch (err) {
      addLog(`WoL fallito per ${device.mac}: ${err.message || err}`, 'error');
    }
  };

  // Traceroute handler
  const runTraceroute = async (device) => {
    setTracerouteModal({ ip: device.ip, hops: [], raw: '' });
    setTracerouteLoading(true);
    try {
      const result = await window.electronAPI.net.traceroute(device.ip);
      setTracerouteModal({ ip: device.ip, hops: result.hops || [], raw: result.raw || '' });
    } catch (err) {
      addLog(`Traceroute fallito per ${device.ip}: ${err.message || err}`, 'error');
      setTracerouteModal(null);
    } finally {
      setTracerouteLoading(false);
    }
  };

  // Speed test handler
  const runSpeedTest = async () => {
    setSpeedTestModal(true);
    setSpeedTestRunning(true);
    setSpeedTestResults(null);
    const results = { download: null, upload: null };

    try {
      // Download test: 10MB from Cloudflare
      setSpeedTestPhase('Download in corso...');
      const dlStart = performance.now();
      const dlResponse = await fetch('https://speed.cloudflare.com/__down?bytes=10000000');
      await dlResponse.arrayBuffer();
      const dlEnd = performance.now();
      const dlTimeSeconds = (dlEnd - dlStart) / 1000;
      const dlBits = 10000000 * 8;
      results.download = (dlBits / dlTimeSeconds / 1000000).toFixed(2);

      // Upload test: 5MB to Cloudflare
      setSpeedTestPhase('Upload in corso...');
      const uploadData = new Uint8Array(5000000);
      crypto.getRandomValues(uploadData);
      const ulStart = performance.now();
      await fetch('https://speed.cloudflare.com/__up', {
        method: 'POST',
        body: uploadData,
      });
      const ulEnd = performance.now();
      const ulTimeSeconds = (ulEnd - ulStart) / 1000;
      const ulBits = 5000000 * 8;
      results.upload = (ulBits / ulTimeSeconds / 1000000).toFixed(2);

      setSpeedTestResults(results);
      addLog(`Speed test completato: Download ${results.download} Mbps, Upload ${results.upload} Mbps`, 'success');
    } catch (err) {
      addLog(`Speed test fallito: ${err.message || err}`, 'error');
      setSpeedTestResults({ error: err.message || 'Errore durante il test' });
    } finally {
      setSpeedTestRunning(false);
      setSpeedTestPhase('');
    }
  };

  const addSubnet = () => {
    setSubnets(prev => [...prev, '192.168.30.0/24']);
  };

  const removeSubnet = (idx) => {
    setSubnets(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSubnet = (idx, val) => {
    setSubnets(prev => prev.map((s, i) => i === idx ? val : s));
  };

  const parseCIDR = (cidr) => {
    // Extract base subnet from CIDR like "192.168.10.0/24"
    const match = cidr.match(/^(\d+\.\d+\.\d+)\.\d+\/\d+$/);
    if (match) return match[1];
    // Also handle plain "192.168.10" format
    const plain = cidr.match(/^(\d+\.\d+\.\d+)$/);
    if (plain) return plain[1];
    return cidr.replace(/\.\d+\/\d+$/, '');
  };

  const scan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    setDevices([]);
    setProgress(0);

    const api = window.electronAPI?.net;
    if (!api?.ping) {
      addLog('electronAPI.net non disponibile - scansione non possibile', 'error');
      setScanning(false);
      return;
    }

    addLog(`Scansione rete: ${subnets.join(', ')}...`);

    // Get ARP table once
    let arpMap = {};
    try {
      const arpResult = await api.arpTable();
      const arpEntries = arpResult?.entries || arpResult || [];
      arpEntries.forEach(e => { arpMap[e.ip] = e.mac; });
    } catch { /* ARP table not available */ }

    const found = [];
    const subnetBases = subnets.map(s => parseCIDR(s));
    const totalIPs = subnetBases.length * 254;
    let scannedCount = 0;

    for (const base of subnetBases) {
      addLog(`Scansione ${base}.0/24...`);

      // Batch ping (15 at a time for speed)
      for (let batch = 1; batch <= 254; batch += 15) {
        const promises = [];
        for (let i = batch; i < Math.min(batch + 15, 255); i++) {
          const ip = `${base}.${i}`;
          promises.push(
            api.ping(ip).then(async result => {
              if (!result || !result.alive) return null;

              // Refresh ARP after ping
              let mac = arpMap[ip] || '';
              if (!mac) {
                try {
                  const freshArpResult = await api.arpTable();
                  const freshArp = freshArpResult?.entries || freshArpResult || [];
                  freshArp.forEach(e => { arpMap[e.ip] = e.mac; });
                  mac = arpMap[ip] || '';
                } catch { /* ignore */ }
              }

              const vendor = lookupVendor(mac);

              // Port scan
              const openPorts = [];
              const portChecks = COMMON_PORTS.map(p =>
                api.portScan(ip, p).then(result => { if (result?.open) openPorts.push(p); }).catch(() => {})
              );
              await Promise.all(portChecks);

              const { icon, type } = detectType(openPorts.sort((a, b) => a - b), vendor);
              return {
                icon, ip, mac, vendor, deviceType: type,
                ports: openPorts.sort((a, b) => a - b),
                status: 'Online',
              };
            }).catch(() => null)
          );
        }

        const results = await Promise.all(promises);
        results.filter(Boolean).forEach(d => {
          // Avoid duplicates (in case multiple subnets overlap)
          if (!found.some(f => f.ip === d.ip)) {
            found.push(d);
          }
        });
        setDevices([...found]);
        scannedCount += promises.length;
        setProgress(Math.min(100, Math.round((scannedCount / totalIPs) * 100)));
      }
    }

    setScanning(false);
    setProgress(100);
    saveScanResults(found);
    setLastScanTime(new Date().toISOString());
    addLog(`Scansione completata: ${found.length} dispositivi trovati su ${subnets.length} subnet`, 'success');
  }, [subnets, scanning, addLog]);

  // Update scanRef whenever scan changes so auto-scan timer uses the latest version
  useEffect(() => { scanRef.current = scan; }, [scan]);

  // Auto-scan timer
  useEffect(() => {
    if (autoScanTimerRef.current) {
      clearInterval(autoScanTimerRef.current);
      autoScanTimerRef.current = null;
    }
    if (autoScanEnabled && autoScanInterval > 0) {
      autoScanTimerRef.current = setInterval(() => {
        if (!scanningRef.current && scanRef.current) {
          addLog(`Auto-scan avviata (ogni ${autoScanInterval} min)`, 'info');
          scanRef.current();
        }
      }, autoScanInterval * 60 * 1000);
    }
    return () => {
      if (autoScanTimerRef.current) {
        clearInterval(autoScanTimerRef.current);
      }
    };
  }, [autoScanEnabled, autoScanInterval, addLog]);

  const openConnection = (device, protocol) => {
    const shell = window.electronAPI?.shell;
    if (!shell?.openExternal) {
      addLog('electronAPI.shell.openExternal non disponibile', 'error');
      return;
    }

    switch (protocol) {
      case 'rdp':
        shell.openExternal(`mstsc /v:${device.ip}`).catch(() => {
          // Fallback: try RDP URI
          shell.openExternal(`rdp://${device.ip}`).catch(() => {});
        });
        break;
      case 'ssh':
        shell.openExternal(`ssh://${device.ip}`);
        break;
      case 'http':
        if (device.ports?.includes(443)) shell.openExternal(`https://${device.ip}`);
        else if (device.ports?.includes(8006)) shell.openExternal(`https://${device.ip}:8006`);
        else if (device.ports?.includes(8443)) shell.openExternal(`https://${device.ip}:8443`);
        else shell.openExternal(`http://${device.ip}`);
        break;
      case 'vnc':
        shell.openExternal(`vnc://${device.ip}`);
        break;
      default:
        shell.openExternal(`http://${device.ip}`);
    }
    addLog(`Connessione ${protocol.toUpperCase()} a ${device.ip}`, 'info');
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      addLog(`Copiato: ${text}`, 'success');
    }).catch(() => {
      addLog('Errore copia negli appunti', 'error');
    });
  };

  const handleContextMenu = (e, row) => {
    e.preventDefault();
    // Clamp position so context menu doesn't go off-screen
    const menuW = 200, menuH = 260;
    const x = Math.min(e.clientX, window.innerWidth - menuW);
    const y = Math.min(e.clientY, window.innerHeight - menuH);
    setContextMenu({ x, y, device: row });
  };

  const stats = {
    total: devices.length,
    windows: devices.filter(d => d.deviceType === 'Windows').length,
    linux: devices.filter(d => d.deviceType === 'Linux' || d.deviceType === 'Proxmox').length,
    network: devices.filter(d => ['UniFi', 'Web Device', 'Stampante', 'Dispositivo'].includes(d.deviceType)).length,
  };

  return (
    <div>
      {/* Stats Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Dispositivi Trovati</div>
          <div className="stat-value accent">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Windows</div>
          <div className="stat-value green">{stats.windows}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Linux</div>
          <div className="stat-value">{stats.linux}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Network Devices</div>
          <div className="stat-value amber">{stats.network}</div>
        </div>
      </div>

      {/* Toolbar: Subnet inputs + actions */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16,
        padding: 12, background: 'var(--bg-surface2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-dim)', marginBottom: 6, fontWeight: 600 }}>
            Subnet da Scansionare
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {subnets.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  className="form-input"
                  style={{ width: 180, padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  value={s}
                  onChange={e => updateSubnet(i, e.target.value)}
                  placeholder="192.168.x.0/24"
                />
                {subnets.length > 1 && (
                  <button
                    className="btn"
                    style={{ padding: '4px 8px', fontSize: 11, minWidth: 'auto' }}
                    onClick={() => removeSubnet(i)}
                    title="Rimuovi subnet"
                  >
                    {'\u2715'}
                  </button>
                )}
              </div>
            ))}
            <button
              className="btn"
              style={{ padding: '4px 10px', fontSize: 11 }}
              onClick={addSubnet}
              title="Aggiungi subnet"
            >
              + Subnet
            </button>
          </div>
          {lastScanTime && (
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
              Ultima scansione: {new Date(lastScanTime).toLocaleString('it-IT')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', paddingTop: 18 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn primary" onClick={scan} disabled={scanning || subnets.length === 0}>
              {scanning ? '\u23F3 Scansione...' : '\uD83D\uDD0D Scansiona Rete'}
            </button>
            <button className="btn" onClick={() => exportCsv(devices)} disabled={devices.length === 0}>
              {'\uD83D\uDCC4'} Esporta CSV
            </button>
            <button className="btn" onClick={runSpeedTest} disabled={speedTestRunning}>
              {speedTestRunning ? '\u23F3 Test...' : '\uD83D\uDCF6'} Speed Test
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: 'var(--text-dim)' }}>
              <input
                type="checkbox"
                checked={autoScanEnabled}
                onChange={e => toggleAutoScan(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              Auto-scan ogni
            </label>
            <select
              value={autoScanInterval}
              onChange={e => updateAutoScanInterval(Number(e.target.value))}
              style={{
                background: 'var(--bg-primary)', color: 'var(--text)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '2px 6px', fontSize: 11, fontFamily: 'var(--font-mono)',
              }}
            >
              {AUTOSCAN_INTERVALS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {scanning && (
        <div style={{ marginBottom: 12 }}>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Scansione in corso... {progress}% &mdash; {devices.length} dispositivi trovati
          </div>
        </div>
      )}

      {/* DataGrid with context menu support */}
      <div onContextMenu={e => {
        // Find the clicked row
        const tr = e.target.closest('tr');
        if (!tr) return;
        const rowIdx = tr.rowIndex - 1; // -1 for thead
        if (rowIdx >= 0 && rowIdx < devices.length) {
          // Get the actual displayed data (may be filtered/sorted)
          // We pass context menu with raw event
          const ip = tr.querySelector('td:nth-child(2)')?.textContent;
          const device = devices.find(d => d.ip === ip);
          if (device) handleContextMenu(e, device);
        }
      }}>
        <DataGrid
          columns={columns}
          data={devices}
          onRowDoubleClick={(row) => setDetailDevice(row)}
          actions={
            <button className="btn" onClick={scan} disabled={scanning}>{'\uD83D\uDD04'}</button>
          }
        />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 2000,
            minWidth: 180,
            padding: '4px 0',
            fontSize: 12,
          }}
          onClick={() => setContextMenu(null)}
        >
          <div
            style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text)' }}
            className="ctx-item"
            onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
            onClick={() => copyToClipboard(contextMenu.device.ip)}
          >
            {'\uD83D\uDCCB'} Copia IP
          </div>
          <div
            style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text)' }}
            onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
            onClick={() => copyToClipboard(contextMenu.device.mac)}
          >
            {'\uD83D\uDCCB'} Copia MAC
          </div>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          {contextMenu.device.ports?.includes(80) || contextMenu.device.ports?.includes(443) || contextMenu.device.ports?.includes(8006) ? (
            <div
              style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text)' }}
              onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.target.style.background = 'transparent'}
              onClick={() => openConnection(contextMenu.device, 'http')}
            >
              {'\uD83C\uDF10'} Apri nel Browser
            </div>
          ) : null}
          {contextMenu.device.ports?.includes(3389) && (
            <div
              style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text)' }}
              onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.target.style.background = 'transparent'}
              onClick={() => openConnection(contextMenu.device, 'rdp')}
            >
              {'\uD83D\uDCBB'} RDP
            </div>
          )}
          {contextMenu.device.ports?.includes(22) && (
            <div
              style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text)' }}
              onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.target.style.background = 'transparent'}
              onClick={() => openConnection(contextMenu.device, 'ssh')}
            >
              {'\uD83D\uDC27'} SSH
            </div>
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <div
            style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text)' }}
            onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
            onClick={() => sendWol(contextMenu.device)}
          >
            {'\u26A1'} Wake-on-LAN
          </div>
          <div
            style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text)' }}
            onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
            onClick={() => runTraceroute(contextMenu.device)}
          >
            {'\uD83D\uDDFA\uFE0F'} Traceroute
          </div>
        </div>
      )}

      {/* Device Detail Modal */}
      {detailDevice && (
        <Modal title={`${detailDevice.icon} ${detailDevice.ip} - ${detailDevice.deviceType}`} onClose={() => setDetailDevice(null)} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Left: device info */}
            <div>
              <div className="section-title">Informazioni Dispositivo</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 13 }}>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>IP:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{detailDevice.ip}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>MAC:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{detailDevice.mac || 'N/D'}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Vendor:</span>
                <span>{detailDevice.vendor}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Tipo:</span>
                <span>{detailDevice.deviceType}</span>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Stato:</span>
                <span className={`tag ${detailDevice.status === 'Online' ? 'green' : 'red'}`}>{detailDevice.status}</span>
              </div>
            </div>

            {/* Right: open ports */}
            <div>
              <div className="section-title">Porte Aperte</div>
              {detailDevice.ports?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {detailDevice.ports.map(p => (
                    <div key={p} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '4px 10px', background: 'var(--bg-primary)', borderRadius: 4, fontSize: 12,
                    }}>
                      <span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>{p}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{PORT_SERVICES[p] || 'Unknown'}</span>
                      </span>
                      <span className="tag green" style={{ fontSize: 9 }}>OPEN</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Nessuna porta aperta rilevata</div>
              )}
            </div>
          </div>

          {/* Connection buttons */}
          <div className="section-title" style={{ marginTop: 20 }}>Connessione Rapida</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {detailDevice.ports?.includes(3389) && (
              <button className="btn primary" onClick={() => openConnection(detailDevice, 'rdp')}>
                {'\uD83D\uDCBB'} RDP (3389)
              </button>
            )}
            {detailDevice.ports?.includes(22) && (
              <button className="btn green" onClick={() => openConnection(detailDevice, 'ssh')}>
                {'\uD83D\uDC27'} SSH (22)
              </button>
            )}
            {(detailDevice.ports?.includes(80) || detailDevice.ports?.includes(443)) && (
              <button className="btn" onClick={() => openConnection(detailDevice, 'http')}>
                {'\uD83C\uDF10'} HTTP ({detailDevice.ports.includes(443) ? '443' : '80'})
              </button>
            )}
            {detailDevice.ports?.includes(8006) && (
              <button className="btn amber" onClick={() => {
                window.electronAPI?.shell?.openExternal(`https://${detailDevice.ip}:8006`);
              }}>
                {'\uD83D\uDDA5\uFE0F'} Proxmox (8006)
              </button>
            )}
            {detailDevice.ports?.includes(5900) && (
              <button className="btn" onClick={() => openConnection(detailDevice, 'vnc')}>
                {'\uD83D\uDCFA'} VNC (5900)
              </button>
            )}
            {detailDevice.ports?.includes(9000) && (
              <button className="btn" onClick={() => {
                window.electronAPI?.shell?.openExternal(`http://${detailDevice.ip}:9000`);
              }}>
                {'\uD83D\uDC33'} Portainer (9000)
              </button>
            )}
            <div style={{ height: 1, background: 'var(--border)', margin: '0 4px', alignSelf: 'stretch' }} />
            <button className="btn amber" onClick={() => sendWol(detailDevice)} disabled={!detailDevice.mac}>
              {'\u26A1'} Wake-on-LAN
            </button>
            <button className="btn" onClick={() => { setDetailDevice(null); runTraceroute(detailDevice); }}>
              {'\uD83D\uDDFA\uFE0F'} Traceroute
            </button>
          </div>
        </Modal>
      )}

      {/* Traceroute Modal */}
      {tracerouteModal && (
        <Modal title={`Traceroute: ${tracerouteModal.ip}`} onClose={() => setTracerouteModal(null)} wide>
          {tracerouteLoading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>{'\u23F3'}</div>
              <div>Traceroute in corso verso {tracerouteModal.ip}...</div>
              <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>Potrebbe richiedere fino a 30 secondi</div>
            </div>
          ) : (
            <>
              {tracerouteModal.hops.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600 }}>Hop</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600 }}>IP</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 600 }}>RTT 1 (ms)</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 600 }}>RTT 2 (ms)</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 600 }}>RTT 3 (ms)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracerouteModal.hops.map((hop, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '4px 10px', color: 'var(--accent)', fontWeight: 600 }}>{hop.hop}</td>
                        <td style={{ padding: '4px 10px' }}>{hop.ip === '*' ? <span style={{ color: 'var(--text-muted)' }}>* (timeout)</span> : hop.ip}</td>
                        <td style={{ padding: '4px 10px', textAlign: 'right' }}>{hop.rtt1 !== null ? hop.rtt1 : '*'}</td>
                        <td style={{ padding: '4px 10px', textAlign: 'right' }}>{hop.rtt2 !== null ? hop.rtt2 : '*'}</td>
                        <td style={{ padding: '4px 10px', textAlign: 'right' }}>{hop.rtt3 !== null ? hop.rtt3 : '*'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: 'var(--text-dim)', padding: 16, textAlign: 'center' }}>
                  Nessun hop rilevato. Output raw:
                  <pre style={{ marginTop: 8, fontSize: 11, textAlign: 'left', whiteSpace: 'pre-wrap', background: 'var(--bg-primary)', padding: 12, borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>
                    {tracerouteModal.raw || '(vuoto)'}
                  </pre>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {/* Speed Test Modal */}
      {speedTestModal && (
        <Modal title="Speed Test" onClose={() => { if (!speedTestRunning) setSpeedTestModal(false); }}>
          {speedTestRunning ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 32, marginBottom: 16 }}>{'\uD83D\uDCF6'}</div>
              <div style={{ color: 'var(--text)', fontSize: 14, marginBottom: 8 }}>{speedTestPhase}</div>
              <div style={{ width: '100%', height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  background: 'var(--accent)',
                  borderRadius: 3,
                  animation: 'speedtest-progress 1.5s ease-in-out infinite',
                  width: '40%',
                }} />
              </div>
              <style>{`
                @keyframes speedtest-progress {
                  0% { margin-left: 0; }
                  50% { margin-left: 60%; }
                  100% { margin-left: 0; }
                }
              `}</style>
            </div>
          ) : speedTestResults ? (
            speedTestResults.error ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--red)' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{'\u274C'}</div>
                <div>{speedTestResults.error}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 24, justifyContent: 'center', padding: 24 }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-dim)', marginBottom: 8 }}>Download</div>
                  <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{speedTestResults.download}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Mbps</div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-dim)', marginBottom: 8 }}>Upload</div>
                  <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{speedTestResults.upload}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Mbps</div>
                </div>
              </div>
            )
          ) : null}
          {!speedTestRunning && speedTestResults && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button className="btn primary" onClick={runSpeedTest}>Ripeti Test</button>
              <button className="btn" onClick={() => setSpeedTestModal(false)}>Chiudi</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
