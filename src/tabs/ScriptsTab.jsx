import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DataGrid from '../components/DataGrid';
import Modal from '../components/Modal';

// ── Built-in Script Library ─────────────────────────────────────────────────
const BUILTIN_SCRIPTS = [
  {
    id: 'builtin-01',
    name: 'Inventario Hardware',
    description: 'Raccoglie informazioni su nome PC, produttore, modello e RAM',
    platform: 'windows',
    category: 'Inventario',
    code: 'Get-CimInstance Win32_ComputerSystem | Select Name,Manufacturer,Model,TotalPhysicalMemory',
    isBuiltin: true,
  },
  {
    id: 'builtin-02',
    name: 'Inventario Software',
    description: 'Elenca tutti i software installati con versione e produttore',
    platform: 'windows',
    category: 'Inventario',
    code: 'Get-CimInstance Win32_Product | Select Name,Version,Vendor | Sort Name',
    isBuiltin: true,
  },
  {
    id: 'builtin-03',
    name: 'Servizi in esecuzione',
    description: 'Mostra tutti i servizi Windows attualmente in esecuzione',
    platform: 'windows',
    category: 'Sistema',
    code: 'Get-Service | Where Status -eq Running | Select Name,DisplayName,StartType | Sort DisplayName',
    isBuiltin: true,
  },
  {
    id: 'builtin-04',
    name: 'Spazio disco',
    description: 'Visualizza spazio totale e libero per ogni disco fisso',
    platform: 'windows',
    category: 'Inventario',
    code: 'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select DeviceID,@{N=\'Size(GB)\';E={[math]::Round($_.Size/1GB,1)}},@{N=\'Free(GB)\';E={[math]::Round($_.FreeSpace/1GB,1)}}',
    isBuiltin: true,
  },
  {
    id: 'builtin-05',
    name: 'Ultimi 50 eventi errore',
    description: 'Legge gli ultimi 50 errori dal log di sistema',
    platform: 'windows',
    category: 'Sistema',
    code: 'Get-EventLog -LogName System -EntryType Error -Newest 50 | Select TimeGenerated,Source,Message',
    isBuiltin: true,
  },
  {
    id: 'builtin-06',
    name: 'Aggiornamenti installati',
    description: 'Elenca gli hotfix/aggiornamenti installati ordinati per data',
    platform: 'windows',
    category: 'Sistema',
    code: 'Get-HotFix | Sort InstalledOn -Desc | Select HotFixID,Description,InstalledOn',
    isBuiltin: true,
  },
  {
    id: 'builtin-07',
    name: 'Info rete',
    description: 'Mostra configurazione IP, gateway e DNS per ogni interfaccia',
    platform: 'windows',
    category: 'Rete',
    code: 'Get-NetIPConfiguration | Select InterfaceAlias,IPv4Address,IPv4DefaultGateway,DNSServer',
    isBuiltin: true,
  },
  {
    id: 'builtin-08',
    name: 'Processi top CPU',
    description: 'I 20 processi con il maggior utilizzo CPU',
    platform: 'windows',
    category: 'Sistema',
    code: 'Get-Process | Sort CPU -Desc | Select -First 20 Name,Id,CPU,WorkingSet64',
    isBuiltin: true,
  },
  {
    id: 'builtin-09',
    name: 'Utenti locali',
    description: 'Elenca tutti gli utenti locali con stato e ultimo accesso',
    platform: 'windows',
    category: 'Sicurezza',
    code: 'Get-LocalUser | Select Name,Enabled,LastLogon,PasswordLastSet',
    isBuiltin: true,
  },
  {
    id: 'builtin-10',
    name: 'Programmi avvio',
    description: 'Mostra i programmi configurati per l\'avvio automatico',
    platform: 'windows',
    category: 'Sistema',
    code: 'Get-CimInstance Win32_StartupCommand | Select Name,Command,Location',
    isBuiltin: true,
  },
  {
    id: 'builtin-11',
    name: 'Firewall regole',
    description: 'Elenca le regole firewall attive con direzione e azione',
    platform: 'windows',
    category: 'Sicurezza',
    code: 'Get-NetFirewallRule | Where Enabled -eq True | Select DisplayName,Direction,Action | Sort DisplayName',
    isBuiltin: true,
  },
  {
    id: 'builtin-12',
    name: 'Task pianificati',
    description: 'Mostra i task pianificati attivi nel sistema',
    platform: 'windows',
    category: 'Sistema',
    code: 'Get-ScheduledTask | Where State -ne Disabled | Select TaskName,TaskPath,State',
    isBuiltin: true,
  },
  {
    id: 'builtin-13',
    name: 'Info BIOS',
    description: 'Informazioni BIOS: produttore, versione, data rilascio, seriale',
    platform: 'windows',
    category: 'Inventario',
    code: 'Get-CimInstance Win32_BIOS | Select Manufacturer,SMBIOSBIOSVersion,ReleaseDate,SerialNumber',
    isBuiltin: true,
  },
  {
    id: 'builtin-14',
    name: 'Certificati scaduti',
    description: 'Trova certificati scaduti nello store LocalMachine\\My',
    platform: 'windows',
    category: 'Sicurezza',
    code: 'Get-ChildItem Cert:\\LocalMachine\\My | Where {$_.NotAfter -lt (Get-Date)} | Select Thumbprint,Subject,NotAfter',
    isBuiltin: true,
  },
];

