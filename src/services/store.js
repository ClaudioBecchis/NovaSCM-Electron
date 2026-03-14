/**
 * NovaSCM Local Configuration Store
 * Persists configuration in localStorage with JSON serialization.
 */

const STORAGE_KEY = 'novascm-config';

export const DEFAULT_CONFIG = {
  apiUrl: 'http://192.168.1.100:9091',
  apiKey: '',
  scanNetworks: '192.168.10.0/24\n192.168.20.0/24',
  scanTimeout: 1000,
  certportalUrl: 'http://192.168.1.100:9090',
  certDays: 365,
  certOrg: 'PolarisCore',
  certDomain: 'corp.example.com',
  certSsid: 'PolarisCore-Secure',
  certRadiusIp: '192.168.1.105',
  unifiUrl: '',
  unifiUser: '',
  unifiPass: '',
  defaultDomain: 'corp.example.com',
  defaultOu: 'OU=Computers,DC=corp,DC=polariscore,DC=it',
  defaultDcIp: '192.168.1.199',
  pcNamePrefix: 'PC-',
  logLevel: 'info',
  autoRefresh: 30,
  theme: 'dark',
};

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (err) {
    console.error('[Store] Failed to load config:', err.message);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('[Store] Failed to save config:', err.message);
  }
}

export function getConfigValue(key) {
  const config = loadConfig();
  return key in config ? config[key] : DEFAULT_CONFIG[key];
}

export function setConfigValue(key, value) {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

export default {
  loadConfig,
  saveConfig,
  getConfigValue,
  setConfigValue,
  DEFAULT_CONFIG,
};
