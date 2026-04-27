const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000'
  : 'https://your-app.onrender.com';

const API = {
  baseUrl: BASE_URL,

  token() {
    return sessionStorage.getItem('token');
  },

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.token();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(this.baseUrl + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      sessionStorage.clear();
      location.href = 'index.html';
      return;
    }

    if (res.status === 204) return null;

    const data = await res.json();
    if (!res.ok) throw data;
    return data;
  },

  get(path)         { return this.request('GET',    path); },
  post(path, body)  { return this.request('POST',   path, body); },
  put(path, body)   { return this.request('PUT',    path, body); },
  patch(path, body) { return this.request('PATCH',  path, body); },
  delete(path)      { return this.request('DELETE', path); },
};

function logout() {
  sessionStorage.clear();
  location.href = 'index.html';
}

function requireAuth() {
  const token = sessionStorage.getItem('token');
  if (!token) {
    location.href = 'index.html';
    return null;
  }
  return JSON.parse(sessionStorage.getItem('user') || 'null');
}

function requireAdmin() {
  const user = requireAuth();
  if (user && user.role !== 'admin') {
    location.href = 'select.html';
    return null;
  }
  return user;
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return '—';
  const secs = Math.round((new Date(completedAt) - new Date(startedAt)) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}