const CATEGORIES = ['Inventario', 'Rete', 'Sicurezza', 'Sistema'];
const PLATFORMS = [
  { value: 'windows', label: 'Windows' },
  { value: 'linux', label: 'Linux' },
  { value: 'all', label: 'Tutti' },
];

const STORAGE_KEY = 'novascm_custom_scripts';

function loadCustomScripts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomScripts(scripts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}

const platformLabel = (p) => {
  const found = PLATFORMS.find(x => x.value === p);
  return found ? found.label : p;
};

const platformColor = (p) => {
  if (p === 'windows') return 'blue';
  if (p === 'linux') return 'green';
  return 'muted';
};

const categoryColor = (c) => {
  if (c === 'Inventario') return 'accent';
  if (c === 'Rete') return 'blue';
  if (c === 'Sicurezza') return 'red';
  if (c === 'Sistema') return 'green';
  return 'muted';
};

const scriptColumns = [
  { key: 'name', label: 'Nome' },
  {
    key: 'platform',
    label: 'Piattaforma',
    width: 110,
    render: (v) => <span className={`tag ${platformColor(v)}`}>{platformLabel(v)}</span>,
  },
  {
    key: 'category',
    label: 'Categoria',
    width: 110,
    render: (v) => <span className={`tag ${categoryColor(v)}`}>{v}</span>,
  },
];

