/**
 * NovaSCM Local Configuration Store
 * Persists configuration in localStorage with JSON serialization.
 */

const STORAGE_KEY = 'novascm-config';

const DEFAULT_CONFIG = {
  apiUrl: 'http://192.168.20.110:9091',
  apiKey: '',
  scanNetworks: ['192.168.10.0/24', '192.168.20.0/24'],
  certportalUrl: 'http://192.168.20.110:9090',
  unifiUrl: 'https://192.168.10.1',
  unifiUser: 'admin',
  unifiPass: '',
  ssid: 'PolarisCore-Secure',
  radiusIp: '192.168.20.105',
  domain: 'corp.polariscore.it',
  orgName: 'PolarisCore',
  certDays: 3650,
  adminPass: '',
  theme: 'dark',
  refreshInterval: 10,
  logLevel: 'info',
};

function loadConfig() {
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

function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('[Store] Failed to save config:', err.message);
  }
}

function getConfigValue(key, defaultValue) {
  const config = loadConfig();
  if (key in config) {
    return config[key];
  }
  return defaultValue !== undefined ? defaultValue : DEFAULT_CONFIG[key];
}

function setConfigValue(key, value) {
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
