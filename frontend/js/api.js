const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000'
  : 'https://your-app.onrender.com';

const APP_VERSION = '2026-04-28-ws4';
if (sessionStorage.getItem('app_version') !== APP_VERSION) {
  sessionStorage.removeItem('session_id');
  sessionStorage.setItem('app_version', APP_VERSION);
}

async function apiFetch(path, options = {}) {
  const token = sessionStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE_URL + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    sessionStorage.clear();
    window.location.href = '/index.html';
    return;
  }
  if (!res.ok) throw new Error(data.error || data.detail || 'HTTP ' + res.status);
  return data.ok !== undefined ? data.data : data;
}

/* ── Recipes ────────────────────────────────────────────────────────────── */
function getRecipes()            { return apiFetch('/api/recipes'); }
function getRecipe(id)           { return apiFetch(`/api/recipes/${id}`); }
function createRecipe(data)      { return apiFetch('/api/recipes', { method: 'POST', body: JSON.stringify(data) }); }
function updateRecipe(id, data)  { return apiFetch(`/api/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
function updateSteps(id, steps)  { return apiFetch(`/api/recipes/${id}/steps`, { method: 'PUT', body: JSON.stringify({ steps }) }); }
function deleteRecipe(id)        { return apiFetch(`/api/recipes/${id}`, { method: 'DELETE' }); }

/* ── Sessions ───────────────────────────────────────────────────────────── */
function createSession(data)     { return apiFetch('/api/sessions', { method: 'POST', body: JSON.stringify(data) }); }
function selectRecipe(recipe_id) { return createSession({ recipe_id, esp_id: 'ESP32_BAR_01' }); }
function getCurrentSession()     { return apiFetch('/api/sessions/current'); }
function discardSession()        { return apiFetch('/api/sessions/current/discard', { method: 'POST' }); }
function completeSession(id)     { return apiFetch(`/api/sessions/${id}/complete`, { method: 'POST' }); }

/* ── History ────────────────────────────────────────────────────────────── */
function getMyHistory(page = 1, limit = 20) {
  return apiFetch(`/api/history/me?page=${page}&limit=${limit}`);
}
function getAllHistory(page = 1, limit = 20, user_id = '') {
  const q = user_id ? `&user_id=${user_id}` : '';
  return apiFetch(`/api/history/all?page=${page}&limit=${limit}${q}`);
}

/* ── Users ──────────────────────────────────────────────────────────────── */
function getUsers()              { return apiFetch('/api/users'); }
function createUser(data)        { return apiFetch('/api/users', { method: 'POST', body: JSON.stringify(data) }); }
function updateUser(id, data)    { return apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
function deleteUser(id)          { return apiFetch(`/api/users/${id}`, { method: 'DELETE' }); }
