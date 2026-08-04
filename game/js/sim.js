import { GameEngine } from './engine.js';

/**
 * Play one full game with no tactics (and auto pitching).
 * @returns {{away:number, home:number, winner:string, innings:number, forfeit:string|null, steps:number}}
 */
export function simulateGame(data, presets, { silent = true } = {}) {
  const eng = new GameEngine(data, presets, { silent });
  let steps = 0;
  const maxSteps = 8000;
  while (eng.state.phase !== 'gameover' && !eng.state.winner && steps < maxSteps) {
    steps++;
    eng.setDefTactic(null);
    eng.setOffTactic(null);
    eng.resolvePA();
  }
  // If a winner was decided (incl. forfeit) but phase was left open, treat as finished
  if (eng.state.winner && eng.state.phase !== 'gameover') {
    eng.state.phase = 'gameover';
  }
  if (eng.state.phase !== 'gameover') {
    return {
      incomplete: true,
      steps,
      away: eng.state.away.score,
      home: eng.state.home.score,
      winner: null,
      innings: eng.state.inning,
      forfeit: eng.state.forfeit,
    };
  }
  return {
    incomplete: false,
    steps,
    away: eng.state.away.score,
    home: eng.state.home.score,
    winner: eng.state.winner,
    innings: eng.state.inning,
    forfeit: eng.state.forfeit,
  };
}

/**
 * Run N games (max 10000). User is always home unless swapped in presets.
 */
export function simulateMany(data, presets, n, onProgress) {
  const games = Math.max(1, Math.min(10000, Math.floor(n) || 1));
  const summary = {
    games,
    homeWins: 0,
    awayWins: 0,
    ties: 0, // should stay 0 — rules have extras / forfeit, no draws
    incompletes: 0,
    forfeits: 0,
    homeRuns: 0,
    awayRuns: 0,
    totalInnings: 0,
    results: [],
  };

  for (let i = 0; i < games; i++) {
    const r = simulateGame(data, presets, { silent: true });
    if (r.incomplete) {
      summary.incompletes += 1;
    } else if (r.winner === presets.home.abbr) {
      summary.homeWins += 1;
    } else if (r.winner === presets.away.abbr) {
      summary.awayWins += 1;
    } else {
      summary.ties += 1;
    }
    if (r.forfeit) summary.forfeits += 1;
    summary.homeRuns += r.home;
    summary.awayRuns += r.away;
    summary.totalInnings += r.innings || 0;
    if (games <= 50 || i < 20) {
      summary.results.push({
        n: i + 1,
        score: `${r.away}-${r.home}`,
        winner: r.winner,
        innings: r.innings,
        forfeit: r.forfeit,
      });
    }
    if (onProgress && (i % 10 === 9 || i === games - 1)) {
      onProgress(i + 1, games, summary);
    }
  }

  summary.avgHome = summary.homeRuns / games;
  summary.avgAway = summary.awayRuns / games;
  summary.avgInnings = summary.totalInnings / games;
  return summary;
}
