document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#analysis-form');
  if (!form) return;
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const original = button?.textContent;
    if (button) { button.disabled = true; button.textContent = 'Building your crop plan…'; }
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      const response = await fetch(`${window.FARMMIND_API_BASE}/api/analyze`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Field analysis failed. Please try again.');
      sessionStorage.setItem('farmmind:last-analysis', JSON.stringify(result));
      window.location.href = './results.html';
    } catch (error) {
      const status = document.querySelector('#location-status');
      if (status) { status.textContent = error.message || 'Could not reach FarmMind. Please try again.'; status.className = 'location-status error'; }
      if (button) { button.disabled = false; button.textContent = original || 'Find my best crops →'; }
    }
  });
});
