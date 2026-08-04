#!/usr/bin/env node
/**
 * Simulation economy for 9-Inning Duel
 * ------------------------------------
 * 1) Two-AI draft market discovers prices (demand + head-to-head sim wins)
 * 2) Candidate teams are drafted under those prices
 * 3) Tournament sims rank them; top 5 distinct builds become AI opponents
 *
 * This replaces static ability-anchor salaries + hand-cored top builds.
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { simulateGame } from '../game/js/sim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAYERS = join(ROOT, 'game/data/players.json');
const OUT_DIR = join(ROOT, 'data');

const CAP = 1000;
const FLOOR = 12;
const CEIL = 200;
const MIN_ROSTER = 12;
const MAX_ROSTER = 18;
const SLOTS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'OF', 'OF', 'DH'];

const rng = mulberry32(20260804);

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function choice(arr, weights) {
  let s = 0;
  for (const w of weights) s += w;
  let r = rng() * s;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

function covers(p, slot) {
  if (slot === 'DH') return true;
  return (p.positions || []).includes(slot);
}

/** Heuristic prior — market + sims overwrite this as the true signal. */
function priorVal(p) {
  const a = p.abilities;
  if (p.type === 'pitcher') {
    return (
      a.IP * 9 +
      a.K * 0.55 +
      a.FO * 0.12 +
      a.GO * 0.15 -
      a.BB * 1.5 -
      a['1B'] * 1.2 -
      a['2B'] * 2.2 -
      a.HR * 5.5
    );
  }
  return (
    a.H * 1.6 +
    a['2B'] * 2.4 +
    a.HR * 5.0 +
    a.BB * 1.2 -
    a.K * 0.4 +
    Math.max(a.SPD || 0, 0) * 1.4 +
    (a.DEF || 0) * 0.45
  );
}

function needMap(lineupPlayers) {
  const need = { C: 1, '1B': 1, '2B': 1, '3B': 1, SS: 1, OF: 3, DH: 1 };
  const used = new Set();
  for (const slot of SLOTS) {
    for (const p of lineupPlayers) {
      if (used.has(p.id)) continue;
      if (need[slot] > 0 && covers(p, slot)) {
        used.add(p.id);
        need[slot] -= 1;
        break;
      }
    }
  }
  return need;
}

function staffIp(ids, byId) {
  return ids.reduce((s, id) => s + (byId[id].abilities.IP || 0), 0);
}

function draftScore(p, team, prices, byId, style, phase) {
  const price = Math.max(prices[p.id] || FLOOR, 1);
  let val = priorVal(p) + (team.simBoost[p.id] || 0);
  const bats = team.ids.map((id) => byId[id]).filter((x) => x.type === 'batter');
  const need = needMap(bats);
  const ip = staffIp(team.ids, byId);

  if (p.type === 'batter') {
    let filled = false;
    for (const [slot, n] of Object.entries(need)) {
      if (n > 0 && covers(p, slot)) {
        const urg = { C: 11, SS: 8, '2B': 7, '3B': 7, '1B': 5, OF: 4, DH: 2 }[slot];
        val += urg * n * (phase === 'need' ? 3.2 : 1);
        filled = true;
        break;
      }
    }
    if (phase === 'need' && !filled) val -= 30;
  } else {
    if (ip <= 9) val += 10 * Math.min(p.abilities.IP, Math.max(1, 10 - ip));
    else if (phase === 'need') val -= 22;
  }

  if (style === 'stars') val *= 1.18 + 0.035 * Math.max(val, 0);
  if (style === 'pitching') val *= p.type === 'pitcher' ? 1.4 : 0.86;
  if (style === 'contact' && p.type === 'batter') val += 0.55 * aH(p) + 0.4 * aBB(p);
  if (style === 'power' && p.type === 'batter') val += 0.9 * aHR(p) + 0.35 * aBB(p);
  if (style === 'speed' && p.type === 'batter') val += 1.0 * Math.max(p.abilities.SPD || 0, 0);
  if (style === 'value') val *= 1.15;

  const exp = style === 'stars' ? 0.55 : 1.0;
  let vpd = val / price ** exp;
  if (style === 'stars' && team.spent < 450) vpd += 0.1 * val;
  return vpd + rng() * 0.2;
}

function aH(p) {
  return p.abilities.H || 0;
}
function aBB(p) {
  return p.abilities.BB || 0;
}
function aHR(p) {
  return p.abilities.HR || 0;
}

