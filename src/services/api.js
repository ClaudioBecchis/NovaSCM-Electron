/**
 * NovaSCM API Client
 * Communicates with NovaSCM Flask server (CT 103, 192.168.20.110:9091).
 */

import axios from 'axios';

let _baseUrl = '';
let _apiKey = '';

function configure(baseUrl, apiKey) {
  _baseUrl = baseUrl.replace(/\/+$/, '');
  _apiKey = apiKey || '';
}

function getBaseUrl() {
  return _baseUrl;
}

function getApiKey() {
  return _apiKey;
}

function createInstance() {
  const instance = axios.create({
    baseURL: _baseUrl,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  // Request interceptor — attach API key, log errors
  instance.interceptors.request.use(
    (config) => {
      if (_apiKey) {
        config.headers['X-Api-Key'] = _apiKey;
      }
      return config;
    },
    (error) => {
      console.error('[API] Request error:', error.message);
      return Promise.reject(error);
    }
  );

  // Response interceptor — log errors with details
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response) {
        console.error(
          `[API] ${error.response.status} ${error.config?.method?.toUpperCase()} ${error.config?.url}:`,
          error.response.data
        );
      } else if (error.request) {
        console.error('[API] No response received:', error.message);
      } else {
        console.error('[API] Error:', error.message);
      }
      return Promise.reject(error);
    }
  );

  return instance;
}

