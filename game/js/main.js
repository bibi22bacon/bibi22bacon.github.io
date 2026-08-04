import { GameUI } from './ui.js';

async function main() {
  const root = document.getElementById('app');
  root.innerHTML = `<div class="panel" style="margin-top:40px;text-align:center">Loading rosters…</div>`;
  try {
    const [playersRes, teamsRes] = await Promise.all([
      fetch('./data/players.json'),
      fetch('./data/team_rosters.json'),
    ]);
    if (!playersRes.ok) throw new Error(`Failed to load players.json (${playersRes.status})`);
    const data = await playersRes.json();
    if (teamsRes.ok) {
      const teams = await teamsRes.json();
      data.teamRosters = teams.teams || [];
    } else {
      data.teamRosters = [];
      console.warn('team_rosters.json missing; team defaults disabled');
    }
    new GameUI(root, data);
  } catch (err) {
    root.innerHTML = `<div class="panel" style="margin-top:40px"><h2>Could not start</h2><p>${err.message}</p>
      <p class="hint">Open this folder via a local static server (ES modules need http).</p></div>`;
    console.error(err);
  }
}

main();
