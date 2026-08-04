/**
 * 9-Inning Duel — Game Engine
 * Implements Official Rulebook v1.1 (gameplay rules).
 */

export const TACTICS = {
  fake: { id: 'fake', name: 'Fake Move', side: 'both' },
  pickoff: { id: 'pickoff', name: 'Pickoff', side: 'def', d2Mod: 1 },
  infield: { id: 'infield', name: 'Infield Forward', side: 'def', d2Mod: 2 },
  ibb: { id: 'ibb', name: 'Intentional Walk', side: 'def' },
  dp: { id: 'dp', name: 'Double Play', side: 'def', d2Mod: 1 },
  steal: { id: 'steal', name: 'Steal', side: 'off' },
  bunt: { id: 'bunt', name: 'Bunt', side: 'off' },
  hitrun: { id: 'hitrun', name: 'Hit & Run', side: 'off' },
  sacfly: { id: 'sacfly', name: 'Sacrifice Fly', side: 'off', d2Mod: -1 },
};

export const DEF_TACTIC_IDS = ['fake', 'pickoff', 'infield', 'ibb', 'dp'];
export const OFF_TACTIC_IDS = ['fake', 'steal', 'bunt', 'hitrun', 'sacfly'];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function rollD1() {
  return 1 + Math.floor(Math.random() * 20);
}

function rollD2() {
  return 1 + Math.floor(Math.random() * 10);
}

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

export class GameEngine {
  /**
   * @param {object} data players.json
   * @param {{away:object, home:object}} presets
   * @param {{silent?:boolean}} [options]
   */
  constructor(data, presets, options = {}) {
    this.batters = Object.fromEntries(data.batters.map((b) => [b.id, b]));
    this.pitchers = Object.fromEntries(data.pitchers.map((p) => [p.id, p]));
    this.silent = Boolean(options.silent);
    this.state = this._initState(presets);
    this.listeners = [];
  }

  on(fn) {
    this.listeners.push(fn);
  }

  getBatter(id) {
    return this.batters[id];
  }

  getPitcher(id) {
    return this.pitchers[id];
  }

  _initState(presets) {
    const makeSide = (preset, isHome) => {
      const staff = preset.pitchingStaff.map((id) => ({
        playerId: id,
        ipUsed: 0,
        available: true,
        creditedThisInning: false,
      }));
      return {
        id: preset.id,
        name: preset.name,
        abbr: preset.abbr,
        isHome,
        lineup: deepClone(preset.lineup), // [{playerId, pos}]
        battingOrderIndex: 0,
        bench: [...(preset.bench || [])],
        staff,
        activePitcherId: preset.starterId,
        score: 0,
        hits: 0,
        errors: 0,
        inningRuns: Array(12).fill(0), // support extras display
      };
    };

    return {
      away: makeSide(presets.away, false),
      home: makeSide(presets.home, true),
      inning: 1,
      half: 'top', // top = away bats
      outs: 0,
      bases: [null, null, null], // 1B, 2B, 3B → {playerId, name, spd}
      phase: 'tactics', // tactics | reveal | gameover
      pendingDefTactic: null,
      pendingOffTactic: null,
      stealTarget: 2, // 2 or 3
      lastResult: null,
      log: [],
      winner: null,
      forfeit: null,
    };
  }

  offenseSide() {
    return this.state.half === 'top' ? this.state.away : this.state.home;
  }

  defenseSide() {
    return this.state.half === 'top' ? this.state.home : this.state.away;
  }

  currentBatter() {
    const side = this.offenseSide();
    const slot = side.lineup[side.battingOrderIndex % side.lineup.length];
    return { slot, player: this.batters[slot.playerId], orderIndex: side.battingOrderIndex % 9 };
  }

  currentPitcher() {
    const side = this.defenseSide();
    const entry = side.staff.find((s) => s.playerId === side.activePitcherId);
    return { entry, player: this.pitchers[side.activePitcherId] };
  }

