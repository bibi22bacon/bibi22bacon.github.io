/** Roster / draft helpers for 9-Inning Duel. */

export const CAP = 1000;
export const MIN_ROSTER = 12;
export const MAX_ROSTER = 25;
export const LINEUP_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'OF', 'OF', 'DH'];

export function covers(player, slot) {
  if (!player || player.type === 'pitcher') return false;
  if (slot === 'DH') return true;
  if (slot === 'OF') return (player.positions || []).includes('OF');
  return (player.positions || []).includes(slot);
}

export function emptyDraft(teamName = 'My Team', abbr = 'YOU') {
  return {
    id: 'user',
    name: teamName,
    abbr,
    lineup: LINEUP_SLOTS.map((pos) => ({ pos, playerId: null })),
    pitchingStaff: [],
    starterId: null,
    bench: [],
  };
}

export function rosterPlayerIds(draft) {
  const ids = new Set();
  for (const s of draft.lineup) if (s.playerId) ids.add(s.playerId);
  for (const id of draft.pitchingStaff) ids.add(id);
  for (const id of draft.bench) ids.add(id);
  return ids;
}

export function salaryOf(player) {
  return Math.max(1, Number(player?.salary) || 1);
}

export function draftSpent(draft, byId) {
  let n = 0;
  for (const id of rosterPlayerIds(draft)) {
    n += salaryOf(byId[id]);
  }
  return n;
}

export function staffIp(draft, byId) {
  return draft.pitchingStaff.reduce((sum, id) => sum + (byId[id]?.abilities?.IP || 0), 0);
}

/**
 * @returns {{ok:boolean, errors:string[], warnings:string[]}}
 */
export function validateDraft(draft, byId) {
  const errors = [];
  const warnings = [];
  const ids = rosterPlayerIds(draft);
  const size = ids.size;

  if (size < MIN_ROSTER) errors.push(`Need at least ${MIN_ROSTER} players (have ${size}).`);
  if (size > MAX_ROSTER) errors.push(`Max roster is ${MAX_ROSTER} (have ${size}).`);

  const spent = draftSpent(draft, byId);
  if (spent > CAP) errors.push(`Over salary cap: $${spent} / $${CAP}.`);

  for (const slot of draft.lineup) {
    if (!slot.playerId) {
      errors.push(`Lineup slot ${slot.pos} is empty.`);
      continue;
    }
    const p = byId[slot.playerId];
    if (!p) errors.push(`Missing player for ${slot.pos}.`);
    else if (!covers(p, slot.pos)) errors.push(`${p.name} cannot play ${slot.pos}.`);
  }

  if (draft.pitchingStaff.length < 1) errors.push('Add at least one pitcher.');
  const ip = staffIp(draft, byId);
  if (ip <= 9) errors.push(`Pitching IP must be > 9 (have ${ip}).`);

  if (!draft.starterId || !draft.pitchingStaff.includes(draft.starterId)) {
    errors.push('Pick a starting pitcher from your staff.');
  }

  // Duplicate check
  if (ids.size !== draft.lineup.filter((s) => s.playerId).length + draft.pitchingStaff.length + draft.bench.length) {
    errors.push('Duplicate players on roster.');
  }

  if (spent < CAP * 0.5) warnings.push(`Lots of cap left ($${CAP - spent}).`);

  return { ok: errors.length === 0, errors, warnings, spent, ip, size };
}

export function toPreset(draft) {
  return {
    id: draft.id,
    name: draft.name,
    abbr: draft.abbr,
    lineup: draft.lineup.map((s) => ({ playerId: s.playerId, pos: s.pos })),
    pitchingStaff: [...draft.pitchingStaff],
    starterId: draft.starterId,
    bench: [...draft.bench],
  };
}
