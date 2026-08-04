/**
 * Headless smoke test: play + simulate vs AI opponents.
 */
import { readFileSync } from 'fs';
import { GameEngine } from './engine.js';
import { simulateGame, simulateMany } from './sim.js';
import { validateDraft, emptyDraft, toPreset } from './roster.js';

const data = JSON.parse(readFileSync(new URL('../data/players.json', import.meta.url), 'utf8'));

function playGame(presets, tacticFn, label) {
  const eng = new GameEngine(data, presets, { silent: true });
  let steps = 0;
  const maxSteps = 8000;
  while (eng.state.phase !== 'gameover' && steps < maxSteps) {
    steps++;
    tacticFn(eng);
    eng.resolvePA();
  }
  if (eng.state.phase !== 'gameover') throw new Error(`${label}: incomplete`);
  return { label, steps, score: `${eng.state.away.score}-${eng.state.home.score}`, winner: eng.state.winner };
}

const none = (eng) => {
  eng.setDefTactic(null);
  eng.setOffTactic(null);
};

const byId = Object.fromEntries([
  ...data.batters.map((b) => [b.id, { ...b, type: 'batter' }]),
  ...data.pitchers.map((p) => [p.id, { ...p, type: 'pitcher' }]),
]);

// Build a cheap legal user roster for tests
const draft = emptyDraft('Test', 'TST');
const cheapC = data.batters.find((b) => b.positions.includes('C') && b.salary <= 25);
const cheap1 = data.batters.find((b) => b.positions.includes('1B') && b.salary <= 25 && b.id !== cheapC.id);
const cheap2 = data.batters.find((b) => b.positions.includes('2B') && b.salary <= 25);
const cheap3 = data.batters.find((b) => b.positions.includes('3B') && b.salary <= 25);
const cheapSS = data.batters.find((b) => b.positions.includes('SS') && b.salary <= 25);
const ofs = data.batters.filter((b) => b.positions.includes('OF') && b.salary <= 25).slice(0, 3);
const usedIds = new Set([cheapC.id, cheap1.id, cheap2.id, cheap3.id, cheapSS.id, ...ofs.map((x) => x.id)]);
const dh = data.batters.find((b) => b.salary <= 25 && !usedIds.has(b.id));
const line = [
  { pos: 'C', playerId: cheapC.id },
  { pos: '1B', playerId: cheap1.id },
  { pos: '2B', playerId: cheap2.id },
  { pos: '3B', playerId: cheap3.id },
  { pos: 'SS', playerId: cheapSS.id },
  { pos: 'OF', playerId: ofs[0].id },
  { pos: 'OF', playerId: ofs[1].id },
  { pos: 'OF', playerId: ofs[2].id },
  { pos: 'DH', playerId: dh.id },
];
draft.lineup = line;
const arms = [...data.pitchers].sort((a,b)=>a.salary-b.salary || b.abilities.IP-a.abilities.IP);
let staff=[], ip=0;
for (const p of arms) {
  if (staff.length >= 6) break;
  staff.push(p); ip += p.abilities.IP;
  if (ip > 9 && staff.length >= 3) break;
}
draft.pitchingStaff = staff.map((p) => p.id);
draft.starterId = staff[0].id;
draft.bench = data.batters.filter((b) => b.salary <= 18 && !line.some((l) => l.playerId === b.id)).slice(0, 3).map((b) => b.id);

const v = validateDraft(draft, byId);
if (!v.ok) {
  console.error(v);
  throw new Error('test draft invalid');
}
const user = toPreset(draft);

console.log('Opponents:', data.opponents.map((o) => `${o.abbr} $${o.salary}`).join(', '));

const results = [];
for (const opp of data.opponents) {
  const presets = { away: opp, home: user };
  results.push(playGame(presets, none, `live-${opp.abbr}`));
  const one = simulateGame(data, presets);
  results.push({ label: `sim-${opp.abbr}`, score: `${one.away}-${one.home}`, winner: one.winner, steps: one.steps });
  const many = simulateMany(data, presets, 25);
  console.log(`${opp.abbr} x25: YOU ${many.homeWins}-${many.awayWins} AI  avg ${many.avgHome.toFixed(1)}-${many.avgAway.toFixed(1)}`);
}

console.table(results);
console.log('All smoke tests OK');