function draftOne(players, prices, style, byId, banned = new Set()) {
  const available = new Set(players.map((p) => p.id).filter((id) => !banned.has(id)));
  const team = { ids: [], spent: 0, style, simBoost: {} };
  const pickLog = [];

  for (let wave = 0; wave < 60; wave++) {
    if (team.ids.length >= MAX_ROSTER || CAP - team.spent < FLOOR) break;
    const bats = team.ids.map((id) => byId[id]).filter((x) => x.type === 'batter');
    const need = needMap(bats);
    const holes = Object.entries(need)
      .filter(([, n]) => n > 0)
      .map(([s]) => s);
    const ip = staffIp(team.ids, byId);
    const phase = holes.length || ip <= 9 || team.ids.length < MIN_ROSTER ? 'need' : 'luxury';
    if (phase === 'luxury' && holes.length === 0 && ip > 9 && team.ids.length >= MIN_ROSTER && CAP - team.spent < 180) {
      break;
    }

    let cands = [];
    for (const id of available) {
      const p = byId[id];
      const price = prices[id] ?? FLOOR;
      if (price > CAP - team.spent) continue;
      if (phase === 'need') {
        if (holes.length && p.type === 'batter' && holes.some((s) => covers(p, s))) cands.push(p);
        else if (ip <= 9 && p.type === 'pitcher') cands.push(p);
        else if (team.ids.length < MIN_ROSTER) cands.push(p);
      } else cands.push(p);
    }
    if (!cands.length) {
      cands = [...available]
        .map((id) => byId[id])
        .filter((p) => (prices[p.id] ?? FLOOR) <= CAP - team.spent);
      if (holes.length) {
        const pref = cands.filter((p) => p.type === 'batter' && holes.some((s) => covers(p, s)));
        if (pref.length) cands = pref;
      } else if (ip <= 9) {
        const pref = cands.filter((p) => p.type === 'pitcher');
        if (pref.length) cands = pref;
      }
    }
    if (!cands.length) break;

    cands.sort((a, b) => draftScore(b, team, prices, byId, style, phase) - draftScore(a, team, prices, byId, style, phase));
    const top = cands.slice(0, 5);
    const pick = choice(
      top,
      top.map((p) => Math.max(0.01, draftScore(p, team, prices, byId, style, phase)))
    );
    available.delete(pick.id);
    team.ids.push(pick.id);
    team.spent += prices[pick.id] ?? FLOOR;
    pickLog.push({ id: pick.id, idx: pickLog.length, price: prices[pick.id] ?? FLOOR });
  }

  // Force-fill legal minimum
  forceFill(team, available, prices, byId);
  spendRest(team, available, prices, byId, style);
  for (const id of team.ids) byId[id].salary = prices[id] ?? FLOOR;
  team.spent = team.ids.reduce((s, id) => s + (prices[id] ?? FLOOR), 0);
  return { team, pickLog, ok: isLegal(team, byId) };
}

/** Burn remaining cap: upgrade weak bats/arms or add depth. Strong clubs spend ~$1000. */
function spendRest(team, available, prices, byId, style) {
  for (let guard = 0; guard < 160; guard++) {
    const left = CAP - team.spent;
    if (left < FLOOR) break;
    let best = null;
    let bestScore = 0;

    // Upgrade existing pieces
    for (let i = 0; i < team.ids.length; i++) {
      const old = byId[team.ids[i]];
      const oldP = prices[old.id] ?? FLOOR;
      for (const id of available) {
        const neu = byId[id];
        if (neu.type !== old.type) continue;
        const np = prices[id] ?? FLOOR;
        if (!(oldP < np && np - oldP <= left)) continue;
        if (old.type === 'batter') {
          const trialIds = team.ids.map((x, j) => (j === i ? id : x));
          const trialTeam = { ids: trialIds, spent: team.spent + (np - oldP) };
          for (const tid of trialIds) byId[tid].salary = prices[tid] ?? FLOOR;
          if (!toPreset(trialTeam, byId, { id: 't', name: 't', abbr: 'TMP', blurb: '' })) continue;
        } else {
          const ip =
            staffIp(
              team.ids.map((x, j) => (j === i ? id : x)),
              byId
            );
          if (ip <= 9) continue;
        }
        const gain = priorVal(neu) - priorVal(old);
        if (gain <= 0.2) continue;
        let score = gain - 0.01 * (np - oldP) + (style === 'value' ? gain / Math.max(np - oldP, 1) : 0);
        if (style === 'pitching' && neu.type === 'pitcher') score += 12 + np * 0.02;
        if (style === 'power' && neu.type === 'batter') score += (neu.abilities.HR || 0) * 0.15;
        if (score > bestScore) {
          bestScore = score;
          best = { kind: 'up', i, id, cost: np - oldP };
        }
      }
    }

    // Add depth if under soft size or leftover is large
    if (team.ids.length < 14 || left >= 40) {
      for (const id of available) {
        const p = byId[id];
        const np = prices[id] ?? FLOOR;
        if (np > left) continue;
        if (team.ids.length >= MAX_ROSTER) continue;
        const score = priorVal(p) * 0.45 - 0.02 * np;
        if (score > bestScore) {
          bestScore = score;
          best = { kind: 'add', id, cost: np };
        }
      }
    }

    if (!best) break;
    if (best.kind === 'up') {
      const oldId = team.ids[best.i];
      available.add(oldId);
      available.delete(best.id);
      team.ids[best.i] = best.id;
      team.spent += best.cost;
    } else {
      available.delete(best.id);
      team.ids.push(best.id);
      team.spent += best.cost;
    }
  }

  // If still can't seat, try cheap seat fillers
  for (const id of team.ids) byId[id].salary = prices[id] ?? FLOOR;
  if (!toPreset(team, byId, { id: 't', name: 't', abbr: 'TMP', blurb: '' })) {
    // add cheapest eligible hole-filler from pool
    for (let guard = 0; guard < 20; guard++) {
      const trial = toPreset(team, byId, { id: 't', name: 't', abbr: 'TMP', blurb: '' });
      if (trial) break;
      const bats = team.ids.map((id) => byId[id]).filter((p) => p.type === 'batter');
      const need = needMap(bats);
      const holes = Object.entries(need)
        .filter(([, n]) => n > 0)
        .map(([s]) => s);
      const cands = [...available]
        .map((id) => byId[id])
        .filter(
          (p) =>
            p.type === 'batter' &&
            (prices[p.id] ?? FLOOR) <= CAP - team.spent &&
            holes.some((s) => covers(p, s))
        )
        .sort((a, b) => (prices[a.id] ?? FLOOR) - (prices[b.id] ?? FLOOR));
      if (!cands.length) break;
      const p = cands[0];
      available.delete(p.id);
      team.ids.push(p.id);
      team.spent += prices[p.id] ?? FLOOR;
      byId[p.id].salary = prices[p.id] ?? FLOOR;
    }
  }
}

