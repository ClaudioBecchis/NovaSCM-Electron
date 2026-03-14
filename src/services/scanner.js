/**
 * NovaSCM Network Scanner Service
 * Scans subnets via Electron preload bridge (electronAPI).
 */

const COMMON_PORTS = [22, 80, 135, 139, 443, 445, 3389, 5900, 8006, 8080, 8123, 8443, 9090, 9091];

const BATCH_SIZE = 20;

// ── MAC OUI Vendor Lookup ───────────────────────────────────────────────────

const OUI_TABLE = {
  '00:15:5D': 'Microsoft (Hyper-V)',
  '00:1A:11': 'Google',
  '00:1B:21': 'Intel',
  '00:1C:42': 'Parallels',
  '00:1E:67': 'Intel',
  '00:21:5A': 'Hewlett Packard',
  '00:22:48': 'Microsoft',
  '00:23:24': 'Apple',
  '00:24:D7': 'Intel',
  '00:25:90': 'Super Micro',
  '00:26:18': 'ASUSTek',
  '00:27:0E': 'Intel',
  '00:50:56': 'VMware',
  '00:0C:29': 'VMware',
  '00:05:69': 'VMware',
  '00:1C:14': 'VMware',
  '00:1A:2B': 'Ubiquiti',
  '24:5A:4C': 'Ubiquiti',
  '68:D7:9A': 'Ubiquiti',
  '74:83:C2': 'Ubiquiti',
  '78:8A:20': 'Ubiquiti',
  '80:2A:A8': 'Ubiquiti',
  'B4:FB:E4': 'Ubiquiti',
  'DC:9F:DB': 'Ubiquiti',
  'F0:9F:C2': 'Ubiquiti',
  'FC:EC:DA': 'Ubiquiti',
  '8C:30:66': 'Ubiquiti',
  '00:1A:A0': 'Dell',
  '00:14:22': 'Dell',
  '18:A9:9B': 'Dell',
  'F0:1F:AF': 'Dell',
  '00:17:A4': 'Hewlett Packard',
  '00:1E:0B': 'Hewlett Packard',
  '3C:D9:2B': 'Hewlett Packard',
  '00:21:CC': 'Lenovo',
  '00:1A:6B': 'Lenovo',
  '70:5A:0F': 'Lenovo',
  '00:1F:C6': 'ASUSTek',
  '04:92:26': 'ASUSTek',
  '2C:FD:A1': 'ASUSTek',
  'B0:6E:BF': 'ASUSTek',
  '18:C0:4D': 'Gigabyte',
  '00:0D:88': 'D-Link',
  '1C:7E:E5': 'D-Link',
  '00:14:6C': 'Netgear',
  '00:1B:2F': 'Netgear',
  '00:23:CD': 'TP-Link',
  '50:C7:BF': 'TP-Link',
  'EC:08:6B': 'TP-Link',
  '14:EB:B6': 'TP-Link',
  '00:1E:58': 'D-Link',
  '00:25:22': 'ASRock',
  '00:E0:4C': 'Realtek',
  '52:54:00': 'QEMU/KVM',
  '00:1C:C0': 'Intel',
  '3C:97:0E': 'Intel',
  '68:05:CA': 'Intel',
  'A4:BB:6D': 'Intel',
  '8C:16:45': 'Apple',
  '00:1B:63': 'Apple',
  '3C:07:54': 'Apple',
  'A8:5C:2C': 'Apple',
  'AC:DE:48': 'Apple',
  'F0:18:98': 'Apple',
  '00:11:32': 'Synology',
  'BC:24:11': 'Proxmox/Linux Bridge',
};

function lookupVendor(mac) {
  if (!mac) return 'Unknown';
  const normalized = mac.toUpperCase().replace(/-/g, ':');
  const prefix = normalized.substring(0, 8);
  return OUI_TABLE[prefix] || 'Unknown';
}

// ── CIDR Parser ─────────────────────────────────────────────────────────────

function parseCIDR(cidr) {
  const [network, maskStr] = cidr.split('/');
  const mask = parseInt(maskStr, 10);
  const parts = network.split('.').map(Number);
  const ipNum = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const hostBits = 32 - mask;
  const numHosts = (1 << hostBits) >>> 0;

  const ips = [];
  // Skip network address (i=0) and broadcast address (i=numHosts-1)
  for (let i = 1; i < numHosts - 1; i++) {
    const addr = (ipNum + i) >>> 0;
    ips.push(
      `${(addr >>> 24) & 0xFF}.${(addr >>> 16) & 0xFF}.${(addr >>> 8) & 0xFF}.${addr & 0xFF}`
    );
  }
  return ips;
}

// ── Device Type Detection ───────────────────────────────────────────────────

