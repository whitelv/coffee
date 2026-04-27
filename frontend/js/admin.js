(function () {
  const user = requireAdmin();
  if (!user) return;

  document.getElementById('user-name').textContent = user.name;

  // ---------------------------------------------------------------------------
  // Tab switching
  // ---------------------------------------------------------------------------
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
    });
  });

  // ===========================================================================
  // USERS TAB
  // ===========================================================================
  const usersBody   = document.getElementById('users-body');
  const addUserBtn  = document.getElementById('add-user-btn');
  const addUserForm = document.getElementById('add-user-form');
  const saveUserBtn = document.getElementById('save-user-btn');
  const cancelUserBtn = document.getElementById('cancel-user-btn');
  const userFormError = document.getElementById('user-form-error');

  async function loadUsers() {
    usersBody.innerHTML = '<tr><td colspan="4" class="loading-cell"><div class="spinner"></div></td></tr>';
    try {
      const users = await API.get('/api/users');
      usersBody.innerHTML = users.map(u => `
        <tr>
          <td>${u.name}</td>
          <td><span class="badge badge-${u.role}">${u.role}</span></td>
          <td>${formatDate(u.created_at)}</td>
          <td><button class="btn btn-ghost btn-sm btn-danger" data-id="${u._id}">Delete</button></td>
        </tr>
      `).join('') || '<tr><td colspan="4" class="empty-state">No users.</td></tr>';

      usersBody.querySelectorAll('[data-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this user?')) return;
          await API.delete(`/api/users/${btn.dataset.id}`);
          loadUsers();
        });
      });
    } catch {
      usersBody.innerHTML = '<tr><td colspan="4" class="empty-state">Error loading users.</td></tr>';
    }
  }

  addUserBtn.addEventListener('click', () => {
    addUserForm.classList.toggle('hidden');
  });
  cancelUserBtn.addEventListener('click', () => {
    addUserForm.classList.add('hidden');
    userFormError.classList.add('hidden');
  });
  saveUserBtn.addEventListener('click', async () => {
    const name  = document.getElementById('new-user-name').value.trim();
    const rfid  = document.getElementById('new-user-rfid').value.trim();
    const role  = document.getElementById('new-user-role').value;
    if (!name || !rfid) {
      userFormError.textContent = 'Name and RFID UID are required.';
      userFormError.classList.remove('hidden');
      return;
    }
    try {
      await API.post('/api/users', { name, rfid_uid: rfid, role });
      addUserForm.classList.add('hidden');
      userFormError.classList.add('hidden');
      document.getElementById('new-user-name').value = '';
      document.getElementById('new-user-rfid').value = '';
      loadUsers();
    } catch (err) {
      userFormError.textContent = err.detail || 'Failed to create user.';
      userFormError.classList.remove('hidden');
    }
  });

  loadUsers();

  // ===========================================================================
  // RECIPES TAB
  // ===========================================================================
  const recipesListEl  = document.getElementById('recipes-list-admin');
  const recipeForm     = document.getElementById('recipe-form');
  const recipeFormTitle = document.getElementById('recipe-form-title');
  const addRecipeBtn   = document.getElementById('add-recipe-btn');
  const saveRecipeBtn  = document.getElementById('save-recipe-btn');
  const cancelRecipeBtn = document.getElementById('cancel-recipe-btn');
  const addStepBtn     = document.getElementById('add-step-btn');
  const stepsList      = document.getElementById('steps-list');
  const recipeFormError = document.getElementById('recipe-form-error');

  let editingRecipeId = null;

  async function loadRecipes() {
    recipesListEl.innerHTML = '<div class="spinner"></div>';
    try {
      // Admin sees all including inactive — use a direct call
      const res = await fetch('/api/recipes?include_inactive=1', {
        headers: { 'Authorization': `Bearer ${API.token()}` },
      });
      const recipes = await res.json();
      renderRecipeList(Array.isArray(recipes) ? recipes : []);
    } catch {
      recipesListEl.innerHTML = '<p class="empty-state">Error loading recipes.</p>';
    }
  }

  function renderRecipeList(recipes) {
    if (!recipes.length) {
      recipesListEl.innerHTML = '<p class="empty-state">No recipes yet.</p>';
      return;
    }
    recipesListEl.innerHTML = recipes.map(r => `
      <div class="card recipe-admin-card ${r.active ? '' : 'inactive'}">
        <div class="recipe-admin-header">
          <strong>${r.name}</strong>
          <span class="badge badge-${r.active ? 'active' : 'inactive'}">${r.active ? 'Active' : 'Inactive'}</span>
        </div>
        <p>${r.description}</p>
        <div class="recipe-admin-actions">
          <button class="btn btn-ghost btn-sm" data-edit="${r._id}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-toggle="${r._id}" data-active="${r.active}">
            ${r.active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    `).join('');

    recipesListEl.querySelectorAll('[data-edit]').forEach(btn => {
      const recipe = recipes.find(r => r._id === btn.dataset.edit);
      btn.addEventListener('click', () => openEditRecipe(recipe));
    });

    recipesListEl.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const active = btn.dataset.active === 'true';
        await API.put(`/api/recipes/${btn.dataset.toggle}`, { active: !active });
        loadRecipes();
      });
    });
  }

  addRecipeBtn.addEventListener('click', () => {
    editingRecipeId = null;
    recipeFormTitle.textContent = 'New Recipe';
    document.getElementById('recipe-id').value = '';
    document.getElementById('recipe-name').value = '';
    document.getElementById('recipe-desc').value = '';
    document.getElementById('recipe-active').checked = true;
    stepsList.innerHTML = '';
    recipeForm.classList.toggle('hidden');
  });

  cancelRecipeBtn.addEventListener('click', () => {
    recipeForm.classList.add('hidden');
    recipeFormError.classList.add('hidden');
  });

  function openEditRecipe(recipe) {
    editingRecipeId = recipe._id;
    recipeFormTitle.textContent = 'Edit Recipe';
    document.getElementById('recipe-id').value = recipe._id;
    document.getElementById('recipe-name').value = recipe.name;
    document.getElementById('recipe-desc').value = recipe.description;
    document.getElementById('recipe-active').checked = recipe.active;
    stepsList.innerHTML = '';
    (recipe.steps || []).forEach(s => addStepRow(s));
    recipeForm.classList.remove('hidden');
    recipeForm.scrollIntoView({ behavior: 'smooth' });
  }

  addStepBtn.addEventListener('click', () => addStepRow());

  function addStepRow(step = {}) {
    const idx = stepsList.children.length;
    const div = document.createElement('div');
    div.className = 'step-row';
    div.innerHTML = `
      <div class="step-row-header">
        <span class="step-num">Step ${idx + 1}</span>
        <button class="btn btn-ghost btn-sm btn-danger remove-step">✕</button>
      </div>
      <label>Type
        <select class="step-type">
          <option value="instruction" ${step.type === 'instruction' ? 'selected' : ''}>Instruction</option>
          <option value="weight"      ${step.type === 'weight'      ? 'selected' : ''}>Weight</option>
          <option value="timer"       ${step.type === 'timer'       ? 'selected' : ''}>Timer</option>
        </select>
      </label>
      <label>Label<input type="text" class="step-label-input" value="${step.label || ''}"></label>
      <div class="step-weight-fields" style="display:${step.type === 'weight' ? 'block' : 'none'}">
        <label>Target (g)<input type="number" class="step-target" value="${step.target_value ?? ''}"></label>
        <label>Tolerance (g)<input type="number" class="step-tolerance" value="${step.tolerance ?? ''}"></label>
      </div>
      <div class="step-timer-fields" style="display:${step.type === 'timer' ? 'block' : 'none'}">
        <label>Duration (s)<input type="number" class="step-duration" value="${step.target_value ?? ''}"></label>
      </div>
      <div class="step-instruction-fields" style="display:${step.type === 'instruction' ? 'block' : 'none'}">
        <label>Instruction Text<textarea class="step-instruction-text" rows="2">${step.instruction_text || ''}</textarea></label>
      </div>
    `;
    div.querySelector('.step-type').addEventListener('change', (e) => {
      div.querySelector('.step-weight-fields').style.display = e.target.value === 'weight' ? 'block' : 'none';
      div.querySelector('.step-timer-fields').style.display  = e.target.value === 'timer'  ? 'block' : 'none';
      div.querySelector('.step-instruction-fields').style.display = e.target.value === 'instruction' ? 'block' : 'none';
    });
    div.querySelector('.remove-step').addEventListener('click', () => {
      div.remove();
      renumberSteps();
    });
    stepsList.appendChild(div);
  }

  function renumberSteps() {
    stepsList.querySelectorAll('.step-num').forEach((el, i) => {
      el.textContent = `Step ${i + 1}`;
    });
  }

  saveRecipeBtn.addEventListener('click', async () => {
    const name = document.getElementById('recipe-name').value.trim();
    const desc = document.getElementById('recipe-desc').value.trim();
    const active = document.getElementById('recipe-active').checked;

    const steps = [];
    let valid = true;
    stepsList.querySelectorAll('.step-row').forEach((row, i) => {
      const type   = row.querySelector('.step-type').value;
      const label  = row.querySelector('.step-label-input').value.trim();
      const s = { order: i, type, label };
      if (type === 'weight') {
        s.target_value = parseFloat(row.querySelector('.step-target').value);
        s.tolerance    = parseFloat(row.querySelector('.step-tolerance').value);
        if (isNaN(s.target_value) || isNaN(s.tolerance)) valid = false;
      } else if (type === 'timer') {
        s.target_value = parseFloat(row.querySelector('.step-duration').value);
        if (isNaN(s.target_value)) valid = false;
      } else {
        s.instruction_text = row.querySelector('.step-instruction-text').value.trim();
      }
      if (!label) valid = false;
      steps.push(s);
    });

    if (!name || !valid || !steps.length) {
      recipeFormError.textContent = 'Please fill all required fields.';
      recipeFormError.classList.remove('hidden');
      return;
    }

    try {
      if (editingRecipeId) {
        await API.put(`/api/recipes/${editingRecipeId}`, { name, description: desc, active, steps });
      } else {
        await API.post('/api/recipes', { name, description: desc, active, steps });
      }
      recipeForm.classList.add('hidden');
      recipeFormError.classList.add('hidden');
      loadRecipes();
    } catch (err) {
      recipeFormError.textContent = err.detail || 'Failed to save recipe.';
      recipeFormError.classList.remove('hidden');
    }
  });

  loadRecipes();
})();
