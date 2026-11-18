document.addEventListener('DOMContentLoaded', () => {
  const dashboard = document.querySelector('.results-dashboard');
  if (!dashboard) return;

  const tabs = [...dashboard.querySelectorAll('[data-dashboard-tab]')];
  const panels = [...dashboard.querySelectorAll('[data-dashboard-panel]')];
  const showPanel = (name) => {
    tabs.forEach((tab) => {
      const active = tab.dataset.dashboardTab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    panels.forEach((panel) => {
      const active = panel.dataset.dashboardPanel === name;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
  };
  tabs.forEach((tab) => tab.addEventListener('click', () => showPanel(tab.dataset.dashboardTab)));

  const dataNode = document.querySelector('#results-dashboard-data');
  const output = dashboard.querySelector('.whatif-result');
  const buttons = [...dashboard.querySelectorAll('[data-whatif]')];
  if (!dataNode || !output || !buttons.length) return;

  let data;
  try { data = JSON.parse(dataNode.textContent); } catch (_) {
    output.textContent = 'Scenario data could not be loaded. Please refresh the analysis.';
    return;
  }
  const safe = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
  const render = (payload) => {
    const rows = (payload.results || []).map((item) => {
      const crop = item.crop?.name || 'Crop';
      const kind = item.delta > 0 ? 'gain' : item.delta < 0 ? 'loss' : 'steady';
      const delta = `${item.delta > 0 ? '+' : ''}${item.delta}%`;
      return `<tr><td><span class="whatif-rank">${item.rank}</span> ${safe(crop)}</td><td>${item.old_pct}%</td><td><b>${item.new_pct}%</b></td><td class="whatif-${kind}">${delta}</td></tr>`;
    }).join('');
    const mover = payload.top_mover;
    output.innerHTML = `<p class="whatif-caption"><b>${safe(payload.scenario)}</b>${mover ? ` · Biggest change: ${safe(mover.crop?.name)} (${mover.delta > 0 ? '+' : ''}${mover.delta}%)` : ''}</p><div class="whatif-table-wrap"><table><thead><tr><th>Crop</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    document.dispatchEvent(new CustomEvent('farmmind:whatif-result', { detail: payload }));
  };
  buttons.forEach((button) => button.addEventListener('click', async () => {
    if (button.disabled) return;
    buttons.forEach((item) => item.classList.toggle('is-active', item === button));
    button.disabled = true;
    output.innerHTML = '<p>Calculating this field scenario…</p>';
    try {
      const response = await fetch('/whatif', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: button.dataset.whatif, inp: data.inp, orig_ranked: data.ranked }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Scenario could not be calculated.');
      render(payload);
    } catch (error) {
      output.innerHTML = `<p class="whatif-error">${safe(error.message || 'Scenario could not be calculated. Try again.')}</p>`;
    } finally { button.disabled = false; }
  }));
});
