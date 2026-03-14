import React, { useState, useEffect, useCallback } from 'react';
import DataGrid from '../components/DataGrid';
import Modal from '../components/Modal';
import * as api from '../services/api';

const BOOT_ACTIONS = [
  { value: 'auto', label: 'Auto', color: 'blue' },
  { value: 'deploy', label: 'Deploy', color: 'green' },
  { value: 'local', label: 'Local Boot', color: 'muted' },
  { value: 'block', label: 'Bloccato', color: 'red' },
];

function renderBootAction(v) {
  const action = BOOT_ACTIONS.find(a => a.value === v) || { label: v || 'N/D', color: 'muted' };
  return <span className={`tag ${action.color}`}>{action.label}</span>;
}

const hostColumns = [
  { key: 'mac', label: 'MAC', width: 160 },
  { key: 'pc_name', label: 'PC Name' },
  { key: 'boot_action', label: 'Azione Boot', width: 120, render: renderBootAction },
  { key: 'workflow_nome', label: 'Workflow', width: 160 },
  { key: 'boot_count', label: 'Boot Count', width: 90 },
  { key: 'last_boot_at', label: 'Ultimo Boot', width: 160, render: (v) => v ? new Date(v).toLocaleString('it-IT') : 'Mai' },
  { key: 'last_ip', label: 'Ultimo IP', width: 130, render: (v) => v ? <span style={{ fontFamily: 'var(--font-mono)' }}>{v}</span> : '' },
];

const logColumns = [
  { key: 'ts', label: 'Timestamp', width: 180, render: (v) => v ? new Date(v).toLocaleString('it-IT') : '' },
  { key: 'mac', label: 'MAC', width: 160 },
  { key: 'pc_name', label: 'PC' },
  { key: 'ip', label: 'IP', width: 140, render: (v) => v ? <span style={{ fontFamily: 'var(--font-mono)' }}>{v}</span> : '' },
  { key: 'action', label: 'Azione', width: 120, render: renderBootAction },
];

const EMPTY_HOST = {
  mac: '',
  pc_name: '',
  boot_action: 'auto',
  workflow_id: '',
};

