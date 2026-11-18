document.addEventListener('DOMContentLoaded', () => {
  const ph = document.querySelector('#ph');
  const phOutput = document.querySelector('#ph-output');
  if (ph && phOutput) ph.addEventListener('input', () => phOutput.textContent = Number(ph.value).toFixed(1));

  const summary = { soil: '#soil', season: '#season', rainfall: '#rainfall', temp: '#temp', water: '#water' };
  const refreshProfile = () => Object.entries(summary).forEach(([key, selector]) => {
    const input = document.querySelector(selector), output = document.querySelector(`#summary-${key}`);
    if (!input || !output) return;
    const value = input.tagName === 'SELECT' ? input.options[input.selectedIndex].text : input.value;
    output.textContent = value ? (key === 'rainfall' ? `${value} mm` : key === 'temp' ? `${value} °C` : value) : 'Not set';
  });
  Object.values(summary).forEach(selector => document.querySelector(selector)?.addEventListener('input', refreshProfile));
  refreshProfile();

  const locationButton = document.querySelector('#location-autofill');
  const locationStatus = document.querySelector('#location-status');
  const setStatus = (message, type = '') => {
    if (!locationStatus) return;
    locationStatus.textContent = message;
    locationStatus.className = `location-status ${type}`;
  };
  const applyValues = (values) => {
    Object.entries(values).forEach(([name, value]) => {
      if (value === null || value === undefined || name === 'forecast_rainfall') return;
      const element = document.querySelector(`[name="${name}"]`);
      if (!element) return;
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    refreshProfile();
  };
  const applyLocation = (location) => {
    const form = document.querySelector('#analysis-form');
    if (!form) return;
    [['state', location?.state], ['district', location?.district], ['district_key', location?.district_key]].forEach(([name, value]) => {
      let field = form.querySelector(`input[name="${name}"]`);
      if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        form.appendChild(field);
      }
      field.value = value || '';
    });
  };
  if (locationButton) locationButton.addEventListener('click', () => {
    if (!navigator.geolocation) return setStatus('Location is not supported by this browser. Please enter field values manually.', 'error');
    locationButton.disabled = true;
    setStatus('Waiting for your browser’s location permission…');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        setStatus('Finding local field conditions…');
        const response = await fetch(`${window.FARMMIND_API_BASE}/api/location-profile`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: coords.latitude, lon: coords.longitude }),
        });
        const profile = await response.json();
        if (!response.ok) throw new Error(profile.error || 'Location lookup failed.');
        applyValues(profile.values || {});
        applyLocation(profile.location || {});
        const place = profile.location?.label || 'your area';
        const sourceText = (profile.sources || []).join(' · ');
        const noteText = (profile.notices || []).join(' ');
        setStatus(`Updated for ${place}. ${sourceText}${noteText ? ` — ${noteText}` : ''}`, 'success');
      } catch (error) {
        const message = error instanceof TypeError
          ? 'The local FarmMind server is not reachable. Keep the app running, then refresh this page and try again.'
          : (error.message || 'Location lookup failed. Please enter values manually.');
        setStatus(message, 'error');
      } finally { locationButton.disabled = false; }
    }, (error) => {
      locationButton.disabled = false;
      setStatus(error.code === 1 ? 'Location permission was not granted. You can continue by entering values manually.' : 'We could not read your location. Please try again or enter values manually.', 'error');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });
});
