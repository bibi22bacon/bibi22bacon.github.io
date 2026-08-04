/**
 * Headless smoke test: play complete games with random/no tactics.
 */
import { readFileSync } from 'fs';
import { GameEngine } from './engine.js';

const data = JSON.parse(readFileSync(new URL('../data/players.json', import.meta.url), 'utf8'));

function playGame(seedLabel, tacticFn) {
  const eng = new GameEngine(data, data.presets);
  let steps = 0;
  const maxSteps = 5000;
  while (eng.state.phase !== 'gameover' && steps < maxSteps) {
    steps++;
    tacticFn(eng);
    const before = `${eng.state.inning}-${eng.state.half}-${eng.state.outs}-${eng.offenseSide().battingOrderIndex}`;
    eng.resolvePA();
    const after = `${eng.state.inning}-${eng.state.half}-${eng.state.outs}-${eng.offenseSide().battingOrderIndex}`;
    // safety: must make progress somehow (restart at-bat counts as progress if steal)
    if (steps > 100 && before === after && eng.state.phase === 'tactics' && !eng.state.lastResult?.restartAtBat) {
      // possible if something stuck
    }
  }
  if (eng.state.phase !== 'gameover') {
    throw new Error(`${seedLabel}: did not finish in ${maxSteps} steps. State=${JSON.stringify({
      inning: eng.state.inning, half: eng.state.half, outs: eng.state.outs,
      score: [eng.state.away.score, eng.state.home.score],
      phase: eng.state.phase,
      last: eng.state.lastResult?.finalResult
    })}`);
  }
  return {
    label: seedLabel,
    steps,
    score: `${eng.state.away.score}-${eng.state.home.score}`,
    winner: eng.state.winner,
    innings: eng.state.inning,
    forfeit: eng.state.forfeit,
  };
}

const none = (eng) => {
  eng.setDefTactic(null);
  eng.setOffTactic(null);
};

const random = (eng) => {
  const defs = [null, 'fake', 'infield', 'dp', 'ibb', 'pickoff'];
  const offs = [null, 'fake', 'bunt', 'hitrun', 'sacfly'];
  if (eng.canPlaySteal()) offs.push('steal');
  eng.setDefTactic(defs[Math.floor(Math.random() * defs.length)]);
  eng.setOffTactic(offs[Math.floor(Math.random() * offs.length)]);
  if (eng.state.pendingOffTactic === 'steal') {
    if (eng.state.bases[0] && !eng.state.bases[1]) eng.setStealTarget(2);
    else if (eng.state.bases[1] && !eng.state.bases[2]) eng.setStealTarget(3);
  }
};

const results = [];
results.push(playGame('no-tactics', none));
for (let i = 0; i < 20; i++) results.push(playGame(`random-${i}`, random));

console.table(results);
console.log('All games completed successfully.');