function forceFill(team, available, prices, byId) {
  for (let guard = 0; guard < 40; guard++) {
    const bats = team.ids.map((id) => byId[id]).filter((x) => x.type === 'batter');
    const need = needMap(bats);
    const holes = Object.entries(need)
      .filter(([, n]) => n > 0)
      .map(([s]) => s);
    const ip = staffIp(team.ids, byId);
    if (!holes.length && ip > 9 && team.ids.length >= MIN_ROSTER) return;
    if (team.ids.length >= MAX_ROSTER || CAP - team.spent < FLOOR) return;

    let cands = [];
    if (holes.length) {
      cands = [...available]
        .map((id) => byId[id])
        .filter((p) => p.type === 'batter' && (prices[p.id] ?? FLOOR) <= CAP - team.spent && holes.some((s) => covers(p, s)))
        .sort((a, b) => (prices[a.id] ?? FLOOR) - (prices[b.id] ?? FLOOR) || priorVal(b) - priorVal(a));
    } else if (ip <= 9) {
      cands = [...available]
        .map((id) => byId[id])
        .filter((p) => p.type === 'pitcher' && (prices[p.id] ?? FLOOR) <= CAP - team.spent)
        .sort(
          (a, b) =>
            (prices[a.id] ?? FLOOR) / Math.max(a.abilities.IP, 1) - (prices[b.id] ?? FLOOR) / Math.max(b.abilities.IP, 1)
        );
    } else {
      cands = [...available]
        .map((id) => byId[id])
        .filter((p) => (prices[p.id] ?? FLOOR) <= CAP - team.spent)
        .sort((a, b) => priorVal(b) / (prices[b.id] ?? FLOOR) - priorVal(a) / (prices[a.id] ?? FLOOR));
    }
    if (!cands.length) return;
    const p = cands[0];
    available.delete(p.id);
    team.ids.push(p.id);
    team.spent += prices[p.id] ?? FLOOR;
  }
}

function isLegal(team, byId) {
  if (team.spent > CAP || team.ids.length < MIN_ROSTER) return false;
  if (staffIp(team.ids, byId) <= 9) return false;
  return Boolean(toPreset(team, byId, { id: 't', name: 't', abbr: 'TMP', blurb: '' }));
}

function toPreset(team, byId, meta) {
  const bats = team.ids.map((id) => byId[id]).filter((p) => p.type === 'batter');
  const pits = team.ids.map((id) => byId[id]).filter((p) => p.type === 'pitcher');
  const used = new Set();
  const lineup = Array(9).fill(null);

  // Seat scarcest / fewest-options slots first so multi-pos stars don't steal 3B/C
  const order = [...SLOTS.keys()].sort((i, j) => {
    const si = SLOTS[i];
    const sj = SLOTS[j];
    const ci = bats.filter((p) => covers(p, si)).length;
    const cj = bats.filter((p) => covers(p, sj)).length;
    return ci - cj || i - j;
  });

  for (const idx of order) {
    const slot = SLOTS[idx];
    const pool = bats.filter((p) => !used.has(p.id) && covers(p, slot));
    pool.sort((a, b) => {
      const ai = (a.positions || []).indexOf(slot);
      const bi = (b.positions || []).indexOf(slot);
      const ap = slot === 'DH' ? 0 : ai < 0 ? 99 : ai;
      const bp = slot === 'DH' ? 0 : bi < 0 ? 99 : bi;
      // Prefer specialists for scarce slots; prefer talent otherwise
      const flexA = (a.positions || []).length;
      const flexB = (b.positions || []).length;
      return ap - bp || flexA - flexB || priorVal(b) - priorVal(a);
    });
    const pick = pool[0];
    if (!pick) return null; // cannot seat — caller skips
    used.add(pick.id);
    lineup[idx] = { playerId: pick.id, pos: slot };
  }

  const pitchingStaff = pits
    .slice()
    .sort((a, b) => priorVal(b) - priorVal(a))
    .map((p) => p.id);
  if (!pitchingStaff.length || staffIp(pitchingStaff, byId) <= 9) return null;

  const bench = bats.filter((p) => !used.has(p.id)).map((p) => p.id);
  while (lineup.length + pitchingStaff.length + bench.length > 25) bench.pop();
  const ids = [...lineup.map((s) => s.playerId), ...pitchingStaff, ...bench];
  const salary = ids.reduce((s, id) => s + (byId[id].salary ?? FLOOR), 0);
  return {
    ...meta,
    lineup,
    pitchingStaff,
    starterId: pitchingStaff[0],
    bench,
    salary,
  };
}