  catcherDef() {
    const side = this.defenseSide();
    const catcher = side.lineup.find((l) => l.pos === 'C');
    if (!catcher) return 4;
    return this.batters[catcher.playerId]?.abilities?.DEF ?? 4;
  }

  log(msg, kind = 'info') {
    if (this.silent) return;
    this.state.log.unshift({ t: Date.now(), msg, kind });
    if (this.state.log.length > 80) this.state.log.length = 80;
  }

  emit(event, payload) {
    if (this.silent && event !== 'gameover') return;
    for (const fn of this.listeners) fn(event, payload, this.state);
  }

  setDefTactic(id) {
    if (this.state.phase !== 'tactics') return;
    this.state.pendingDefTactic = id || null;
    this.emit('tactics');
  }

  setOffTactic(id) {
    if (this.state.phase !== 'tactics') return;
    this.state.pendingOffTactic = id || null;
    // auto-pick steal target
    if (id === 'steal') {
      if (this.state.bases[0] && !this.state.bases[1]) this.state.stealTarget = 2;
      else if (this.state.bases[1] && !this.state.bases[2]) this.state.stealTarget = 3;
      else if (this.state.bases[0]) this.state.stealTarget = 2;
      else this.state.stealTarget = 2;
    }
    this.emit('tactics');
  }

  setStealTarget(base) {
    this.state.stealTarget = base === 3 ? 3 : 2;
    this.emit('tactics');
  }

  canPlaySteal() {
    const b = this.state.bases;
    return Boolean((b[0] && !b[1]) || (b[1] && !b[2]) || (b[0] && b[1] && !b[2]));
  }

  canPlayBunt() {
    return true;
  }

  canPlaySacFly() {
    return Boolean(this.state.bases[0] || this.state.bases[1] || this.state.bases[2]);
  }

