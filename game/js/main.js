import { GameUI } from './ui.js';

async function main() {
  const root = document.getElementById('app');
  root.innerHTML = `<div class="panel" style="margin-top:40px;text-align:center">Loading rosters…</div>`;
  try {
    const res = await fetch('./data/players.json');
    if (!res.ok) throw new Error(`Failed to load players.json (${res.status})`);
    const data = await res.json();
    new GameUI(root, data);
  } catch (err) {
    root.innerHTML = `<div class="panel" style="margin-top:40px"><h2>Could not start</h2><p>${err.message}</p>
      <p class="hint">Open this folder via a local static server (ES modules need http).</p></div>`;
    console.error(err);
  }
}

main();