function adjustPrices(prices, draftLogs, winCredits, players) {
  const score = new Map();
  const times = new Map();
  const n = Math.max(1, draftLogs.length);
  for (const log of draftLogs) {
    const nPicks = Math.max(1, log.length);
    for (const { id, idx } of log) {
      times.set(id, (times.get(id) || 0) + 1);
      score.set(id, (score.get(id) || 0) + (nPicks - idx) ** 2);
    }
  }
  // Sim win credits — players on winning clubs get market heat
  for (const [id, c] of winCredits) {
    score.set(id, (score.get(id) || 0) + c * 18);
  }

  const ordered = [...score.entries()].sort((a, b) => b[1] - a[1]);
  const rank = new Map(ordered.map(([id], i) => [id, i]));
  const next = { ...prices };
  for (const p of players) {
    const id = p.id;
    const old = prices[id] ?? FLOOR;
    const freq = (times.get(id) || 0) / n;
    const r = rank.has(id) ? rank.get(id) : 9999;
    let np;
    if (r < 8) np = old * 1.42 + 6;
    else if (r < 25) np = old * 1.28 + 3;
    else if (r < 60) np = old * 1.14 + 2;
    else if (r < 120) np = old * 1.06 + 1;
    else if (freq >= 0.18) np = old * 1.02;
    else if (freq > 0) np = old * 0.97;
    else np = old * 0.88;
    next[id] = Math.max(FLOOR, Math.min(CEIL + 40, Math.round(np)));
  }
  return next;
}

function rescaleBoard(players, demandPrices, byId) {
  // Blend demand rank + prior ability, map to FLOOR..CEIL so $1000 bites
  const bats = players.filter((p) => p.type === 'batter');
  const pits = players.filter((p) => p.type === 'pitcher');

  function remap(group, maxS, bestN, bestTarget) {
    const nd = Math.max(1, group.length - 1);
    const byD = [...group].sort((a, b) => (demandPrices[b.id] || 0) - (demandPrices[a.id] || 0));
    const byR = [...group].sort((a, b) => priorVal(b) - priorVal(a));
    const dPct = new Map(byD.map((p, i) => [p.id, 1 - i / nd]));
    const rPct = new Map(byR.map((p, i) => [p.id, 1 - i / nd]));
    const scored = group.map((p) => {
      let s = 0.55 * dPct.get(p.id) + 0.45 * rPct.get(p.id);
      if (rPct.get(p.id) >= 0.985) s = Math.max(s, 0.97);
      else if (rPct.get(p.id) >= 0.95) s = Math.max(s, 0.92);
      return { p, s, r: priorVal(p) };
    });
    scored.sort((a, b) => b.s - a.s || b.r - a.r);
    const n = scored.length;
    const head = Math.max(10, Math.floor(n * 0.06));
    const solid = Math.max(head + 1, Math.floor(n * 0.22));
    const k = 0.1;
    const raw = [];
    for (let i = 0; i < n; i++) {
      if (i < head) raw.push(FLOOR + (maxS - FLOOR) * Math.exp(-k * i));
      else if (i < solid) {
        const t = (i - head) / Math.max(1, solid - head - 1);
        raw.push(50 - 22 * t);
      } else {
        const t = (i - solid) / Math.max(1, n - solid - 1);
        raw.push(28 - 16 * t ** 0.55);
      }
    }
    const top = raw.slice(0, bestN).reduce((a, b) => a + b, 0) || 1;
    const scale = bestTarget / top;
    const out = {};
    let prev = null;
    for (let i = 0; i < n; i++) {
      let pay = Math.round(Math.max(FLOOR, Math.min(CEIL, i < head ? raw[i] * scale : raw[i])));
      if (prev != null && pay > prev) pay = prev;
      prev = pay;
      out[scored[i].p.id] = pay;
    }
    return out;
  }

  const batPay = remap(bats, 195, 9, 1250);
  const pitPay = remap(pits, 195, 5, 920);
  return { ...batPay, ...pitPay };
}

