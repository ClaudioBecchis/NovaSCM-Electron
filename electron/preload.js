// ============================================================================
// NovaSCM - Preload Script (Context Bridge)
// Exposes safe IPC methods to the renderer via window.electronAPI
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // --- Window Controls ---
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

  // --- Dialogs ---
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  },

  // --- Shell ---
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },

  // --- File System ---
  fs: {
    readFile: (filePath, encoding) => ipcRenderer.invoke('fs:readFile', filePath, encoding),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
    mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
  },

  // --- Network ---
  net: {
    ping: (host, timeout) => ipcRenderer.invoke('net:ping', host, timeout),
    portScan: (host, port, timeout) => ipcRenderer.invoke('net:portScan', host, port, timeout),
    arpTable: () => ipcRenderer.invoke('net:arpTable'),
  },

  // --- Clipboard ---
  clipboard: {
    copy: (text) => ipcRenderer.invoke('clipboard:copy', text),
  },

  // --- App Info ---
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    getArch: () => ipcRenderer.invoke('app:getArch'),
    getUserDataPath: () => ipcRenderer.invoke('app:getUserDataPath'),
  },

  // --- Notifications ---
  notification: {
    show: (title, body) => ipcRenderer.invoke('notification:show', title, body),
  },
});
