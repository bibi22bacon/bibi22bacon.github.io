/**
 * Heuristic AI tactics for live play vs AI opponents.
 * Returns both DEF and OFF choices; the UI applies only the AI-controlled side(s).
 */

/**
 * @param {import('./engine.js').GameEngine} eng
 * @returns {{ def: string|null, off: string|null, stealTarget: 2|3 }}
 */
export function chooseAiTactics(eng) {
  const s = eng.state;
  const bases = s.bases;
  const outs = s.outs;
  const batter = eng.currentBatter().player;
  const on1 = Boolean(bases[0]);
  const on2 = Boolean(bases[1]);
  const on3 = Boolean(bases[2]);
  const anyOn = on1 || on2 || on3;
  const late = s.inning >= 8;
  const offense = eng.offenseSide();
  const defense = eng.defenseSide();
  const trail = offense.score < defense.score;
  const lead = offense.score > defense.score;
  const margin = Math.abs(offense.score - defense.score);

  let def = null;
  let off = null;
  let stealTarget = 2;

  // --- Defense ---
  const hrThreat = (batter.abilities.HR || 0) >= 10;
  const openFirst = !on1;

  if (on1 && outs < 2 && Math.random() < 0.55) {
    def = 'dp';
  } else if (on3 && outs < 2 && Math.random() < 0.4) {
    def = 'infield';
  } else if (
    late &&
    margin <= 2 &&
    hrThreat &&
    openFirst &&
    !on2 &&
    !on3 &&
    Math.random() < 0.35
  ) {
    def = 'ibb';
  } else if (on1 && !on2 && (bases[0]?.spd || 0) >= 5 && Math.random() < 0.35) {
    def = 'pickoff';
  } else if (Math.random() < 0.08) {
    def = 'fake';
  }

  // --- Offense ---
  const canSteal2 = on1 && !on2;
  const canSteal3 = on2 && !on3;
  const spd2 = bases[0]?.spd || 0;
  const spd3 = bases[1]?.spd || 0;

  if (eng.canPlaySteal()) {
    if (canSteal2 && spd2 >= 5 && Math.random() < (spd2 >= 7 ? 0.55 : 0.32)) {
      off = 'steal';
      stealTarget = 2;
    } else if (canSteal3 && spd3 >= 6 && Math.random() < 0.22) {
      off = 'steal';
      stealTarget = 3;
    }
  }

  if (!off && on3 && outs < 2 && eng.canPlaySacFly() && (trail || late) && Math.random() < 0.4) {
    off = 'sacfly';
  }

  if (!off && anyOn && outs < 2) {
    const weakBat = (batter.abilities.HR || 0) <= 2 && (batter.abilities.H || 0) <= 12;
    const fastBat = (batter.abilities.SPD || 0) >= 5;
    if (weakBat && fastBat && Math.random() < 0.28) {
      off = 'bunt';
    } else if ((on1 || on2) && Math.random() < 0.18) {
      off = 'hitrun';
    }
  }

  if (!off && Math.random() < 0.06) {
    off = 'fake';
  }

  // Avoid pointless aggression when protecting a big lead late
  if (lead && late && margin >= 4) {
    if (off === 'steal' || off === 'hitrun' || off === 'bunt') off = null;
    if (def === 'ibb') def = null;
  }

  return { def, off, stealTarget };
}

/**
 * Apply AI choices onto engine state without emitting (caller resolves next).
 * @param {import('./engine.js').GameEngine} eng
 * @param {{ controlDef?: boolean, controlOff?: boolean }} who
 * @param {{ def: string|null, off: string|null, stealTarget: 2|3 }} [choice]
 */
export function applyAiTactics(eng, who, choice = null) {
  const pick = choice || chooseAiTactics(eng);
  if (who.controlDef) {
    eng.state.pendingDefTactic = pick.def;
  }
  if (who.controlOff) {
    eng.state.pendingOffTactic = pick.off;
    if (pick.off === 'steal') {
      eng.state.stealTarget = pick.stealTarget;
    }
  }
  return pick;
}
