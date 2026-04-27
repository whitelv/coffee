(function () {
  const user = requireAuth();
  if (!user) return;

  document.getElementById('user-name').textContent = user.name;

  const sessionId = sessionStorage.getItem('session_id');
  if (!sessionId) { location.href = 'select.html'; return; }

  const espId = sessionStorage.getItem('esp_id') || 'ESP32_BAR_01';
  const token = sessionStorage.getItem('token');
  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : 'https://your-app.onrender.com';

  // DOM refs
  const loadingEl  = document.getElementById('loading');
  const brewUI     = document.getElementById('brew-ui');
  const completeEl = document.getElementById('complete-screen');
  const abandonEl  = document.getElementById('abandoned-screen');
  const espBanner  = document.getElementById('esp-banner');
  const stepProgress = document.getElementById('step-progress');

  const weightUI      = document.getElementById('weight-ui');
  const timerUI       = document.getElementById('timer-ui');
  const instructionUI = document.getElementById('instruction-ui');
  const nextBtn       = document.getElementById('next-btn');
  const stepLabel     = document.getElementById('step-label');
  const stepTypeIcon  = document.getElementById('step-type-icon');

  const weightValueEl  = document.getElementById('weight-value');
  const weightTargetEl = document.getElementById('weight-target');
  const stableBadge    = document.getElementById('weight-stable-badge');
  const gaugeFill      = document.getElementById('gauge-fill');

  const timerValueEl = document.getElementById('timer-value');
  const timerBar     = document.getElementById('timer-bar');

  const instructionText = document.getElementById('instruction-text');

  let recipe = null;
  let currentStep = 0;
  let timerInterval = null;
  let heartbeatInterval = null;
  let wsClient = null;

  // ---------------------------------------------------------------------------
  // WebSocket connection
  // ---------------------------------------------------------------------------
  const wsBase = API_BASE.replace(/^http/, 'ws');
  const wsUrl = `${wsBase}/ws/browser/${sessionId}`;

  wsClient = new CoffeeWebSocket(wsUrl, {
    onOpen() {
      loadingEl.classList.add('hidden');
      brewUI.classList.remove('hidden');
    },
    onMessage: handleMessage,
    onClose() {
      // Reconnection handled by CoffeeWebSocket
    },
  });

  // ---------------------------------------------------------------------------
  // Message handler
  // ---------------------------------------------------------------------------
  function handleMessage(msg) {
    switch (msg.event) {
      case 'session_state':
        recipe = msg.recipe;
        currentStep = msg.current_step || 0;
        renderStep(currentStep);
        break;
      case 'weight_update':
        updateWeightDisplay(msg.value, false);
        break;
      case 'weight_stable':
        updateWeightDisplay(msg.value, true);
        break;
      case 'step_advance':
        currentStep = msg.step_index;
        recipe.steps[currentStep] = msg.step;
        renderStep(currentStep);
        break;
      case 'session_complete':
        showComplete();
        break;
      case 'session_abandoned':
        showAbandoned();
        break;
      case 'esp_disconnected':
        espBanner.classList.remove('hidden');
        break;
      case 'esp_reconnected':
        espBanner.classList.add('hidden');
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Step rendering
  // ---------------------------------------------------------------------------
  function renderStep(index) {
    if (!recipe || !recipe.steps) return;
    const steps = recipe.steps;

    // Progress bar
    stepProgress.innerHTML = steps
      .map((s, i) => `<div class="progress-dot ${i < index ? 'done' : i === index ? 'active' : ''}"></div>`)
      .join('');

    const step = steps[index];
    stepLabel.textContent = step.label;

    // Hide all step UIs
    weightUI.classList.add('hidden');
    timerUI.classList.add('hidden');
    instructionUI.classList.add('hidden');
    nextBtn.classList.add('hidden');
    stableBadge.classList.add('hidden');
    clearTimerInterval();

    if (step.type === 'weight') {
      stepTypeIcon.textContent = '⚖️';
      weightUI.classList.remove('hidden');
      weightTargetEl.textContent = step.target_value;
      weightValueEl.textContent = '0.0';
      resetGauge();
      // Tell backend to start streaming
      wsClient.send('start_weight', { target: step.target_value });
    } else if (step.type === 'timer') {
      stepTypeIcon.textContent = '⏱️';
      timerUI.classList.remove('hidden');
      startTimer(step.target_value);
    } else if (step.type === 'instruction') {
      stepTypeIcon.textContent = '📋';
      instructionUI.classList.remove('hidden');
      instructionText.textContent = step.instruction_text || '';
      nextBtn.classList.remove('hidden');
    }
  }

  // ---------------------------------------------------------------------------
  // Weight display
  // ---------------------------------------------------------------------------
  function updateWeightDisplay(value, stable) {
    if (!recipe) return;
    const step = recipe.steps[currentStep];
    weightValueEl.textContent = value.toFixed(1);

    const target = step.target_value || 1;
    const pct = Math.min(value / target, 1);
    const circumference = 314;
    gaugeFill.style.strokeDashoffset = circumference - pct * circumference;

    if (stable) {
      stableBadge.classList.remove('hidden');
      nextBtn.classList.remove('hidden');
    }
  }

  function resetGauge() {
    gaugeFill.style.strokeDashoffset = '314';
  }

  // ---------------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------------
  function startTimer(totalSeconds) {
    let remaining = totalSeconds;
    timerBar.style.width = '100%';

    function tick() {
      const m = Math.floor(remaining / 60).toString().padStart(2, '0');
      const s = Math.floor(remaining % 60).toString().padStart(2, '0');
      timerValueEl.textContent = `${m}:${s}`;
      timerBar.style.width = `${(remaining / totalSeconds) * 100}%`;
      if (remaining <= 0) {
        clearTimerInterval();
        wsClient.send('next_step');
      }
      remaining -= 0.1;
    }

    tick();
    timerInterval = setInterval(tick, 100);
  }

  function clearTimerInterval() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  // ---------------------------------------------------------------------------
  // Next step button
  // ---------------------------------------------------------------------------
  nextBtn.addEventListener('click', () => {
    nextBtn.disabled = true;
    wsClient.send('next_step');
    setTimeout(() => { nextBtn.disabled = false; }, 500);
  });

  // ---------------------------------------------------------------------------
  // Completion / abandonment
  // ---------------------------------------------------------------------------
  function showComplete() {
    brewUI.classList.add('hidden');
    completeEl.classList.remove('hidden');
    clearAll();
    setTimeout(() => { location.href = 'history.html'; }, 3000);
  }

  function showAbandoned() {
    brewUI.classList.add('hidden');
    abandonEl.classList.remove('hidden');
    clearAll();
  }

  function clearAll() {
    clearTimerInterval();
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (wsClient) wsClient.close();
  }

  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------
  heartbeatInterval = setInterval(async () => {
    try {
      await fetch(`${API_BASE}/api/sessions/current/heartbeat`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` },
      });
    } catch (_) {}
  }, 20000);

  // ---------------------------------------------------------------------------
  // Page unload beacon
  // ---------------------------------------------------------------------------
  window.addEventListener('beforeunload', () => {
    navigator.sendBeacon(
      `${API_BASE}/api/sessions/current/ping-close`,
    );
  });
})();