function api() {
  return createInstance();
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export { configure, getBaseUrl, getApiKey };

export const checkHealth = () => api().get('/health').then((r) => r.data);

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export const getVersion = () => api().get('/api/version').then((r) => r.data);

// ---------------------------------------------------------------------------
// Change Requests
// ---------------------------------------------------------------------------

export const getCrList = () => api().get('/api/cr').then((r) => r.data);
export const getCr = (id) => api().get(`/api/cr/${id}`).then((r) => r.data);
export const getCrByName = (name) => api().get(`/api/cr/by-name/${encodeURIComponent(name)}`).then((r) => r.data);
export const createCr = (data) => api().post('/api/cr', data).then((r) => r.data);
export const setCrStatus = (id, status) => api().put(`/api/cr/${id}/status`, { status }).then((r) => r.data);
export const deleteCr = (id) => api().delete(`/api/cr/${id}`).then((r) => r.data);
export const getCrSteps = (id) => api().get(`/api/cr/${id}/steps`).then((r) => r.data);
export const getCrXml = (name) => api().get(`/api/cr/by-name/${encodeURIComponent(name)}/autounattend.xml`, { responseType: 'text' }).then((r) => r.data);
export const postCrStep = (name, data) => api().post(`/api/cr/by-name/${encodeURIComponent(name)}/step`, data).then((r) => r.data);
export const crCheckin = (name, data) => api().post(`/api/cr/by-name/${encodeURIComponent(name)}/checkin`, data).then((r) => r.data);

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export const getWorkflows = () => api().get('/api/workflows').then((r) => r.data);
export const getWorkflow = (id) => api().get(`/api/workflows/${id}`).then((r) => r.data);
export const createWorkflow = (data) => api().post('/api/workflows', data).then((r) => r.data);
export const updateWorkflow = (id, data) => api().put(`/api/workflows/${id}`, data).then((r) => r.data);
export const deleteWorkflow = (id) => api().delete(`/api/workflows/${id}`).then((r) => r.data);
export const exportWorkflow = (id) => api().get(`/api/workflows/${id}/export`).then((r) => r.data);
export const importWorkflow = (data) => api().post('/api/workflows/import', data).then((r) => r.data);

// ---------------------------------------------------------------------------
// Workflow Steps
// ---------------------------------------------------------------------------

export const createStep = (wfId, data) => api().post(`/api/workflows/${wfId}/steps`, data).then((r) => r.data);
export const updateStep = (wfId, stepId, data) => api().put(`/api/workflows/${wfId}/steps/${stepId}`, data).then((r) => r.data);
export const deleteStep = (wfId, stepId) => api().delete(`/api/workflows/${wfId}/steps/${stepId}`).then((r) => r.data);
export const reorderSteps = (wfId, steps) => api().put(`/api/workflows/${wfId}/steps/reorder`, { steps }).then((r) => r.data);

// ---------------------------------------------------------------------------
// PC Workflows (Assignments)
// ---------------------------------------------------------------------------

export const getPcWorkflows = () => api().get('/api/pc-workflows').then((r) => r.data);
export const getPcWorkflowHistory = () => api().get('/api/pc-workflows/history').then((r) => r.data);
export const createPcWorkflow = (data) => api().post('/api/pc-workflows', data).then((r) => r.data);
export const getPcWorkflow = (id) => api().get(`/api/pc-workflows/${id}`).then((r) => r.data);
export const deletePcWorkflow = (id) => api().delete(`/api/pc-workflows/${id}`).then((r) => r.data);

// ---------------------------------------------------------------------------
// PXE
// ---------------------------------------------------------------------------

export const getPxeHosts = () => api().get('/api/pxe/hosts').then((r) => r.data);
export const getPxeHost = (mac) => api().get(`/api/pxe/hosts/${encodeURIComponent(mac)}`).then((r) => r.data);
export const createPxeHost = (data) => api().post('/api/pxe/hosts', data).then((r) => r.data);
export const updatePxeHost = (mac, data) => api().put(`/api/pxe/hosts/${encodeURIComponent(mac)}`, data).then((r) => r.data);
export const deletePxeHost = (mac) => api().delete(`/api/pxe/hosts/${encodeURIComponent(mac)}`).then((r) => r.data);
export const getPxeBootLog = () => api().get('/api/pxe/boot-log').then((r) => r.data);
export const getPxeSettings = () => api().get('/api/pxe/settings').then((r) => r.data);
export const updatePxeSettings = (data) => api().put('/api/pxe/settings', data).then((r) => r.data);
export const getPxeStatus = () => api().get('/api/pxe/status').then((r) => r.data);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const getSettings = () => api().get('/api/settings').then((r) => r.data);
export const updateSettings = (data) => api().put('/api/settings', data).then((r) => r.data);

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

export const downloadAgent = (os) => api().get(`/api/download/agent/${encodeURIComponent(os)}`, { responseType: 'blob' }).then((r) => r.data);
export const getEnrollmentToken = () => api().post('/api/enrollment-token').then((r) => r.data);

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

export const startDeploy = (data) => api().post('/api/deploy/start', data).then((r) => r.data);
export const deployEnroll = (token) => api().post('/api/deploy/enroll', { token }).then((r) => r.data);
export const deployStepStatus = (pwId, stepId, data) => api().put(`/api/deploy/${pwId}/steps/${stepId}/status`, data).then((r) => r.data);
export const deployHardware = (pwId, data) => api().post(`/api/deploy/${pwId}/hardware`, data).then((r) => r.data);
export const deployLog = (pwId, data) => api().post(`/api/deploy/${pwId}/log`, data).then((r) => r.data);

// ---------------------------------------------------------------------------
// Default export (object with all methods)
// ---------------------------------------------------------------------------

export default {
  configure,
  getBaseUrl,
  getApiKey,

  checkHealth,
  getVersion,

  getCrList, getCr, getCrByName, createCr, setCrStatus, deleteCr,
  getCrSteps, getCrXml, postCrStep, crCheckin,

  getWorkflows, getWorkflow, createWorkflow, updateWorkflow,
  deleteWorkflow, exportWorkflow, importWorkflow,

  createStep, updateStep, deleteStep, reorderSteps,

  getPcWorkflows, getPcWorkflowHistory, createPcWorkflow,
  getPcWorkflow, deletePcWorkflow,

  getPxeHosts, getPxeHost, createPxeHost, updatePxeHost, deletePxeHost,
  getPxeBootLog, getPxeSettings, updatePxeSettings, getPxeStatus,

  getSettings, updateSettings,

  downloadAgent, getEnrollmentToken,

  startDeploy, deployEnroll, deployStepStatus, deployHardware, deployLog,
};
