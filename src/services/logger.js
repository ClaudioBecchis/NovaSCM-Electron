/**
 * NovaSCM Application Logger
 * Singleton logger with in-memory storage and real-time listeners.
 */

const MAX_ENTRIES = 500;

const entries = [];
const listeners = [];

function addEntry(msg, level) {
  const entry = {
    ts: new Date().toISOString(),
    msg,
    level,
  };

  entries.push(entry);

  // Trim oldest entries when exceeding max
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }

  // Notify listeners
  for (const cb of listeners) {
    try {
      cb(entry);
    } catch (_) {
      // ignore listener errors
    }
  }

  // Also log to console
  const consoleFn = level === 'error' ? console.error
    : level === 'warn' ? console.warn
    : console.log;
  consoleFn(`[${level.toUpperCase()}] ${msg}`);
}

function log(msg, level = 'info') {
  addEntry(msg, level);
}

function info(msg) {
  addEntry(msg, 'info');
}

function success(msg) {
  addEntry(msg, 'success');
}

function warn(msg) {
  addEntry(msg, 'warn');
}

function error(msg) {
  addEntry(msg, 'error');
}

function getEntries(limit) {
  if (limit && limit > 0) {
    return entries.slice(-limit);
  }
  return [...entries];
}

function clear() {
  entries.length = 0;
}

function onEntry(callback) {
  if (typeof callback === 'function') {
    listeners.push(callback);
  }
  // Return unsubscribe function
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) {
      listeners.splice(idx, 1);
    }
  };
}

function exportLog() {
  return entries
    .map((e) => `[${e.ts}] [${e.level.toUpperCase().padEnd(7)}] ${e.msg}`)
    .join('\n');
}

export default {
  log,
  info,
  success,
  warn,
  error,
  getEntries,
  clear,
  onEntry,
  export: exportLog,
};