  /** Resolve the current plate appearance */
  resolvePA() {
    if (this.state.phase !== 'tactics' || this.state.winner) return null;

    const defTac = this.state.pendingDefTactic;
    const offTac = this.state.pendingOffTactic;
    const batter = this.currentBatter();
    const pitcher = this.currentPitcher();
    const result = {
      batterName: batter.player.name,
      pitcherName: pitcher.player.name,
      defTactic: defTac,
      offTactic: offTac,
      d1: null,
      d2Raw: null,
      d2: null,
      matrixSource: null,
      baseResult: null,
      finalResult: null,
      detail: [],
      runs: 0,
      outsRecorded: 0,
      restartAtBat: false,
      gameOver: false,
    };

    // --- Intentional Walk (skips duel) ---
    if (defTac === 'ibb') {
      result.finalResult = 'BB';
      result.detail.push('Intentional Walk — BB awarded.');
      const scored = this._applyOutcome('BB', batter, { hitRun: false, sacFly: false, doublePlay: false });
      result.runs = scored.runs;
      result.outsRecorded = scored.outs;
      this._afterPA(result, batter);
      return result;
    }

    // --- Pickoff vs Steal ---
    if (defTac === 'pickoff' && offTac === 'steal') {
      const target = this.state.stealTarget;
      const fromIdx = target - 2; // steal 2 ← from 1B (idx0); steal 3 ← from 2B (idx1)
      const runner = this.state.bases[fromIdx];
      if (runner) {
        this.state.bases[fromIdx] = null;
        this.state.outs += 1;
        result.outsRecorded = 1;
        result.finalResult = 'PICKOFF';
        result.detail.push(`Pickoff! ${runner.name} is out stealing.`);
        this.log(`Pickoff — ${runner.name} out.`, 'out');
        if (this.state.outs >= 3) {
          this._endHalf();
        } else {
          // restart at-bat — same batter, clear tactics
          result.restartAtBat = true;
          this.state.pendingDefTactic = null;
          this.state.pendingOffTactic = null;
          this.state.phase = 'tactics';
        }
        this.state.lastResult = result;
        this.emit('result', result);
        return result;
      }
    }

    // Dice
    const d1 = rollD1();
    const d2Raw = rollD2();
    result.d1 = d1;
    result.d2Raw = d2Raw;

    let d2Mod = 0;
    if (defTac && TACTICS[defTac]?.d2Mod) d2Mod += TACTICS[defTac].d2Mod;
    if (offTac && TACTICS[offTac]?.d2Mod) d2Mod += TACTICS[offTac].d2Mod;

    // Infield Forward cancels Bunt
    let effectiveOff = offTac;
    if (defTac === 'infield' && offTac === 'bunt') {
      effectiveOff = null;
      result.detail.push('Infield Forward cancels Bunt.');
    }

    const d2 = clamp(d2Raw + d2Mod, 1, 10);
    result.d2 = d2;
    if (d2Mod) result.detail.push(`D2 ${d2Raw} ${d2Mod >= 0 ? '+' : ''}${d2Mod} → ${d2}`);

    // --- Steal (before pitch / replaces normal result path partially) ---
    if (effectiveOff === 'steal') {
      const stealRes = this._resolveSteal(d1, d2, batter);
      result.finalResult = stealRes.safe ? 'SB' : 'CS';
      result.detail.push(...stealRes.detail);
      result.outsRecorded = stealRes.out ? 1 : 0;
      if (stealRes.endedHalf) {
        this.state.lastResult = result;
        this.emit('result', result);
        return result;
      }
      // restart at-bat
      result.restartAtBat = true;
      this.state.pendingDefTactic = null;
      this.state.pendingOffTactic = null;
      this.state.phase = 'tactics';
      this.state.lastResult = result;
      this.log(stealRes.safe ? `Stolen base!` : `Caught stealing.`, stealRes.safe ? 'hit' : 'out');
      this.emit('result', result);
      return result;
    }

    // --- Bunt ---
    let baseResult;
    if (effectiveOff === 'bunt') {
      const spd = batter.player.abilities.SPD;
      const B = d1 - d2 - spd;
      if (B <= -5) baseResult = '1B';
      else if (B <= 4) baseResult = 'GO';
      else baseResult = 'FO';
      result.matrixSource = 'bunt';
      result.detail.push(`Bunt check B=${d1}−${d2}−${spd}=${B} → ${baseResult}`);
    } else {
      // Grind matrix
      let matrix, source;
      if (d1 <= 10) {
        matrix = pitcher.player.matrix;
        source = 'pitcher';
        result.detail.push(`D1=${d1} → pitcher matrix row ${d1}`);
      } else {
        matrix = batter.player.matrix;
        source = 'batter';
        const row = d1 - 10;
        result.detail.push(`D1=${d1} → batter matrix row ${row}`);
      }
      const row = d1 <= 10 ? d1 - 1 : d1 - 11;
      const col = d2 - 1;
      baseResult = matrix[row][col];
      result.matrixSource = source;
    }
    result.baseResult = baseResult;

    // Hit & Run: SO becomes steal attempt
    if (effectiveOff === 'hitrun' && baseResult === 'SO') {
      result.detail.push('Hit & Run: SO converts to Steal attempt.');
      const stealRes = this._resolveSteal(d1, d2, batter);
      result.finalResult = stealRes.safe ? 'SB' : 'CS';
      result.detail.push(...stealRes.detail);
      result.outsRecorded = stealRes.out ? 1 : 0;
      if (!stealRes.endedHalf) {
        result.restartAtBat = true;
        this.state.pendingDefTactic = null;
        this.state.pendingOffTactic = null;
        this.state.phase = 'tactics';
      }
      this.state.lastResult = result;
      this.emit('result', result);
      return result;
    }

    let finalResult = baseResult;

    // Apply outcome
    const scored = this._applyOutcome(finalResult, batter, {
      hitRun: effectiveOff === 'hitrun',
      sacFly: effectiveOff === 'sacfly',
      doublePlay: defTac === 'dp',
    });
    result.finalResult = finalResult;
    result.runs = scored.runs;
    result.outsRecorded = scored.outs;
    result.detail.push(...scored.detail);

    this._afterPA(result, batter);
    return result;
  }

