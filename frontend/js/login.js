(function () {
  const params = new URLSearchParams(location.search);
  const espId = params.get('esp_id') || 'ESP32_BAR_01';
  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : 'https://your-app.onrender.com';

  const msgEl = document.getElementById('login-message');
  const banner = document.getElementById('status-banner');

  function setBanner(text, type) {
    banner.textContent = text;
    banner.className = `status-banner status-${type}`;
  }

  function hideBanner() {
    banner.className = 'status-banner hidden';
  }

  let pollInterval = null;

  async function poll() {
    try {
      const res = await fetch(`${API_BASE}/auth/status?esp_id=${encodeURIComponent(espId)}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.status === 'esp_offline') {
        setBanner('Hardware unit is offline. Please check the ESP32.', 'warning');
        msgEl.textContent = 'Waiting for hardware…';
        return;
      }

      hideBanner();

      if (data.status === 'waiting') {
        msgEl.textContent = 'Please scan your RFID card';
        return;
      }

      if (data.status === 'authenticated') {
        clearInterval(pollInterval);
        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('user', JSON.stringify(data.user));
        sessionStorage.setItem('esp_id', espId);

        if (data.resume_available) {
          sessionStorage.setItem('resume_available', '1');
        }

        msgEl.textContent = `Welcome, ${data.user.name}!`;
        setTimeout(() => { location.href = 'select.html'; }, 600);
      }
    } catch (err) {
      setBanner('Connection error. Retrying…', 'error');
    }
  }

  // If already authenticated, skip login
  if (sessionStorage.getItem('token')) {
    location.href = 'select.html';
    return;
  }

  poll();
  pollInterval = setInterval(poll, 1000);
})();