export default function PxeTab({ addLog }) {
  const [innerTab, setInnerTab] = useState('hosts');
  const [hosts, setHosts] = useState([]);
  const [bootLog, setBootLog] = useState([]);
  const [settings, setSettings] = useState({});
  const [pxeStatus, setPxeStatus] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedHost, setSelectedHost] = useState(null);
  const [showHostEditor, setShowHostEditor] = useState(false);
  const [editingHost, setEditingHost] = useState(null);
  const [hostForm, setHostForm] = useState({ ...EMPTY_HOST });

  const [settingsForm, setSettingsForm] = useState({});
  const [settingsDirty, setSettingsDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hostsData, logData, settingsData, statusData, wfData] = await Promise.allSettled([
        api.getPxeHosts(),
        api.getPxeBootLog(),
        api.getPxeSettings(),
        api.getPxeStatus(),
        api.getWorkflows(),
      ]);

      if (hostsData.status === 'fulfilled') {
        const h = hostsData.value;
        setHosts(Array.isArray(h) ? h : h?.hosts || []);
      }
      if (logData.status === 'fulfilled') {
        const l = logData.value;
        setBootLog(Array.isArray(l) ? l : l?.logs || []);
      }
      if (settingsData.status === 'fulfilled') {
        const s = settingsData.value;
        const cfg = s?.settings || s || {};
        setSettings(cfg);
        setSettingsForm(cfg);
      }
      if (statusData.status === 'fulfilled') {
        setPxeStatus(statusData.value);
      }
      if (wfData.status === 'fulfilled') {
        const w = wfData.value;
        setWorkflows(Array.isArray(w) ? w : w?.workflows || []);
      }
    } catch (e) {
      addLog(`Errore caricamento PXE: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  useEffect(() => { load(); }, [load]);

  const openHostEditor = (host = null) => {
    if (host) {
      setEditingHost(host);
      setHostForm({
        mac: host.mac || '',
        pc_name: host.pc_name || '',
        boot_action: host.boot_action || 'auto',
        workflow_id: host.workflow_id || '',
      });
    } else {
      setEditingHost(null);
      setHostForm({ ...EMPTY_HOST });
    }
    setShowHostEditor(true);
  };

  const handleSaveHost = async () => {
    if (!hostForm.mac.trim()) return;
    const payload = { ...hostForm };
    if (payload.workflow_id) payload.workflow_id = parseInt(payload.workflow_id);
    else delete payload.workflow_id;

    try {
      if (editingHost) {
        await api.updatePxeHost(editingHost.mac, payload);
        addLog(`Host PXE aggiornato: ${hostForm.mac}`, 'success');
      } else {
        await api.createPxeHost(payload);
        addLog(`Host PXE creato: ${hostForm.mac}`, 'success');
      }
      setShowHostEditor(false);
      await load();
    } catch (e) {
      addLog(`Errore salvataggio host: ${e.message}`, 'error');
    }
  };

  const handleDeleteHost = async () => {
    if (!selectedHost) return;
    if (!confirm(`Eliminare l'host PXE "${selectedHost.mac}"?`)) return;
    try {
      await api.deletePxeHost(selectedHost.mac);
      addLog(`Host PXE eliminato: ${selectedHost.mac}`, 'success');
      setSelectedHost(null);
      await load();
    } catch (e) {
      addLog(`Errore eliminazione host: ${e.message}`, 'error');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await api.updatePxeSettings(settingsForm);
      addLog('Impostazioni PXE salvate', 'success');
      setSettingsDirty(false);
      setSettings({ ...settingsForm });
    } catch (e) {
      addLog(`Errore salvataggio impostazioni: ${e.message}`, 'error');
    }
  };

  const updateSetting = (key, value) => {
    setSettingsForm(prev => ({ ...prev, [key]: value }));
    setSettingsDirty(true);
  };

  const tftpOnline = pxeStatus?.tftp_alive || pxeStatus?.tftp_online || pxeStatus?.tftp === 'online';
  const autoProvision = settingsForm.auto_provision === '1' || settingsForm.auto_provision === true;

  return (
    <div>
      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Host PXE</div>
          <div className="stat-value accent">{hosts.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TFTP Server</div>
          <div className={`stat-value ${tftpOnline ? 'green' : 'red'}`}>
            {tftpOnline ? 'Online' : 'Offline'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Auto-Provision</div>
          <div className="stat-value" style={{ color: autoProvision ? 'var(--green)' : 'var(--text-dim)' }}>
            {autoProvision ? 'ON' : 'OFF'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Boot Totali</div>
          <div className="stat-value amber">{bootLog.length}</div>
        </div>
      </div>

      {/* Inner Tabs */}
      <div className="inner-tabs">
        {[
          { key: 'hosts', label: 'Host PXE' },
          { key: 'log', label: 'Boot Log' },
          { key: 'settings', label: 'Impostazioni PXE' },
        ].map(t => (
          <div
            key={t.key}
            className={`inner-tab ${innerTab === t.key ? 'active' : ''}`}
            onClick={() => setInnerTab(t.key)}
          >
            {t.label}
          </div>
        ))}
      </div>

      {/* Host tab */}
      {innerTab === 'hosts' && (
        <DataGrid
          columns={hostColumns}
          data={hosts}
          loading={loading}
          onRowClick={setSelectedHost}
          onRowDoubleClick={(row) => openHostEditor(row)}
          rowKey="mac"
          emptyMessage="Nessun host PXE registrato"
          actions={
            <>
              <button className="btn primary" onClick={() => openHostEditor()}>+ Nuovo Host</button>
              <button className="btn" onClick={() => selectedHost && openHostEditor(selectedHost)} disabled={!selectedHost}>Modifica</button>
              <button className="btn red" onClick={handleDeleteHost} disabled={!selectedHost}>{'\uD83D\uDDD1'} Elimina</button>
              <button className="btn" onClick={load}>{'\uD83D\uDD04'} Aggiorna</button>
            </>
          }
        />
      )}

      {/* Boot Log tab */}
      {innerTab === 'log' && (
        <DataGrid
          columns={logColumns}
          data={bootLog}
          loading={loading}
          emptyMessage="Nessun boot registrato"
          actions={
            <button className="btn" onClick={load}>{'\uD83D\uDD04'} Aggiorna</button>
          }
        />
      )}

      {/* Settings tab */}
      {innerTab === 'settings' && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 20,
        }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">iVentoy IP</label>
              <input className="form-input" value={settingsForm.iventoy_ip || ''} onChange={e => updateSetting('iventoy_ip', e.target.value)} placeholder="192.168.1.122" style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
            <div className="form-group">
              <label className="form-label">iVentoy Port</label>
              <input className="form-input" value={settingsForm.iventoy_port || ''} onChange={e => updateSetting('iventoy_port', e.target.value)} placeholder="26000" style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-check">
              <input type="checkbox" checked={autoProvision} onChange={e => updateSetting('auto_provision', e.target.checked ? '1' : '0')} />
              <span style={{ fontSize: 13 }}>Auto-Provision (registra automaticamente host al primo boot)</span>
            </label>
          </div>

          <div className="section-title" style={{ marginTop: 16 }}>Defaults per Nuovi PC</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Prefisso PC</label>
              <input className="form-input" value={settingsForm.pc_prefix || ''} onChange={e => updateSetting('pc_prefix', e.target.value)} placeholder="PC-DEPLOY-" />
            </div>
            <div className="form-group">
              <label className="form-label">Dominio Default</label>
              <input className="form-input" value={settingsForm.default_domain || ''} onChange={e => updateSetting('default_domain', e.target.value)} placeholder="corp.example.com" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">OU Default</label>
              <input className="form-input" value={settingsForm.default_ou || ''} onChange={e => updateSetting('default_ou', e.target.value)} placeholder="OU=PC,DC=corp,DC=polariscore,DC=it" />
            </div>
            <div className="form-group">
              <label className="form-label">DC IP</label>
              <input className="form-input" value={settingsForm.default_dc_ip || ''} onChange={e => updateSetting('default_dc_ip', e.target.value)} placeholder="192.168.1.199" style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Join User</label>
              <input className="form-input" value={settingsForm.default_join_user || ''} onChange={e => updateSetting('default_join_user', e.target.value)} placeholder="Administrator" />
            </div>
            <div className="form-group">
              <label className="form-label">Join Password</label>
              <input className="form-input" type="password" value={settingsForm.default_join_pass || ''} onChange={e => updateSetting('default_join_pass', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Admin Password Default</label>
              <input className="form-input" type="password" value={settingsForm.default_admin_pass || ''} onChange={e => updateSetting('default_admin_pass', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Workflow Default</label>
              <select className="form-select" value={settingsForm.default_workflow_id || ''} onChange={e => updateSetting('default_workflow_id', e.target.value)}>
                <option value="">-- Nessuno --</option>
                {workflows.map(wf => (
                  <option key={wf.id} value={wf.id}>{wf.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={handleSaveSettings} disabled={!settingsDirty}>Salva Impostazioni</button>
            <button className="btn" onClick={() => { setSettingsForm({ ...settings }); setSettingsDirty(false); }} disabled={!settingsDirty}>Annulla Modifiche</button>
          </div>
        </div>
      )}

      {/* Host Editor Modal */}
      {showHostEditor && (
        <Modal
          title={editingHost ? `Modifica Host: ${editingHost.mac}` : 'Nuovo Host PXE'}
          onClose={() => setShowHostEditor(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowHostEditor(false)}>Annulla</button>
              <button className="btn primary" onClick={handleSaveHost} disabled={!hostForm.mac.trim()}>
                {editingHost ? 'Salva' : 'Crea'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Indirizzo MAC</label>
            <input
              className="form-input"
              value={hostForm.mac}
              onChange={e => setHostForm(prev => ({ ...prev, mac: e.target.value }))}
              placeholder="AA:BB:CC:DD:EE:FF"
              disabled={!!editingHost}
              autoFocus={!editingHost}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Nome PC</label>
            <input
              className="form-input"
              value={hostForm.pc_name}
              onChange={e => setHostForm(prev => ({ ...prev, pc_name: e.target.value }))}
              placeholder="PC-DEPLOY-001"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Azione Boot</label>
            <select
              className="form-select"
              value={hostForm.boot_action}
              onChange={e => setHostForm(prev => ({ ...prev, boot_action: e.target.value }))}
            >
              {BOOT_ACTIONS.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Workflow</label>
            <select
              className="form-select"
              value={hostForm.workflow_id}
              onChange={e => setHostForm(prev => ({ ...prev, workflow_id: e.target.value }))}
            >
              <option value="">-- Nessuno --</option>
              {workflows.map(wf => (
                <option key={wf.id} value={wf.id}>{wf.nome}</option>
              ))}
            </select>
          </div>
        </Modal>
      )}
    </div>
  );
}