  _resolveSteal(d1, d2, batter) {
    const target = this.state.stealTarget;
    const fromIdx = target === 3 ? 1 : 0;
    const runner = this.state.bases[fromIdx];
    const detail = [];
    if (!runner) {
      detail.push('No eligible runner to steal — attempt fails.');
      return { safe: false, out: false, endedHalf: false, detail };
    }
    // Need empty destination
    const toIdx = target - 1;
    if (this.state.bases[toIdx]) {
      detail.push(`Base ${target} occupied — steal not allowed.`);
      return { safe: false, out: false, endedHalf: false, detail };
    }
    const cdef = this.catcherDef();
    const check = d1 + cdef - d2 - runner.spd;
    // 2B uses ≤9 (~MLB average). 3B is stricter (≤6).
    const cutoff = target === 3 ? 6 : 9;
    const safe = check <= cutoff;
    detail.push(
      `Steal ${target}B: Check=${d1}+${cdef}−${d2}−${runner.spd}=${check} → ${
        safe ? `SAFE (≤${cutoff})` : `OUT (≥${cutoff + 1})`
      }`
    );
    if (safe) {
      this.state.bases[toIdx] = runner;
      this.state.bases[fromIdx] = null;
      return { safe: true, out: false, endedHalf: false, detail };
    }
    this.state.bases[fromIdx] = null;
    this.state.outs += 1;
    if (this.state.outs >= 3) {
      this._endHalf();
      return { safe: false, out: true, endedHalf: true, detail };
    }
    return { safe: false, out: true, endedHalf: false, detail };
  }

  _applyOutcome(code, batter, opts) {
    const detail = [];
    let runs = 0;
    let outs = 0;
    const side = this.offenseSide();
    const runnerObj = {
      playerId: batter.player.id,
      name: batter.player.name,
      spd: batter.player.abilities.SPD,
    };

    const scoreRunner = (r) => {
      if (!r) return;
      side.score += 1;
      const innIdx = this.state.inning - 1;
      if (innIdx >= side.inningRuns.length) side.inningRuns.push(0);
      side.inningRuns[innIdx] = (side.inningRuns[innIdx] || 0) + 1;
      runs += 1;
      this.log(`${r.name} scores! (${side.abbr} ${side.score})`, 'run');
    };

    const advanceAll = (n) => {
      // move from 3B backward to avoid collisions
      for (let step = 0; step < n; step++) {
        if (this.state.bases[2]) {
          scoreRunner(this.state.bases[2]);
          this.state.bases[2] = null;
        }
        this.state.bases[2] = this.state.bases[1];
        this.state.bases[1] = this.state.bases[0];
        this.state.bases[0] = null;
      }
    };

    if (code === 'SO') {
      this.state.outs += 1;
      outs = 1;
      detail.push('Strikeout.');
      this.log(`${batter.player.name} — SO`, 'out');
    } else if (code === 'FO') {
      this.state.outs += 1;
      outs = 1;
      detail.push('Fly out.');
      this.log(`${batter.player.name} — FO`, 'out');
      if (opts.sacFly && this.state.outs < 3) {
        // runners advance 1
        advanceAll(1);
        detail.push('Sacrifice Fly — runners advance.');
      }
    } else if (code === 'GO') {
      // Double play: if DP tactic and runner on 1st — batter + runner on 1st out
      if (opts.doublePlay && this.state.bases[0]) {
        const runnerName = this.state.bases[0].name;
        this.state.bases[0] = null;
        this.state.outs += 1; // batter
        outs = 1;
        if (this.state.outs < 3) {
          this.state.outs += 1; // runner on 1st
          outs = 2;
          detail.push('Double Play!');
          this.log(`DP — ${batter.player.name} and ${runnerName}`, 'out');
        } else {
          detail.push('Ground out (DP attempted — inning already ending).');
          this.log(`${batter.player.name} — GO`, 'out');
        }
        // Other runners hold on a DP in this ruleset.
      } else {
        this.state.outs += 1;
        outs = 1;
        detail.push('Ground out.');
        this.log(`${batter.player.name} — GO`, 'out');
        if (this.state.outs < 3) {
          advanceAll(1);
          detail.push('Runners advance 1 base.');
        } else {
          detail.push('3rd out — runners cannot score.');
        }
      }
    } else if (code === 'BB') {
      // Force advance from 1B chain
      if (this.state.bases[0] && this.state.bases[1] && this.state.bases[2]) {
        scoreRunner(this.state.bases[2]);
        this.state.bases[2] = this.state.bases[1];
        this.state.bases[1] = this.state.bases[0];
        this.state.bases[0] = runnerObj;
      } else if (this.state.bases[0] && this.state.bases[1]) {
        this.state.bases[2] = this.state.bases[1];
        this.state.bases[1] = this.state.bases[0];
        this.state.bases[0] = runnerObj;
      } else if (this.state.bases[0]) {
        this.state.bases[1] = this.state.bases[0];
        this.state.bases[0] = runnerObj;
      } else {
        this.state.bases[0] = runnerObj;
      }
      detail.push('Walk.');
      this.log(`${batter.player.name} — BB`, 'hit');
    } else if (code === '1B') {
      side.hits += 1;
      advanceAll(1);
      if (opts.hitRun) {
        advanceAll(1);
        detail.push('Hit & Run — extra base!');
      }
      this.state.bases[0] = runnerObj;
      detail.push('Single.');
      this.log(`${batter.player.name} — 1B`, 'hit');
    } else if (code === '2B') {
      side.hits += 1;
      advanceAll(2);
      if (opts.hitRun) {
        advanceAll(1);
        detail.push('Hit & Run — extra base!');
      }
      this.state.bases[1] = runnerObj;
      detail.push('Double.');
      this.log(`${batter.player.name} — 2B`, 'hit');
    } else if (code === 'HR') {
      side.hits += 1;
      scoreRunner(this.state.bases[2]);
      scoreRunner(this.state.bases[1]);
      scoreRunner(this.state.bases[0]);
      this.state.bases = [null, null, null];
      scoreRunner(runnerObj);
      detail.push('Home run!');
      this.log(`${batter.player.name} — HR!`, 'run');
    }

    return { runs, outs, detail };
  }