export default function ScriptsTab({ addLog, config, toast, serverOnline }) {
  const [customScripts, setCustomScripts] = useState(() => loadCustomScripts());
  const [selected, setSelected] = useState(null);
  const [showOutput, setShowOutput] = useState(false);
  const [outputText, setOutputText] = useState('');

  // Editor state
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPlatform, setEditPlatform] = useState('windows');
  const [editCategory, setEditCategory] = useState('Sistema');
  const [editCode, setEditCode] = useState('');
  const [dirty, setDirty] = useState(false);

  // All scripts combined
  const allScripts = useMemo(
    () => [...BUILTIN_SCRIPTS, ...customScripts],
    [customScripts]
  );

  // Sync editor when selection changes
  useEffect(() => {
    if (selected) {
      setEditName(selected.name || '');
      setEditDesc(selected.description || '');
      setEditPlatform(selected.platform || 'windows');
      setEditCategory(selected.category || 'Sistema');
      setEditCode(selected.code || '');
      setDirty(false);
    }
  }, [selected]);

  const markDirty = useCallback(() => setDirty(true), []);

  // ── CRUD ────────────────────────────────────────────────────────────────
  const handleNew = useCallback(() => {
    const id = `custom-${Date.now()}`;
    const newScript = {
      id,
      name: 'Nuovo Script',
      description: '',
      platform: 'windows',
      category: 'Sistema',
      code: '# Scrivi il tuo script PowerShell qui\n',
      isBuiltin: false,
    };
    const updated = [...customScripts, newScript];
    setCustomScripts(updated);
    saveCustomScripts(updated);
    setSelected(newScript);
    addLog('Nuovo script personalizzato creato', 'info');
  }, [customScripts, addLog]);

  const handleSave = useCallback(() => {
    if (!selected || selected.isBuiltin) return;
    const updatedScript = {
      ...selected,
      name: editName.trim() || 'Senza nome',
      description: editDesc.trim(),
      platform: editPlatform,
      category: editCategory,
      code: editCode,
    };
    const updated = customScripts.map(s => s.id === selected.id ? updatedScript : s);
    setCustomScripts(updated);
    saveCustomScripts(updated);
    setSelected(updatedScript);
    setDirty(false);
    addLog(`Script "${updatedScript.name}" salvato`, 'success');
    if (toast) toast(`Script "${updatedScript.name}" salvato`, 'success');
  }, [selected, editName, editDesc, editPlatform, editCategory, editCode, customScripts, addLog, toast]);

  const handleDelete = useCallback(() => {
    if (!selected || selected.isBuiltin) return;
    if (!confirm(`Eliminare lo script "${selected.name}"?`)) return;
    const updated = customScripts.filter(s => s.id !== selected.id);
    setCustomScripts(updated);
    saveCustomScripts(updated);
    addLog(`Script "${selected.name}" eliminato`, 'success');
    setSelected(null);
    setDirty(false);
  }, [selected, customScripts, addLog]);

  // ── Export ──────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!selected) return;
    const code = selected.isBuiltin ? selected.code : editCode;
    const filename = `${(selected.name || 'script').replace(/[^a-zA-Z0-9_-]/g, '_')}.ps1`;
    try {
      if (window.electronAPI?.dialog?.saveFile) {
        const result = await window.electronAPI.dialog.saveFile({
          defaultPath: filename,
          filters: [{ name: 'PowerShell Script', extensions: ['ps1'] }],
        });
        if (result && !result.canceled) {
          const filePath = result.filePath || result;
          await window.electronAPI.fs.writeFile(filePath, code);
          addLog(`Script esportato: ${filePath}`, 'success');
          if (toast) toast(`Esportato: ${filePath}`, 'success');
        }
      } else {
        // Fallback: browser download
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        addLog(`Script "${selected.name}" esportato`, 'success');
      }
    } catch (e) {
      addLog(`Errore esportazione: ${e.message}`, 'error');
    }
  }, [selected, editCode, addLog, toast]);

  // ── Import ──────────────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    try {
      let content = null;
      let fileName = 'Importato';

      if (window.electronAPI?.dialog?.openFile) {
        const result = await window.electronAPI.dialog.openFile({
          filters: [{ name: 'PowerShell Script', extensions: ['ps1'] }],
          properties: ['openFile'],
        });
        if (result && !result.canceled) {
          const filePath = Array.isArray(result.filePaths) ? result.filePaths[0] : result;
          if (filePath) {
            const readResult = await window.electronAPI.fs.readFile(filePath, 'utf-8');
            content = readResult?.success ? readResult.data : readResult;
            // Extract filename without extension for script name
            const parts = filePath.replace(/\\/g, '/').split('/');
            fileName = parts[parts.length - 1].replace(/\.ps1$/i, '');
          }
        }
      } else {
        // Fallback: file input
        content = await new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.ps1';
          input.onchange = (ev) => {
            const file = ev.target.files[0];
            if (!file) { resolve(null); return; }
            fileName = file.name.replace(/\.ps1$/i, '');
            const reader = new FileReader();
            reader.onload = (re) => resolve(re.target.result);
            reader.readAsText(file);
          };
          input.click();
        });
      }

      if (!content) return;

      const id = `custom-${Date.now()}`;
      const newScript = {
        id,
        name: fileName,
        description: `Importato da file ${fileName}.ps1`,
        platform: 'windows',
        category: 'Sistema',
        code: content,
        isBuiltin: false,
      };
      const updated = [...customScripts, newScript];
      setCustomScripts(updated);
      saveCustomScripts(updated);
      setSelected(newScript);
      addLog(`Script "${fileName}" importato`, 'success');
      if (toast) toast(`Script "${fileName}" importato`, 'success');
    } catch (e) {
      addLog(`Errore importazione: ${e.message}`, 'error');
    }
  }, [customScripts, addLog, toast]);

  // ── Execute locally ─────────────────────────────────────────────────────
  const handleExecute = useCallback(() => {
    if (!selected) return;
    const code = selected.isBuiltin ? selected.code : editCode;
    // For now, show a toast — IPC for script execution not yet available
    addLog('Esecuzione script non ancora implementata', 'warn');
    if (toast) toast('Esecuzione script non ancora implementata', 'warn');
    // Placeholder: show the code that would run
    setOutputText(`# Esecuzione locale non disponibile\n# Lo script seguente verrebbe eseguito:\n\n${code}`);
    setShowOutput(true);
  }, [selected, editCode, addLog, toast]);

  // ── Copy to clipboard ──────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!selected) return;
    const code = selected.isBuiltin ? selected.code : editCode;
    try {
      if (window.electronAPI?.clipboard?.copy) {
        await window.electronAPI.clipboard.copy(code);
      } else {
        await navigator.clipboard.writeText(code);
      }
      addLog('Script copiato negli appunti', 'success');
      if (toast) toast('Copiato negli appunti', 'success');
    } catch (e) {
      addLog(`Errore copia: ${e.message}`, 'error');
    }
  }, [selected, editCode, addLog, toast]);

  const isReadOnly = selected?.isBuiltin === true;

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 220px)' }}>
      {/* ── Left Panel: Script Library ──────────────────────────────────── */}
      <div style={{ width: '40%', minWidth: 340, display: 'flex', flexDirection: 'column' }}>
        <DataGrid
          columns={scriptColumns}
          data={allScripts}
          onRowClick={(row) => setSelected(row)}
          emptyMessage="Nessuno script"
          actions={
            <>
              <button className="btn primary" onClick={handleNew}>+ Nuovo Script</button>
              <button className="btn" onClick={handleImport}>Importa .ps1</button>
            </>
          }
        />
      </div>

      {/* ── Right Panel: Editor ─────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16,
      }}>
        {selected ? (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>
                {selected.name}
                {selected.isBuiltin && <span className="tag muted" style={{ marginLeft: 8 }}>Built-in</span>}
                {dirty && <span style={{ color: 'var(--amber)', marginLeft: 8, fontSize: 12 }}>* non salvato</span>}
              </span>
              <button className="btn" onClick={handleCopy} title="Copia negli appunti">Copia</button>
              <button className="btn" onClick={handleExport}>Esporta .ps1</button>
              <button className="btn accent" onClick={handleExecute}>Esegui Localmente</button>
            </div>

            {/* Name + Description */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Nome</label>
                <input
                  className="form-input"
                  value={editName}
                  onChange={(e) => { setEditName(e.target.value); markDirty(); }}
                  disabled={isReadOnly}
                  placeholder="Nome dello script"
                />
              </div>
              <div style={{ width: 140 }}>
                <label className="form-label">Piattaforma</label>
                <select
                  className="form-select"
                  value={editPlatform}
                  onChange={(e) => { setEditPlatform(e.target.value); markDirty(); }}
                  disabled={isReadOnly}
                >
                  {PLATFORMS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ width: 140 }}>
                <label className="form-label">Categoria</label>
                <select
                  className="form-select"
                  value={editCategory}
                  onChange={(e) => { setEditCategory(e.target.value); markDirty(); }}
                  disabled={isReadOnly}
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Descrizione</label>
              <input
                className="form-input"
                value={editDesc}
                onChange={(e) => { setEditDesc(e.target.value); markDirty(); }}
                disabled={isReadOnly}
                placeholder="Descrizione dello script..."
              />
            </div>

            {/* Code editor */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <label className="form-label">Codice</label>
              <textarea
                className="form-textarea"
                value={editCode}
                onChange={(e) => { setEditCode(e.target.value); markDirty(); }}
                disabled={isReadOnly}
                spellCheck={false}
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  resize: 'none',
                  tabSize: 4,
                  whiteSpace: 'pre',
                  overflowWrap: 'normal',
                  overflowX: 'auto',
                }}
              />
            </div>

            {/* Footer actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              {!isReadOnly && (
                <>
                  <button className="btn red" onClick={handleDelete}>Elimina Script</button>
                  <button className="btn primary" onClick={handleSave} disabled={!dirty}>Salva</button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ flex: 1, justifyContent: 'center' }}>
            <div className="icon">{'\uD83D\uDCDC'}</div>
            <div className="title">Libreria Script</div>
            <div className="desc">
              Seleziona uno script dalla libreria a sinistra per visualizzarlo, modificarlo o eseguirlo.
              <br />Puoi anche creare nuovi script personalizzati o importare file .ps1.
            </div>
          </div>
        )}
      </div>

      {/* ── Output Modal ───────────────────────────────────────────────── */}
      {showOutput && (
        <Modal
          title="Output Script"
          onClose={() => setShowOutput(false)}
          wide
          footer={
            <button className="btn" onClick={() => setShowOutput(false)}>Chiudi</button>
          }
        >
          <pre style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.5,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 16,
            maxHeight: 400,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            color: 'var(--text)',
            margin: 0,
          }}>
            {outputText}
          </pre>
        </Modal>
      )}
    </div>
  );
}