function runMarket(data, byId, players) {
  const STYLES = [
    ['stars', 'value'],
    ['value', 'pitching'],
    ['pitching', 'power'],
    ['power', 'stars'],
    ['contact', 'value'],
    ['speed', 'pitching'],
    ['stars', 'pitching'],
    ['value', 'power'],
  ];
  let prices = Object.fromEntries(players.map((p) => [p.id, FLOOR]));
  const history = [];
  const per = 16;
  const gamesPerMatch = 7;
  console.log(`Market: ${players.length} players, ${per} drafts/round, ${gamesPerMatch} sims/match`);

  for (let rnd = 1; rnd <= 40; rnd++) {
    const logs = [];
    const winCredits = new Map();
    let valid = 0;
    let homeW = 0;

    for (let g = 0; g < per; g++) {
      const [sA, sB] = STYLES[g % STYLES.length];
      const A = draftOne(players, prices, sA, byId);
      const B = draftOne(players, prices, sB, byId);
      if (A.pickLog.length) logs.push(A.pickLog);
      if (B.pickLog.length) logs.push(B.pickLog);
      if (!A.ok || !B.ok) continue;

      // Temporarily stamp salaries for spend display; sims use card abilities only
      for (const id of [...A.team.ids, ...B.team.ids]) byId[id].salary = prices[id];
      const away = toPreset(A.team, byId, { id: 'a', name: 'A', abbr: 'AAA', blurb: sA });
      const home = toPreset(B.team, byId, { id: 'b', name: 'B', abbr: 'BBB', blurb: sB });
      if (!away || !home) continue;
      valid++;

      let aWins = 0;
      let bWins = 0;
      for (let i = 0; i < gamesPerMatch; i++) {
        const r = simulateGame(data, { away, home }, { silent: true });
        if (r.winner === 'AAA') aWins++;
        else if (r.winner === 'BBB') bWins++;
      }
      if (bWins >= aWins) homeW++;
      const winnerIds = bWins >= aWins ? B.team.ids : A.team.ids;
      const loserIds = bWins >= aWins ? A.team.ids : B.team.ids;
      for (const id of winnerIds) winCredits.set(id, (winCredits.get(id) || 0) + 1.0);
      for (const id of loserIds) winCredits.set(id, (winCredits.get(id) || 0) - 0.25);
    }

    const next = adjustPrices(prices, logs, winCredits, players);
    const vals = Object.values(next);
    const meanChg =
      players.reduce((s, p) => s + Math.abs(next[p.id] - prices[p.id]) / Math.max(prices[p.id], 1), 0) /
      players.length;
    const top20 = [...vals].sort((a, b) => b - a).slice(0, 20);
    history.push({
      round: rnd,
      valid,
      max: Math.max(...vals),
      med: [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)],
      top20: top20.reduce((a, b) => a + b, 0) / 20,
      meanChg,
      homeW,
    });
    console.log(
      `R${String(rnd).padStart(2, '0')} valid=${valid}/${per} max=$${history.at(-1).max} top20≈$${history.at(-1).top20.toFixed(0)} med=$${history.at(-1).med} chg=${(meanChg * 100).toFixed(1)}%`
    );
    prices = next;
    if (rnd >= 16 && meanChg < 0.055 && history.at(-1).max >= 100) {
      console.log(`Stabilized at round ${rnd}`);
      break;
    }
  }

  const board = rescaleBoard(players, prices, byId);
  return { demand: prices, board, history };
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