  _afterPA(result, batter) {
    // Walk-off check
    if (this._checkWalkOff()) {
      result.gameOver = true;
      this.state.lastResult = result;
      this.emit('result', result);
      return;
    }

    if (this.state.outs >= 3) {
      this._endHalf();
    } else {
      // next batter
      const side = this.offenseSide();
      side.battingOrderIndex = (side.battingOrderIndex + 1) % side.lineup.length;
      this.state.pendingDefTactic = null;
      this.state.pendingOffTactic = null;
      this.state.phase = 'tactics';
    }

    this.state.lastResult = result;
    this.emit('result', result);
  }

  _checkWalkOff() {
    // Home takes lead in bottom of 9+ 
    if (this.state.half === 'bottom' && this.state.inning >= 9) {
      if (this.state.home.score > this.state.away.score) {
        this._endGame(this.state.home, 'walk-off');
        return true;
      }
    }
    return false;
  }

  _creditPitcherInning(side) {
    const entry = side.staff.find((s) => s.playerId === side.activePitcherId);
    if (!entry || entry.creditedThisInning) return;
    entry.ipUsed += 1;
    entry.creditedThisInning = true;
    const p = this.pitchers[entry.playerId];
    this.log(`${p.name} IP used ${entry.ipUsed}/${p.abilities.IP}`, 'info');
    if (entry.ipUsed >= p.abilities.IP) {
      entry.available = false;
      this.log(`${p.name} is exhausted (IP limit).`, 'warn');
    }
  }

  _resetInningCredits() {
    for (const side of [this.state.away, this.state.home]) {
      for (const s of side.staff) s.creditedThisInning = false;
    }
  }

