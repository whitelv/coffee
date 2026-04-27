(async function () {
  const user = requireAuth();
  if (!user) return;

  document.getElementById('user-name').textContent = user.name;

  const grid = document.getElementById('recipes-grid');
  const banner = document.getElementById('status-banner');
  const espId = sessionStorage.getItem('esp_id') || 'ESP32_BAR_01';

  function showError(msg) {
    banner.textContent = msg;
    banner.className = 'status-banner status-error';
  }

  // Check resume availability
  if (sessionStorage.getItem('resume_available') === '1') {
    banner.textContent = 'A previous session was found. Select a recipe to start a new one.';
    banner.className = 'status-banner status-info';
    sessionStorage.removeItem('resume_available');
  }

  let recipes;
  try {
    recipes = await API.get('/api/recipes');
  } catch (err) {
    grid.innerHTML = '';
    showError('Failed to load recipes.');
    return;
  }

  grid.innerHTML = '';
  if (!recipes.length) {
    grid.innerHTML = '<p class="empty-state">No recipes available.</p>';
    return;
  }

  recipes.forEach(recipe => {
    const card = document.createElement('div');
    card.className = 'card recipe-card';
    const stepCount = recipe.steps ? recipe.steps.length : 0;
    card.innerHTML = `
      <h3>${recipe.name}</h3>
      <p>${recipe.description}</p>
      <span class="step-count">${stepCount} steps</span>
    `;
    card.addEventListener('click', () => selectRecipe(recipe));
    grid.appendChild(card);
  });

  async function selectRecipe(recipe) {
    grid.querySelectorAll('.recipe-card').forEach(c => c.classList.remove('selected'));
    event.currentTarget.classList.add('selected');

    try {
      const result = await API.post('/api/sessions', {
        recipe_id: recipe._id,
        esp_id: espId,
      });
      sessionStorage.setItem('session_id', result.session_id);
      location.href = 'brew.html';
    } catch (err) {
      showError(err.detail || 'Failed to start session. Is the hardware connected?');
    }
  }
})();