function runTournament(data, byId, players, board) {
  // Stamp board salaries onto players
  for (const p of players) p.salary = board[p.id];

  const styles = ['stars', 'value', 'pitching', 'power', 'contact', 'speed'];
  const candidates = [];
  console.log('Drafting candidate clubs…');
  const judge = players.find((p) => p.name === 'Judge, Aaron')?.id;
  const ohtani = players.find((p) => p.name === 'Ohtani, Shohei')?.id;
  for (let i = 0; i < 96; i++) {
    const style = styles[i % styles.length];
    // Reserve a mid-tier lane that cannot take megastars
    const banned =
      i % 6 === 3 || style === 'value' || style === 'contact'
        ? new Set([judge, ohtani].filter(Boolean))
        : new Set();
    // Pitching lane: ban one megastar bat so aces can be afforded
    if (style === 'pitching' && i % 2 === 0 && judge) banned.add(judge);
    const { team, ok } = draftOne(players, board, style, byId, banned);
    if (!ok) continue;
    const preset = toPreset(team, byId, {
      id: `c_${i}`,
      name: `${style} ${i}`,
      abbr: `C${i}`,
      blurb: style,
    });
    if (!preset || preset.salary > CAP) continue;
    const names = new Set(
      [...preset.lineup.map((s) => s.playerId), ...preset.pitchingStaff, ...preset.bench].map((id) => byId[id].name)
    );
    candidates.push({
      team,
      preset,
      style,
      bannedStars: banned.has(judge) && banned.has(ohtani),
      hasJudge: names.has('Judge, Aaron'),
      hasOhtani: names.has('Ohtani, Shohei'),
      wins: 0,
      games: 0,
      runDiff: 0,
    });
  }
  console.log(
    `Candidates: ${candidates.length} (no-Judge/Ohtani: ${candidates.filter((c) => !c.hasJudge && !c.hasOhtani).length})`
  );

  // Round-robin sample: each plays ~12 opponents × 9 games
  const oppN = 12;
  const series = 9;
  for (let i = 0; i < candidates.length; i++) {
    for (let k = 0; k < oppN; k++) {
      let j = Math.floor(rng() * candidates.length);
      if (j === i) j = (j + 1) % candidates.length;
      const A = candidates[i];
      const B = candidates[j];
      for (let g = 0; g < series; g++) {
        const homeFirst = g % 2 === 0;
        const r = simulateGame(
          data,
          homeFirst ? { away: B.preset, home: A.preset } : { away: A.preset, home: B.preset },
          { silent: true }
        );
        A.games++;
        B.games++;
        const aAbbr = A.preset.abbr;
        const bAbbr = B.preset.abbr;
        if (r.winner === aAbbr) {
          A.wins++;
          A.runDiff += homeFirst ? r.home - r.away : r.away - r.home;
          B.runDiff += homeFirst ? r.away - r.home : r.home - r.away;
        } else if (r.winner === bAbbr) {
          B.wins++;
          B.runDiff += homeFirst ? r.home - r.away : r.away - r.home;
          A.runDiff += homeFirst ? r.away - r.home : r.home - r.away;
        }
      }
    }
    if (i % 12 === 11) console.log(`  tournament progress ${i + 1}/${candidates.length}`);
  }

  candidates.sort((a, b) => b.wins / Math.max(b.games, 1) - a.wins / Math.max(a.games, 1) || b.runDiff - a.runDiff);

  // Pick 5 distinct identity builds with composition filters (not just draft-style labels)
  function pitSpend(c) {
    return c.preset.pitchingStaff.reduce((s, id) => s + byId[id].salary, 0);
  }
  function batSpend(c) {
    return c.preset.lineup.reduce((s, x) => s + byId[x.playerId].salary, 0);
  }
  function topPits(c, n = 2) {
    return c.preset.pitchingStaff
      .map((id) => byId[id].salary)
      .sort((a, b) => b - a)
      .slice(0, n);
  }
  function topPitSal(c, n = 2) {
    return topPits(c, n).reduce((a, b) => a + b, 0);
  }
  function has(c, name) {
    const ids = new Set([...c.preset.lineup.map((x) => x.playerId), ...c.preset.pitchingStaff, ...c.preset.bench]);
    return [...ids].some((id) => byId[id].name === name);
  }
  function ofStars(c) {
    return c.preset.lineup.filter((x) => x.pos === 'OF').reduce((s, x) => s + byId[x.playerId].salary, 0);
  }

  const themes = [
    {
      abbr: 'OFF',
      name: 'AI Offense First',
      blurb: 'Sim-drafted offense stack.',
      score: (c) => batSpend(c) * 0.002 + c.wins / c.games * 10 + (has(c, 'Judge, Aaron') || has(c, 'Ohtani, Shohei') ? 0.8 : 0),
      ok: (c) => batSpend(c) >= 550 && topPitSal(c, 1) <= 160,
    },
    {
      abbr: 'ACE',
      name: 'AI Two-Ace',
      blurb: 'Sim-drafted two-ace staff.',
      score: (c) => topPitSal(c, 2) * 0.004 + c.wins / c.games * 8,
      ok: (c) => {
        const t = topPits(c, 2);
        return (t[0] || 0) >= 150 && (t[1] || 0) >= 90;
      },
    },
    {
      abbr: 'DUAL',
      name: 'AI Dual Threat',
      blurb: 'Sim-drafted star bat + quality arm.',
      score: (c) => c.wins / c.games * 10 + Math.min(batSpend(c), 700) * 0.001 + Math.min(topPitSal(c, 1), 180) * 0.002,
      ok: (c) => batSpend(c) >= 500 && topPitSal(c, 1) >= 90,
    },
    {
      abbr: 'MID',
      name: 'AI Mid-Star Stack',
      blurb: 'Sim-drafted mid-tier stack (no Judge/Ohtani).',
      score: (c) => c.wins / c.games * 12 + batSpend(c) * 0.001,
      ok: (c) => !c.hasJudge && !c.hasOhtani && c.preset.salary >= 850,
    },
    {
      abbr: 'OFC',
      name: 'AI Outfield Core',
      blurb: 'Sim-drafted outfield-heavy club.',
      score: (c) => ofStars(c) * 0.003 + c.wins / c.games * 9,
      ok: (c) => ofStars(c) >= 200,
    },
  ];

  const picked = [];
  for (const theme of themes) {
    const ranked = [...candidates]
      .filter((c) => theme.ok(c))
      .filter((c) => !picked.some((p) => jaccard(p.team.ids, c.team.ids) > 0.42))
      .sort((a, b) => theme.score(b) - theme.score(a));
    let best = ranked[0];
    if (!best) {
      best = [...candidates].filter((c) => theme.ok(c)).sort((a, b) => theme.score(b) - theme.score(a))[0];
    }
    if (!best && theme.abbr === 'MID') {
      const forced = draftOne(players, board, 'contact', byId, new Set([judge, ohtani].filter(Boolean)));
      if (forced.ok) {
        const preset = toPreset(forced.team, byId, {
          id: 'ai_midstack',
          name: theme.name,
          abbr: theme.abbr,
          blurb: theme.blurb,
        });
        if (preset && theme.ok({ ...forced, preset, hasJudge: false, hasOhtani: false })) {
          best = { team: forced.team, preset, style: 'contact', wins: 1, games: 2, runDiff: 0, hasJudge: false, hasOhtani: false };
        }
      }
    }
    if (!best && theme.abbr === 'ACE') {
      // Seed the two highest board-priced arms that still leave a legal club
      const arms = players
        .filter((p) => p.type === 'pitcher')
        .sort((a, b) => board[b.id] - board[a.id] || priorVal(b) - priorVal(a));
      for (let a = 0; a < Math.min(6, arms.length); a++) {
        for (let b = a + 1; b < Math.min(8, arms.length); b++) {
          const seedBan = new Set([judge].filter(Boolean));
          const { team, ok } = draftOne(players, board, 'pitching', byId, seedBan);
          if (!ok) continue;
          // Force-swap top staff to the seeded aces if affordable
          const pits = team.ids.filter((id) => byId[id].type === 'pitcher');
          const bats = team.ids.filter((id) => byId[id].type === 'batter');
          let spent = bats.reduce((s, id) => s + board[id], 0);
          const aceA = arms[a];
          const aceB = arms[b];
          if (spent + board[aceA.id] + board[aceB.id] > CAP) continue;
          const newIds = [...bats, aceA.id, aceB.id];
          // fill IP if needed with cheap arms
          let ip = aceA.abilities.IP + aceB.abilities.IP;
          spent += board[aceA.id] + board[aceB.id];
          for (const p of players.filter((x) => x.type === 'pitcher')) {
            if (newIds.includes(p.id)) continue;
            if (ip > 9) break;
            if (spent + board[p.id] > CAP) continue;
            newIds.push(p.id);
            spent += board[p.id];
            ip += p.abilities.IP;
          }
          // keep some bench from original if room
          for (const id of pits) {
            if (newIds.includes(id)) continue;
            if (spent + board[id] > CAP) continue;
            if (newIds.length >= MAX_ROSTER) break;
            newIds.push(id);
            spent += board[id];
          }
          const seeded = { ids: newIds, spent };
          for (const id of newIds) byId[id].salary = board[id];
          const preset = toPreset(seeded, byId, {
            id: 'ai_twoace',
            name: theme.name,
            abbr: theme.abbr,
            blurb: theme.blurb,
          });
          if (!preset) continue;
          const cand = {
            team: seeded,
            preset,
            style: 'pitching',
            wins: 1,
            games: 2,
            runDiff: 0,
            hasJudge: preset.lineup.some((s) => byId[s.playerId].name === 'Judge, Aaron'),
            hasOhtani: preset.lineup.some((s) => byId[s.playerId].name === 'Ohtani, Shohei'),
          };
          if (theme.ok(cand)) {
            best = cand;
            break;
          }
        }
        if (best) break;
      }
    }
    if (!best) {
      console.warn(`Theme ${theme.abbr}: no legal composition — leaving gap filler from ok-relaxed win%`);
      best = [...candidates]
        .filter((c) => theme.ok(c) || theme.abbr === 'OFC' || theme.abbr === 'OFF' || theme.abbr === 'DUAL')
        .filter((c) => !picked.some((p) => jaccard(p.team.ids, c.team.ids) > 0.5))
        .sort((a, b) => b.wins / Math.max(b.games, 1) - a.wins / Math.max(a.games, 1))[0];
    }
    if (!best) best = candidates.filter((c) => theme.ok(c))[0] || candidates[picked.length];
    if (!best) throw new Error(`Failed to build theme ${theme.abbr}`);
    // Final composition guard
    if (!theme.ok(best) && theme.abbr !== 'OFC' && theme.abbr !== 'OFF' && theme.abbr !== 'DUAL') {
      console.warn(`Theme ${theme.abbr} still fails ok(); retrying wider candidate scan`);
      const wider = candidates.filter((c) => theme.ok(c))[0];
      if (wider) best = wider;
    }
    const wr = best.wins / Math.max(best.games, 1);
    const preset = toPreset(best.team, byId, {
      id: `ai_${theme.abbr.toLowerCase()}`,
      name: theme.name,
      abbr: theme.abbr,
      blurb: `${theme.blurb} (${best.style}, ${(wr * 100).toFixed(0)}% tourney).`,
    });
    preset.salary = [...preset.lineup.map((s) => s.playerId), ...preset.pitchingStaff, ...preset.bench].reduce(
      (s, id) => s + byId[id].salary,
      0
    );
    picked.push({ team: best.team, preset, wr, style: best.style, runDiff: best.runDiff });
    console.log(
      `Pick ${theme.abbr}: style=${best.style} wr=${(wr * 100).toFixed(1)}% $=${preset.salary} bats=$${batSpend(best)} pits=$${pitSpend(best)} top2P=$${topPitSal(best, 2)}`
    );
  }
  return picked;
}