  _endHalf() {
    const defense = this.defenseSide();
    this._creditPitcherInning(defense);

    this.log(
      `End of ${this.state.half === 'top' ? 'top' : 'bottom'} ${this.state.inning}. Score ${this.state.away.abbr} ${this.state.away.score} – ${this.state.home.score} ${this.state.home.abbr}`,
      'inning'
    );

    this.state.outs = 0;
    this.state.bases = [null, null, null];
    this.state.pendingDefTactic = null;
    this.state.pendingOffTactic = null;

    if (this.state.half === 'top') {
      // Skip bottom of 9th+ if home already leads
      if (this.state.inning >= 9 && this.state.home.score > this.state.away.score) {
        this._endGame(this.state.home, 'home leads after top 9+');
        return;
      }
      this.state.half = 'bottom';
      this._ensurePitcherAvailable(this.state.away);
    } else {
      // End of full inning
      if (this.state.inning >= 9) {
        if (this.state.home.score !== this.state.away.score) {
          const winner =
            this.state.home.score > this.state.away.score ? this.state.home : this.state.away;
          this._endGame(winner, 'final');
          return;
        }
        // extras
        this.state.inning += 1;
        this.state.half = 'top';
        this._resetInningCredits();
        this._ensurePitcherAvailable(this.state.home);
        this.log(`Extra inning ${this.state.inning}`, 'inning');
      } else {
        this.state.inning += 1;
        this.state.half = 'top';
        this._resetInningCredits();
        this._ensurePitcherAvailable(this.state.home);
      }
    }

    this.state.phase = 'tactics';
    this.emit('half');
  }

  _ensurePitcherAvailable(defenseSide) {
    const entry = defenseSide.staff.find((s) => s.playerId === defenseSide.activePitcherId);
    const p = this.pitchers[defenseSide.activePitcherId];
    if (entry && entry.ipUsed < p.abilities.IP && entry.available) return;

    // auto-find next available
    const next = defenseSide.staff.find((s) => {
      const pp = this.pitchers[s.playerId];
      return s.available && s.ipUsed < pp.abilities.IP && s.playerId !== defenseSide.activePitcherId;
    });
    if (!next) {
      // forfeit
      const winner = defenseSide.isHome ? this.state.away : this.state.home;
      this.state.forfeit = defenseSide.abbr;
      this._endGame(winner, 'forfeit — no pitchers remaining');
      return;
    }
    this.changePitcher(defenseSide.isHome ? 'home' : 'away', next.playerId, true);
  }

  changePitcher(sideKey, pitcherId, auto = false) {
    const side = this.state[sideKey];
    if (!side || this.state.winner) return false;
    const entry = side.staff.find((s) => s.playerId === pitcherId);
    if (!entry) return false;
    const p = this.pitchers[pitcherId];
    if (entry.ipUsed >= p.abilities.IP || !entry.available) return false;

    // Credit outgoing pitcher for this inning if they threw
    if (side.activePitcherId && side.activePitcherId !== pitcherId) {
      this._creditPitcherInning(side);
    }

    side.activePitcherId = pitcherId;
    this.log(
      `${auto ? 'Auto: ' : ''}${side.abbr} brings in ${p.hand}HP (IP ${entry.ipUsed}/${p.abilities.IP})`,
      'sub'
    );
    this.emit('pitching');
    return true;
  }

  availablePitchers(sideKey) {
    const side = this.state[sideKey];
    return side.staff
      .map((s) => {
        const p = this.pitchers[s.playerId];
        return {
          ...s,
          name: p.name,
          hand: p.hand,
          ipMax: p.abilities.IP,
          remaining: p.abilities.IP - s.ipUsed,
          active: s.playerId === side.activePitcherId,
        };
      })
      .filter((s) => s.remaining > 0 && s.available);
  }

  _endGame(winner, reason) {
    this.state.winner = winner.abbr;
    this.state.phase = 'gameover';
    this.log(`Game over — ${winner.name} wins (${reason}). Final ${this.state.away.score}–${this.state.home.score}`, 'inning');
    this.emit('gameover', { winner, reason });
  }
}