function detectDeviceType(openPorts, vendor, hostname) {
  const ports = new Set(openPorts || []);
  const v = (vendor || '').toLowerCase();
  const h = (hostname || '').toLowerCase();

  // Proxmox
  if (ports.has(8006)) {
    return { icon: 'server', type: 'Proxmox', os: 'Linux (Proxmox VE)' };
  }

  // UniFi
  if (v.includes('ubiquiti') || h.includes('unifi')) {
    if (ports.has(8443) || ports.has(8080)) {
      return { icon: 'wifi', type: 'UniFi Controller', os: 'UniFi OS' };
    }
    return { icon: 'wifi', type: 'UniFi Device', os: 'UniFi OS' };
  }

  // Home Assistant
  if (ports.has(8123)) {
    return { icon: 'home', type: 'Home Assistant', os: 'Linux (HAOS)' };
  }

  // VMware
  if (v.includes('vmware')) {
    return { icon: 'cloud', type: 'VMware VM', os: 'Unknown (VM)' };
  }

  // QEMU / KVM
  if (v.includes('qemu') || v.includes('kvm')) {
    return { icon: 'cloud', type: 'KVM VM', os: 'Unknown (VM)' };
  }

  // Hyper-V
  if (v.includes('hyper-v') || v.includes('microsoft')) {
    if (ports.has(3389)) {
      return { icon: 'monitor', type: 'Windows (Hyper-V)', os: 'Windows' };
    }
    return { icon: 'cloud', type: 'Hyper-V VM', os: 'Unknown (VM)' };
  }

  // Windows
  if (ports.has(3389) && ports.has(445)) {
    return { icon: 'monitor', type: 'Windows PC', os: 'Windows' };
  }
  if (ports.has(3389)) {
    return { icon: 'monitor', type: 'Windows', os: 'Windows' };
  }
  if (ports.has(135) && ports.has(445)) {
    return { icon: 'monitor', type: 'Windows', os: 'Windows' };
  }

  // NovaSCM Server
  if (ports.has(9091)) {
    return { icon: 'server', type: 'NovaSCM Server', os: 'Linux' };
  }

  // Web server
  if (ports.has(443) || ports.has(8443)) {
    return { icon: 'globe', type: 'Web Server (HTTPS)', os: 'Unknown' };
  }
  if (ports.has(80) || ports.has(8080)) {
    return { icon: 'globe', type: 'Web Server', os: 'Unknown' };
  }

  // NAS / Synology
  if (v.includes('synology')) {
    return { icon: 'hard-drive', type: 'Synology NAS', os: 'DSM' };
  }

  // Apple
  if (v.includes('apple')) {
    return { icon: 'monitor', type: 'Apple Device', os: 'macOS/iOS' };
  }

  // Linux (SSH only)
  if (ports.has(22) && ports.size <= 2) {
    return { icon: 'terminal', type: 'Linux', os: 'Linux' };
  }
  if (ports.has(22)) {
    return { icon: 'server', type: 'Linux Server', os: 'Linux' };
  }

  // VNC
  if (ports.has(5900)) {
    return { icon: 'monitor', type: 'VNC Host', os: 'Unknown' };
  }

  // Printer / Generic
  if (ports.has(9100)) {
    return { icon: 'printer', type: 'Printer', os: 'Firmware' };
  }

  // Fallback
  if (ports.size > 0) {
    return { icon: 'circle', type: 'Network Device', os: 'Unknown' };
  }

  return { icon: 'circle', type: 'Unknown', os: 'Unknown' };
}

// ── Subnet Scanner ──────────────────────────────────────────────────────────

async function scanSubnet(cidr, onProgress, onDevice) {
  const ips = parseCIDR(cidr);
  const total = ips.length;
  let completed = 0;

  // Pre-fetch ARP table for MAC resolution
  let arpMap = {};
  try {
    const arpResult = await window.electronAPI.net.arpTable();
    const arpEntries = arpResult?.entries || arpResult || [];
    if (Array.isArray(arpEntries)) {
      for (const entry of arpEntries) {
        if (entry.ip) {
          arpMap[entry.ip] = entry.mac || '';
        }
      }
    }
  } catch (err) {
    console.warn('[Scanner] Could not fetch ARP table:', err.message);
  }

  const devices = [];

  // Process IPs in batches
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = ips.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (ip) => {
        try {
          const pingResult = await window.electronAPI.net.ping(ip);
          if (!pingResult || !pingResult.alive) return null;

          // Resolve MAC
          let mac = arpMap[ip] || '';
          if (!mac) {
            try {
              const freshArpResult = await window.electronAPI.net.arpTable();
              const freshArp = freshArpResult?.entries || freshArpResult || [];
              if (Array.isArray(freshArp)) {
                const entry = freshArp.find((e) => e.ip === ip);
                if (entry) mac = entry.mac || '';
              }
            } catch (_) {
              // ignore
            }
          }

          const vendor = lookupVendor(mac);

          // Port scan
          let openPorts = [];
          try {
            const portResults = await Promise.all(
              COMMON_PORTS.map(p =>
                window.electronAPI.net.portScan(ip, p)
                  .then(r => r?.open ? p : null)
                  .catch(() => null)
              )
            );
            openPorts = portResults.filter(p => p !== null);
          } catch (_) {
            // ignore
          }

          const typeInfo = detectDeviceType(openPorts, vendor, '');

          const device = {
            ip,
            mac: mac || '',
            vendor,
            openPorts,
            ...typeInfo,
            hostname: '',
          };

          if (typeof onDevice === 'function') {
            onDevice(device);
          }

          return device;
        } catch (_) {
          return null;
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        devices.push(result.value);
      }
    }

    completed += batch.length;
    if (typeof onProgress === 'function') {
      onProgress(Math.round((completed / total) * 100));
    }
  }

  return devices;
}

export default {
  parseCIDR,
  scanSubnet,
  detectDeviceType,
  lookupVendor,
  COMMON_PORTS,
};