function writeDocs(board, byId, players, history, tops) {
  const ordered = [...players].sort((a, b) => board[b.id] - board[a.id]);
  const bats = ordered.filter((p) => p.type === 'batter');
  const pits = ordered.filter((p) => p.type === 'pitcher');
  const b9 = bats.slice(0, 9).reduce((s, p) => s + board[p.id], 0);
  const p5 = pits.slice(0, 5).reduce((s, p) => s + board[p.id], 0);
  const bands = [
    [12, 19],
    [20, 29],
    [30, 49],
    [50, 79],
    [80, 119],
    [120, 200],
  ];
  const sals = ordered.map((p) => board[p.id]);
  const bandMd = bands.map(([lo, hi]) => `| $${lo}–${hi} | ${sals.filter((s) => s >= lo && s <= hi).length} |`).join('\n');
  const topMd = ordered
    .slice(0, 20)
    .map((p) => `| ${board[p.id]} | ${p.type} | ${p.name} | ${priorVal(p).toFixed(1)} |`)
    .join('\n');
  const oppMd = tops.map((t) => `- **${t.preset.abbr}** $${t.preset.salary} — ${t.preset.blurb}`).join('\n');

  writeFileSync(
    join(OUT_DIR, 'SALARY_FORMULA.md'),
    `# Salary Market — sim draft + head-to-head

## Principle
Salaries come from a **2-AI draft market** whose prices are heated by **simulated game results**, then remapped so a **$1000** cap bites.

## Method
1. Start everyone near the floor
2. Two AI managers snake-draft under live prices (full roster rules)
3. Those clubs play a short series; winners’ cards get market heat
4. Early/hot picks rise, ignored cards fall — repeat until stable
5. Remap demand → board $ (floor $${FLOOR}, ceil $${CEIL})
6. Draft many candidates under board $; tournament sims pick top AI builds

### Distribution
| Band | Players |
|------|--------:|
${bandMd}

Max **$${Math.max(...sals)}** · median **$${sals[Math.floor(sals.length / 2)]}** · best-9 bats **$${b9}** · best-5 pits **$${p5}**

### Top 20
| $ | Type | Name | Prior |
|---:|---|---|---:|
${topMd}

### AI opponents (sim tournament)
${oppMd}

## Files
- \`tools/sim_economy.mjs\` (market + top builds)
- \`data/salary_market.json\`
- \`game/data/players.json\`
`
  );

  writeFileSync(
    join(OUT_DIR, 'salary_market.json'),
    JSON.stringify(
      {
        meta: {
          method: '2-AI draft demand + H2H sim win credits + $1000 remap',
          cap: CAP,
          floor: FLOOR,
          ceil: CEIL,
          rounds: history.length,
          max: Math.max(...sals),
          median: sals[Math.floor(sals.length / 2)],
          best9_batters: b9,
          best5_pitchers: p5,
          opponents: tops.map((t) => ({
            abbr: t.preset.abbr,
            salary: t.preset.salary,
            style: t.style,
            tourneyWinPct: t.wr,
          })),
        },
        history,
        prices: Object.fromEntries(ordered.map((p) => [p.name, board[p.id]])),
      },
      null,
      2
    ) + '\n'
  );

  writeFileSync(
    join(OUT_DIR, 'salaries.csv'),
    ['name,type,team,salary,prior_value', ...ordered.map((p) => `${p.name},${p.type},${p.team},${board[p.id]},${priorVal(p).toFixed(3)}`)].join(
      '\n'
    ) + '\n'
  );
}

