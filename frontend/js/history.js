(async function () {
  const user = requireAuth();
  if (!user) return;

  document.getElementById('user-name').textContent = user.name;

  const titleEl  = document.getElementById('history-title');
  const tbody    = document.getElementById('history-body');
  const pagDiv   = document.getElementById('pagination');
  const workerCol = document.getElementById('worker-col');
  const banner   = document.getElementById('status-banner');

  if (user.role === 'admin') {
    titleEl.textContent = 'All Brew History';
  } else {
    titleEl.textContent = 'My Brew History';
    workerCol.style.display = 'none';
  }

  let currentPage = 1;
  const limit = 20;

  async function loadPage(page) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-cell"><div class="spinner"></div></td></tr>';
    try {
      const data = await API.get(`/api/history?page=${page}&limit=${limit}`);
      renderRows(data.items);
      renderPagination(data.total, page, limit);
      currentPage = page;
    } catch (err) {
      banner.textContent = 'Failed to load history.';
      banner.className = 'status-banner status-error';
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Error loading data.</td></tr>';
    }
  }

  function renderRows(items) {
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No history yet.</td></tr>';
      return;
    }
    tbody.innerHTML = items.map(item => `
      <tr>
        <td>${formatDate(item.started_at)}</td>
        <td>${item.recipe_name}</td>
        <td>${item.worker_name}</td>
        <td>${formatDuration(item.started_at, item.completed_at)}</td>
        <td>${item.cooked_by_admin ? '✓' : ''}</td>
      </tr>
    `).join('');
  }

  function renderPagination(total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) { pagDiv.innerHTML = ''; return; }
    pagDiv.innerHTML = `
      <button class="btn btn-ghost" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">← Prev</button>
      <span>Page ${page} of ${totalPages}</span>
      <button class="btn btn-ghost" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">Next →</button>
    `;
    pagDiv.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => loadPage(parseInt(btn.dataset.page)));
    });
  }

  loadPage(1);
})();