function main() {
  const topsOnly = process.argv.includes('--tops-only');
  const data = JSON.parse(readFileSync(PLAYERS, 'utf8'));
  const players = [
    ...data.batters.map((b) => ({ ...b, type: 'batter' })),
    ...data.pitchers.map((p) => ({ ...p, type: 'pitcher' })),
  ];
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));

  let board;
  let history = [];
  if (topsOnly) {
    console.log('=== tops-only: reuse current board salaries ===');
    board = Object.fromEntries(players.map((p) => [p.id, p.salary || FLOOR]));
  } else {
    console.log('=== 1) AI draft market + sim feedback ===');
    const market = runMarket(data, byId, players);
    board = market.board;
    history = market.history;
  }

  for (const p of players) p.salary = board[p.id];
  for (const b of data.batters) b.salary = board[b.id];
  for (const p of data.pitchers) p.salary = board[p.id];

  console.log('\n=== 2) Tournament → top 5 AI rosters ===');
  const tops = runTournament(data, byId, players, board);

  data.opponents = tops.map((t) => {
    const o = { ...t.preset };
    delete o._val;
    return o;
  });

  writeFileSync(PLAYERS, JSON.stringify(data, null, 2) + '\n');
  writeDocs(board, byId, players, history, tops);

  console.log('\nTop salaries:');
  [...players]
    .sort((a, b) => b.salary - a.salary)
    .slice(0, 12)
    .forEach((p) => console.log(`  $${p.salary}  ${p.type.slice(0, 3)}  ${p.name}`));
  console.log('\nOpponents:', data.opponents.map((o) => `${o.abbr}=$${o.salary}`).join(', '));
  for (const o of data.opponents) {
    console.log(`\n${o.abbr} $${o.salary} — ${o.blurb}`);
    for (const s of o.lineup) {
      const p = byId[s.playerId];
      console.log(`  ${s.pos.padEnd(3)} $${String(p.salary).padStart(3)} ${p.name}`);
    }
    for (const id of o.pitchingStaff) {
      const p = byId[id];
      console.log(`  P   $${String(p.salary).padStart(3)} ${p.name} IP${p.abilities.IP}`);
    }
  }
  console.log('Wrote players.json, salary_market.json, SALARY_FORMULA.md, salaries.csv');
}

main();
