import { GameEngine, DEF_TACTIC_IDS, OFF_TACTIC_IDS, TACTICS } from './engine.js';
import {
  CAP,
  covers,
  emptyDraft,
  draftSpent,
  staffIp,
  validateDraft,
  toPreset,
  rosterPlayerIds,
  salaryOf,
} from './roster.js';
import { simulateGame, simulateMany } from './sim.js';
import { applyAiTactics } from './ai.js';

const OUTCOME_LABEL = {
  SO: 'STRIKEOUT',
  FO: 'FLY OUT',
  GO: 'GROUND OUT',
  BB: 'WALK',
  '1B': 'SINGLE',
  '2B': 'DOUBLE',
  HR: 'HOME RUN',
  SB: 'STOLEN BASE',
  CS: 'CAUGHT STEALING',
  PICKOFF: 'PICKOFF',
};

export class GameUI {
  constructor(root, data) {
    this.root = root;
    this.data = data;
    this.byId = Object.fromEntries([
      ...data.batters.map((b) => [b.id, { ...b, type: 'batter' }]),
      ...data.pitchers.map((p) => [p.id, { ...p, type: 'pitcher' }]),
    ]);
    this.opponents = data.opponents || [];
    this.screen = 'home'; // home | draft | matchup | order | play | sim
    this.draft = emptyDraft();
    this.userPreset = null;
    this.opponent = null;
    this.engine = null;
    this.simSummary = null;
    this.simN = 100;
    this.aiTactics = true; // AI manages away-team tactics (switchable)
    this.showMatrices = false;
    this.subOpen = false;
    this.draftFilter = { q: '', kind: 'batter', pos: 'ALL', sort: 'salary' };
    this._bind();
    this.render();
  }

  _bind() {
    this.root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      const action = t.dataset.action;
      const value = t.dataset.value;
      this._onAction(action, value, t);
    });

    this.root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.filter === 'q') {
        this.draftFilter.q = t.value;
        this.render();
        const el = this.root.querySelector('[data-filter="q"]');
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      } else if (t.dataset.filter === 'sim-n') {
        this.simN = Math.max(1, Math.min(1000, Number(t.value) || 1));
      } else if (t.dataset.field === 'team-name') {
        this.draft.name = t.value || 'My Team';
      } else if (t.dataset.field === 'team-abbr') {
        this.draft.abbr = (t.value || 'YOU').slice(0, 4).toUpperCase();
      }
    });

    this.root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.filter === 'kind') {
        this.draftFilter.kind = t.value;
        this.render();
      } else if (t.dataset.filter === 'pos') {
        this.draftFilter.pos = t.value;
        this.render();
      } else if (t.dataset.filter === 'sort') {
        this.draftFilter.sort = t.value;
        this.render();
      } else if (t.dataset.toggle === 'ai-tactics') {
        this.aiTactics = Boolean(t.checked);
        this.render();
      } else if (t.dataset.toggle === 'show-matrices') {
        this.showMatrices = Boolean(t.checked);
        this.render();
      }
    });
  }

  _onAction(action, value, el) {
    if (action === 'goto') {
      this.screen = value;
      if (value === 'draft' && !this.draft) this.draft = emptyDraft();
      this.render();
      return;
    }
    if (action === 'new-draft') {
      this.draft = emptyDraft();
      this.userPreset = null;
      this.opponent = null;
      this.simSummary = null;
      this.screen = 'draft';
      this.render();
      return;
    }
    if (action === 'load-preset-lad') {
      // quick-start with existing LAD@NYY for testing play UI
      this.userPreset = this.data.presets.home;
      this.opponent = this.data.presets.away;
      this.screen = 'matchup';
      this.render();
      return;
    }
    if (action === 'draft-add-lineup') {
      this._addToLineup(value, el.dataset.slot);
      return;
    }
    if (action === 'draft-add-bench') {
      this._addBench(value);
      return;
    }
    if (action === 'draft-add-pitcher') {
      this._addPitcher(value);
      return;
    }
    if (action === 'draft-clear-slot') {
      const idx = Number(value);
      if (this.draft.lineup[idx]) this.draft.lineup[idx].playerId = null;
      this.render();
      return;
    }
    if (action === 'draft-remove-bench') {
      this.draft.bench = this.draft.bench.filter((id) => id !== value);
      this.render();
      return;
    }
    if (action === 'draft-remove-pitcher') {
      this.draft.pitchingStaff = this.draft.pitchingStaff.filter((id) => id !== value);
      if (this.draft.starterId === value) this.draft.starterId = this.draft.pitchingStaff[0] || null;
      this.render();
      return;
    }
    if (action === 'draft-set-starter') {
      this.draft.starterId = value;
      this.render();
      return;
    }
    if (action === 'draft-fill-slot') {
      // value = playerId, dataset.slotIndex
      const idx = Number(el.dataset.slotIndex);
      this._assignLineup(idx, value);
      return;
    }
    if (action === 'draft-done') {
      const v = validateDraft(this.draft, this.byId);
      if (!v.ok) {
        this._draftErrors = v.errors;
        this.render();
        return;
      }
      this.userPreset = toPreset(this.draft);
      this._draftErrors = null;
      this.screen = 'matchup';
      this.render();
      return;
    }
    if (action === 'pick-opponent') {
      this.opponent = this.opponents.find((o) => o.id === value) || null;
      this.render();
      return;
    }
    if (action === 'goto-order') {
      if (!this.userPreset) return;
      this.screen = 'order';
      this.render();
      return;
    }
    if (action === 'order-up') {
      this._moveBattingOrder(Number(value), Number(value) - 1);
      return;
    }
    if (action === 'order-down') {
      this._moveBattingOrder(Number(value), Number(value) + 1);
      return;
    }
    if (action === 'order-done') {
      this.screen = 'matchup';
      this.render();
      return;
    }
    if (action === 'play-live') {
      if (!this._readyMatchup()) return;
      this._startEngine();
      this.screen = 'play';
      this.render();
      return;
    }
    if (action === 'sim-one') {
      if (!this._readyMatchup()) return;
      const presets = this._presets();
      const r = simulateGame(this.data, presets, { silent: true });
      this.simSummary = {
        mode: 'one',
        games: 1,
        homeWins: r.winner === presets.home.abbr ? 1 : 0,
        awayWins: r.winner === presets.away.abbr ? 1 : 0,
        last: r,
        avgHome: r.home,
        avgAway: r.away,
        results: [{ n: 1, score: `${r.away}-${r.home}`, winner: r.winner, innings: r.innings }],
      };
      this.screen = 'sim';
      this.render();
      return;
    }
    if (action === 'sim-many') {
      if (!this._readyMatchup()) return;
      const n = Math.max(1, Math.min(1000, Number(this.simN) || 100));
      const presets = this._presets();
      this.root.innerHTML = `<div class="panel" style="margin-top:40px;text-align:center">
        <h2>Simulating ${n} games…</h2>
        <p class="muted">No tactics · auto pitching</p>
        <div class="budget-bar"><i style="width:2%"></i></div>
      </div>`;
      // yield so UI paints
      setTimeout(() => {
        const summary = simulateMany(this.data, presets, n, (done, total) => {
          const bar = this.root.querySelector('.budget-bar > i');
          if (bar) bar.style.width = `${(100 * done) / total}%`;
        });
        summary.mode = 'many';
        summary.last = summary.results[summary.results.length - 1];
        this.simSummary = summary;
        this.screen = 'sim';
        this.render();
      }, 30);
      return;
    }
    if (action === 'restart-play') {
      this._startEngine();
      this.render();
      return;
    }
    // live play actions
    if (!this.engine) return;
    if (action === 'noop') {
      return;
    }
    if (action === 'def-tactic') {
      if (this._aiControlsDef()) return;
      this.engine.setDefTactic(this.engine.state.pendingDefTactic === value ? null : value || null);
    } else if (action === 'off-tactic') {
      if (this._aiControlsOff()) return;
      this.engine.setOffTactic(this.engine.state.pendingOffTactic === value ? null : value || null);
    } else if (action === 'steal-target') {
      if (this._aiControlsOff()) return;
      this.engine.setStealTarget(Number(value));
    } else if (action === 'resolve') {
      this._applyAiIfNeeded();
      this.engine.resolvePA();
    } else if (action === 'change-pitcher') {
      // Only allow manual bullpen for the side the player controls (or both when AI off)
      if (this.aiTactics && el.dataset.side === 'away') return;
      this.engine.changePitcher(el.dataset.side, value);
      this.subOpen = false;
      this.render();
    } else if (action === 'open-pitcher-sub') {
      if (this.aiTactics && !this.engine.defenseSide().isHome) return;
      this.subOpen = true;
      this.render();
    } else if (action === 'close-pitcher-sub') {
      this.subOpen = false;
      this.render();
    } else if (action === 'toggle-ai-tactics') {
      this.aiTactics = !this.aiTactics;
      this.subOpen = false;
      this.render();
    } else if (action === 'toggle-matrices') {
      this.showMatrices = !this.showMatrices;
      this.render();
    }
  }

  /** User is always HOME; AI is AWAY when aiTactics is on. */
  _aiControlsDef() {
    return this.aiTactics && !this.engine.defenseSide().isHome;
  }

  _aiControlsOff() {
    return this.aiTactics && !this.engine.offenseSide().isHome;
  }

  _applyAiIfNeeded() {
    if (!this.aiTactics || !this.engine) return;
    applyAiTactics(this.engine, {
      controlDef: this._aiControlsDef(),
      controlOff: this._aiControlsOff(),
    });
  }

  _moveBattingOrder(fromIdx, toIdx) {
    if (!this.userPreset?.lineup) return;
    const lineup = this.userPreset.lineup;
    if (
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= lineup.length ||
      toIdx >= lineup.length ||
      fromIdx === toIdx
    ) {
      return;
    }
    const next = lineup.slice();
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    this.userPreset.lineup = next;
    // Keep draft in sync so Edit roster / re-lock stays consistent
    if (this.draft?.lineup?.length === next.length) {
      this.draft.lineup = next.map((s) => ({ playerId: s.playerId, pos: s.pos }));
    }
    this.render();
  }

  _readyMatchup() {
    return Boolean(this.userPreset && this.opponent);
  }

  _presets() {
    // User is HOME (bats last)
    return { away: this.opponent, home: this.userPreset };
  }

  _startEngine() {
    this.engine = new GameEngine(this.data, this._presets());
    this.subOpen = false;
    this.engine.on(() => this.render());
  }

  _addToLineup(playerId, preferredPos) {
    const p = this.byId[playerId];
    if (!p || p.type !== 'batter') return;
    if (rosterPlayerIds(this.draft).has(playerId)) return;
    const spent = draftSpent(this.draft, this.byId);
    if (spent + salaryOf(p) > CAP) return;

    let idx = -1;
    if (preferredPos) {
      idx = this.draft.lineup.findIndex((s) => s.pos === preferredPos && !s.playerId && covers(p, s.pos));
    }
    if (idx < 0) {
      idx = this.draft.lineup.findIndex((s) => !s.playerId && covers(p, s.pos));
    }
    if (idx < 0) {
      // add to bench if lineup full / no fit
      this._addBench(playerId);
      return;
    }
    this.draft.lineup[idx].playerId = playerId;
    this.render();
  }

  _assignLineup(idx, playerId) {
    const p = this.byId[playerId];
    const slot = this.draft.lineup[idx];
    if (!p || !slot || p.type !== 'batter') return;
    if (!covers(p, slot.pos)) return;
    const used = rosterPlayerIds(this.draft);
    if (used.has(playerId) && slot.playerId !== playerId) return;
    const old = slot.playerId;
    const spent = draftSpent(this.draft, this.byId) - (old ? salaryOf(this.byId[old]) : 0);
    if (spent + salaryOf(p) > CAP) return;
    slot.playerId = playerId;
    this.render();
  }

  _addBench(playerId) {
    const p = this.byId[playerId];
    if (!p || p.type !== 'batter') return;
    if (rosterPlayerIds(this.draft).has(playerId)) return;
    if (draftSpent(this.draft, this.byId) + salaryOf(p) > CAP) return;
    if (rosterPlayerIds(this.draft).size >= 25) return;
    this.draft.bench.push(playerId);
    this.render();
  }

  _addPitcher(playerId) {
    const p = this.byId[playerId];
    if (!p || p.type !== 'pitcher') return;
    if (rosterPlayerIds(this.draft).has(playerId)) return;
    if (draftSpent(this.draft, this.byId) + salaryOf(p) > CAP) return;
    if (rosterPlayerIds(this.draft).size >= 25) return;
    this.draft.pitchingStaff.push(playerId);
    if (!this.draft.starterId) this.draft.starterId = playerId;
    this.render();
  }

  render() {
    if (this.screen === 'home') this.root.innerHTML = this._home();
    else if (this.screen === 'draft') this.root.innerHTML = this._draft();
    else if (this.screen === 'matchup') this.root.innerHTML = this._matchup();
    else if (this.screen === 'order') this.root.innerHTML = this._order();
    else if (this.screen === 'sim') this.root.innerHTML = this._sim();
    else if (this.screen === 'play') this.root.innerHTML = this._play();
  }

  _shell(title, body, actions = '') {
    return `
      <div class="topbar">
        <div class="brand">9-INNING DUEL</div>
        <div class="top-actions">${actions}</div>
      </div>
      ${title ? `<h1 class="screen-title">${title}</h1>` : ''}
      ${body}
    `;
  }

  _home() {
    return this._shell(
      null,
      `
      <section class="hero-home panel">
        <p class="eyebrow">Salary cap $${CAP}</p>
        <h1>Draft. Duel. Simulate.</h1>
        <p class="lede">Build a roster under $${CAP}, challenge one of five AI builds, then play live (AI tactics on by default) or run up to 1000 no-tactic sims.</p>
        <div class="cta-row">
          <button class="btn btn-primary" data-action="new-draft">Start Draft</button>
          <button class="btn btn-ghost" data-action="goto" data-value="matchup" ${this.userPreset ? '' : 'disabled'}>Continue</button>
        </div>
      </section>
      <section class="panel opp-preview">
        <h2>AI opponents waiting</h2>
        <div class="opp-grid">
          ${this.opponents
            .map(
              (o) => `
            <article class="opp-card">
              <div class="opp-abbr">${o.abbr}</div>
              <h3>${o.name}</h3>
              <p>${o.blurb}</p>
              <div class="muted">$${o.salary} · ${o.pitchingStaff.length} arms</div>
            </article>`
            )
            .join('')}
        </div>
      </section>
      `,
      `<button class="btn btn-ghost btn-sm" data-action="goto" data-value="home">Home</button>`
    );
  }

  _draft() {
    const spent = draftSpent(this.draft, this.byId);
    const ip = staffIp(this.draft, this.byId);
    const v = validateDraft(this.draft, this.byId);
    const pct = Math.min(100, (100 * spent) / CAP);
    const used = rosterPlayerIds(this.draft);
    const pool = this._filteredPool(used);

    const emptySlots = this.draft.lineup
      .map((s, i) => ({ ...s, i }))
      .filter((s) => !s.playerId);

    return this._shell(
      'Draft board',
      `
      <div class="draft-budget panel">
        <div class="budget-meta">
          <strong>$${spent}</strong><span class="muted"> / $${CAP}</span>
          <span class="pill">${used.size} players</span>
          <span class="pill">IP ${ip}</span>
          <span class="pill ${v.ok ? 'ok' : 'bad'}">${v.ok ? 'Legal' : 'Incomplete'}</span>
        </div>
        <div class="budget-bar"><i style="width:${pct}%"></i></div>
        <div class="team-name-row">
          <label>Team <input data-field="team-name" value="${this._esc(this.draft.name)}" maxlength="24" /></label>
          <label>Abbr <input data-field="team-abbr" value="${this._esc(this.draft.abbr)}" maxlength="4" style="width:4.5rem" /></label>
        </div>
      </div>

      <div class="draft-layout">
        <section class="panel draft-roster">
          <h2>Lineup</h2>
          <div class="slot-list">
            ${this.draft.lineup
              .map((s, i) => {
                const p = s.playerId ? this.byId[s.playerId] : null;
                return `<div class="slot-row">
                  <span class="slot-pos">${s.pos}</span>
                  ${
                    p
                      ? `<span class="slot-name">${this._esc(p.name)}</span>
                         <span class="slot-sal">$${salaryOf(p)}</span>
                         <button class="btn btn-ghost btn-sm" data-action="draft-clear-slot" data-value="${i}">✕</button>`
                      : `<span class="slot-empty muted">Empty — pick from pool</span>`
                  }
                </div>`;
              })
              .join('')}
          </div>

          <h2>Pitching</h2>
          <div class="slot-list">
            ${
              this.draft.pitchingStaff.length
                ? this.draft.pitchingStaff
                    .map((id) => {
                      const p = this.byId[id];
                      const starter = this.draft.starterId === id;
                      return `<div class="slot-row">
                        <span class="slot-pos">${starter ? 'SP' : 'P'}</span>
                        <span class="slot-name">${this._esc(p.name)} <small class="muted">${p.abilities.IP} IP</small></span>
                        <span class="slot-sal">$${salaryOf(p)}</span>
                        ${starter ? '' : `<button class="btn btn-ghost btn-sm" data-action="draft-set-starter" data-value="${id}">Start</button>`}
                        <button class="btn btn-ghost btn-sm" data-action="draft-remove-pitcher" data-value="${id}">✕</button>
                      </div>`;
                    })
                    .join('')
                : `<div class="muted">No pitchers yet</div>`
            }
          </div>

          <h2>Bench</h2>
          <div class="slot-list">
            ${
              this.draft.bench.length
                ? this.draft.bench
                    .map((id) => {
                      const p = this.byId[id];
                      return `<div class="slot-row">
                        <span class="slot-pos">BN</span>
                        <span class="slot-name">${this._esc(p.name)}</span>
                        <span class="slot-sal">$${salaryOf(p)}</span>
                        <button class="btn btn-ghost btn-sm" data-action="draft-remove-bench" data-value="${id}">✕</button>
                      </div>`;
                    })
                    .join('')
                : `<div class="muted">No bench bats</div>`
            }
          </div>

          ${
            (this._draftErrors || v.errors).length
              ? `<div class="draft-errors">${(this._draftErrors || v.errors).map((e) => `<div>• ${this._esc(e)}</div>`).join('')}</div>`
              : ''
          }

          <div class="cta-row" style="margin-top:12px">
            <button class="btn btn-primary" data-action="draft-done" ${v.ok ? '' : 'disabled'}>Lock roster</button>
            <button class="btn btn-ghost" data-action="goto" data-value="home">Back</button>
          </div>
        </section>

        <section class="panel draft-pool">
          <h2>Player pool</h2>
          <div class="pool-filters">
            <input data-filter="q" placeholder="Search name…" value="${this._esc(this.draftFilter.q)}" />
            <select data-filter="kind">
              <option value="batter" ${this.draftFilter.kind === 'batter' ? 'selected' : ''}>Batters</option>
              <option value="pitcher" ${this.draftFilter.kind === 'pitcher' ? 'selected' : ''}>Pitchers</option>
            </select>
            <select data-filter="pos" ${this.draftFilter.kind !== 'batter' ? 'disabled' : ''}>
              <option value="ALL">Any pos</option>
              ${['C', '1B', '2B', '3B', 'SS', 'OF', 'DH']
                .map((p) => `<option value="${p}" ${this.draftFilter.pos === p ? 'selected' : ''}>${p}</option>`)
                .join('')}
            </select>
            <select data-filter="sort">
              <option value="salary" ${this.draftFilter.sort === 'salary' ? 'selected' : ''}>$ high</option>
              <option value="salary-asc" ${this.draftFilter.sort === 'salary-asc' ? 'selected' : ''}>$ low</option>
              <option value="name" ${this.draftFilter.sort === 'name' ? 'selected' : ''}>Name</option>
            </select>
          </div>
          <div class="pool-list">
            ${pool
              .slice(0, 80)
              .map((p) => this._poolRow(p, emptySlots))
              .join('') || `<div class="muted">No matches</div>`}
          </div>
          <p class="muted hint">Showing ${Math.min(80, pool.length)} of ${pool.length}. Add fills the first open eligible slot.</p>
        </section>
      </div>
      `,
      `<button class="btn btn-ghost btn-sm" data-action="goto" data-value="home">Home</button>`
    );
  }

  _poolRow(p, emptySlots) {
    const isP = p.type === 'pitcher';
    const meta = isP
      ? `${p.hand}HP · ${p.abilities.IP} IP · ${p.team}`
      : `${(p.positions || []).join('/')} · ${p.hand} · ${p.team}`;
    const fit = emptySlots.filter((s) => covers(p, s.pos));
    const addAction = isP ? 'draft-add-pitcher' : 'draft-add-lineup';
    return `<div class="pool-row">
      <div class="pool-main">
        <div class="pool-name">${this._esc(p.name)}</div>
        <div class="pool-meta muted">${meta}</div>
      </div>
      <div class="pool-sal">$${salaryOf(p)}</div>
      <div class="pool-actions">
        <button class="btn btn-primary btn-sm" data-action="${addAction}" data-value="${p.id}" ${!isP && fit[0] ? `data-slot="${fit[0].pos}"` : ''}>
          ${isP ? 'Staff' : fit.length ? `→ ${fit[0].pos}` : 'Bench'}
        </button>
        ${
          !isP
            ? `<button class="btn btn-ghost btn-sm" data-action="draft-add-bench" data-value="${p.id}">BN</button>`
            : ''
        }
      </div>
    </div>`;
  }

  _filteredPool(used) {
    const q = this.draftFilter.q.trim().toLowerCase();
    const kind = this.draftFilter.kind;
    const pos = this.draftFilter.pos;
    let list = kind === 'pitcher' ? this.data.pitchers : this.data.batters;
    list = list
      .map((p) => this.byId[p.id])
      .filter((p) => !used.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.team || '').toLowerCase().includes(q))
      .filter((p) => {
        if (kind !== 'batter' || pos === 'ALL') return true;
        return covers(p, pos);
      });

    if (this.draftFilter.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (this.draftFilter.sort === 'salary-asc') list.sort((a, b) => salaryOf(a) - salaryOf(b) || a.name.localeCompare(b.name));
    else list.sort((a, b) => salaryOf(b) - salaryOf(a) || a.name.localeCompare(b.name));
    return list;
  }

  _matchup() {
    if (!this.userPreset) {
      return this._shell(
        'Matchup',
        `<div class="panel"><p>Draft a roster first.</p><button class="btn btn-primary" data-action="new-draft">Start Draft</button></div>`
      );
    }
    const youSpent = this.userPreset
      ? [...this.userPreset.lineup.map((x) => x.playerId), ...this.userPreset.pitchingStaff, ...this.userPreset.bench]
          .map((id) => salaryOf(this.byId[id]))
          .reduce((a, b) => a + b, 0)
      : 0;

    return this._shell(
      'Choose opponent',
      `
      <div class="match-grid">
        <section class="panel">
          <h2>You (HOME)</h2>
          <div class="opp-abbr">${this._esc(this.userPreset.abbr)}</div>
          <p>${this._esc(this.userPreset.name)} · $${youSpent}</p>
          ${this._rosterGlance(this.userPreset)}
          <div class="you-actions">
            <button class="btn btn-ghost btn-sm" data-action="goto-order">Set batting order</button>
            <button class="btn btn-ghost btn-sm" data-action="goto" data-value="draft">Edit roster</button>
          </div>
        </section>
        <section class="panel">
          <h2>AI (AWAY)</h2>
          <div class="opp-grid compact">
            ${this.opponents
              .map((o) => {
                const on = this.opponent?.id === o.id;
                return `<button class="opp-card pick ${on ? 'selected' : ''}" data-action="pick-opponent" data-value="${o.id}">
                  <div class="opp-abbr">${o.abbr}</div>
                  <h3>${this._esc(o.name)}</h3>
                  <p>${this._esc(o.blurb)}</p>
                  <div class="muted">$${o.salary}</div>
                </button>`;
              })
              .join('')}
          </div>
          ${this.opponent ? this._rosterGlance(this.opponent) : '<p class="muted">Pick an AI build</p>'}
        </section>
      </div>

      <section class="panel mode-panel">
        <h2>How do you want to play?</h2>
        <p class="muted">Simulation uses <strong>no tactics</strong>. Live play: AI manages away tactics (toggleable).</p>
        <div class="mode-row">
          <button class="btn btn-primary" data-action="play-live" ${this.opponent ? '' : 'disabled'}>Play live</button>
          <button class="btn btn-ghost" data-action="sim-one" ${this.opponent ? '' : 'disabled'}>Quick sim (1 game)</button>
        </div>
        <div class="mode-row sim-many-row">
          <label>Multi-sim <input data-filter="sim-n" type="number" min="1" max="1000" value="${this.simN}" /> games (max 1000)</label>
          <button class="btn btn-ghost" data-action="sim-many" ${this.opponent ? '' : 'disabled'}>Run sims</button>
        </div>
      </section>
      `,
      `<button class="btn btn-ghost btn-sm" data-action="goto" data-value="home">Home</button>`
    );
  }

  _rosterGlance(preset) {
    const bats = preset.lineup
      .map((s, i) => {
        const p = this.byId[s.playerId];
        return `<div class="glance-row"><span class="ord">${i + 1}</span><span>${s.pos}</span><span>${this._esc(p?.name || '?')}</span><span>$${salaryOf(p)}</span></div>`;
      })
      .join('');
    const pits = preset.pitchingStaff
      .map((id) => {
        const p = this.byId[id];
        const star = id === preset.starterId ? '★ ' : '';
        return `<div class="glance-row"><span class="ord"></span><span>P</span><span>${star}${this._esc(p?.name || '?')}</span><span>$${salaryOf(p)}</span></div>`;
      })
      .join('');
    return `<div class="roster-glance">${bats}<hr/>${pits}</div>`;
  }

  _order() {
    if (!this.userPreset) {
      return this._shell(
        'Batting order',
        `<div class="panel"><p>Draft a roster first.</p><button class="btn btn-primary" data-action="new-draft">Start Draft</button></div>`
      );
    }

    const rows = this.userPreset.lineup
      .map((slot, i) => {
        const p = this.byId[slot.playerId];
        const a = p?.abilities || {};
        return `
          <div class="order-row">
            <div class="order-num">${i + 1}</div>
            <div class="order-pos">${slot.pos}</div>
            <div class="order-main">
              <div class="order-name">${this._esc(p?.name || '?')}</div>
              <div class="order-meta muted">${p?.hand || '?'} · H ${a.H ?? '—'} · HR ${a.HR ?? '—'} · SPD ${a.SPD ?? '—'} · $${salaryOf(p)}</div>
            </div>
            <div class="order-moves">
              <button class="btn btn-ghost btn-sm" data-action="order-up" data-value="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
              <button class="btn btn-ghost btn-sm" data-action="order-down" data-value="${i}" ${i === this.userPreset.lineup.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
            </div>
          </div>`;
      })
      .join('');

    return this._shell(
      'Set batting order',
      `
      <section class="panel order-panel">
        <p class="lede-sm">Arrange hitters 1–9. Each batter keeps their defensive position.</p>
        <div class="order-list">${rows}</div>
        <div class="order-actions">
          <button class="btn btn-primary" data-action="order-done">Done</button>
          <button class="btn btn-ghost" data-action="goto" data-value="matchup">Back</button>
        </div>
      </section>
      `,
      `<button class="btn btn-ghost btn-sm" data-action="goto" data-value="matchup">Matchup</button>`
    );
  }

  _sim() {
    const s = this.simSummary;
    if (!s) return this._shell('Sim', `<div class="panel">No results.</div>`);
    const you = this.userPreset.abbr;
    const opp = this.opponent.abbr;
    const headline =
      s.mode === 'one'
        ? s.last?.winner === you
          ? 'You win'
          : s.last?.winner === opp
            ? 'AI wins'
            : 'Incomplete'
        : `${you} ${s.homeWins} – ${s.awayWins} ${opp}`;

    return this._shell(
      'Simulation',
      `
      <section class="panel sim-hero">
        <h2>${headline}</h2>
        <p class="muted">${s.games} game${s.games > 1 ? 's' : ''} · no tactics · you bat last (HOME)</p>
        ${
          s.mode === 'one'
            ? `<p class="sim-score">${opp} ${s.last.away} – ${s.last.home} ${you} · ${s.last.innings} inn</p>`
            : `<div class="sim-stats">
                <div><strong>${s.homeWins}</strong><span>Your wins</span></div>
                <div><strong>${s.awayWins}</strong><span>AI wins</span></div>
                <div><strong>${s.avgHome.toFixed(1)}</strong><span>Your R/G</span></div>
                <div><strong>${s.avgAway.toFixed(1)}</strong><span>AI R/G</span></div>
                <div><strong>${(s.avgHome - s.avgAway).toFixed(1)}</strong><span>Run diff</span></div>
                <div><strong>${s.forfeits || 0}</strong><span>Forfeits</span></div>
              </div>`
        }
      </section>
      ${
        s.results?.length
          ? `<section class="panel">
              <h2>Sample games</h2>
              <div class="sim-table">
                ${s.results
                  .map(
                    (r) =>
                      `<div class="sim-row"><span>#${r.n}</span><span>${opp} ${r.score.split('-')[0]} – ${r.score.split('-')[1]} ${you}</span><span>${r.winner || '—'}</span></div>`
                  )
                  .join('')}
              </div>
            </section>`
          : ''
      }
      <div class="cta-row">
        <button class="btn btn-primary" data-action="goto" data-value="matchup">Back to matchup</button>
        <button class="btn btn-ghost" data-action="sim-many">Run again</button>
        <button class="btn btn-ghost" data-action="play-live">Play live</button>
      </div>
      `,
      `<button class="btn btn-ghost btn-sm" data-action="goto" data-value="home">Home</button>`
    );
  }

  _play() {
    const s = this.engine.state;
    const batter = this.engine.currentBatter();
    const pitcher = this.engine.currentPitcher();
    const offense = this.engine.offenseSide();
    const defense = this.engine.defenseSide();
    const hl = this._highlightCell(s.lastResult);
    const aiDef = this._aiControlsDef();
    const aiOff = this._aiControlsOff();
    const userIsDef = defense.isHome;
    const showBullpen = !this.aiTactics || userIsDef;
    const defenseKey = defense.isHome ? 'home' : 'away';

    return `
      <div class="topbar">
        <div class="brand">9-INNING DUEL</div>
        <div class="top-actions">
          <button class="btn btn-ghost btn-sm" data-action="goto" data-value="matchup">Matchup</button>
          <button class="btn btn-ghost btn-sm" data-action="restart-play">New Game</button>
        </div>
      </div>

      <div class="play-stage">
        ${this._rosterRail(s.away, 'OPP', 'away', s)}
        <div class="play-center">
          <div class="play-header">
            <div class="bases-row compact">
              ${this._diamond(s)}
              <div class="bases-meta">
                <div class="at-bat-chip">${s.half === 'top' ? '▲' : '▼'} ${offense.isHome ? s.home.abbr : 'OPP'} batting</div>
                <div><span class="muted">1B</span> ${this._esc(s.bases[0]?.name?.split(',')[0] || '—')}</div>
                <div><span class="muted">2B</span> ${this._esc(s.bases[1]?.name?.split(',')[0] || '—')}</div>
                <div><span class="muted">3B</span> ${this._esc(s.bases[2]?.name?.split(',')[0] || '—')}</div>
              </div>
            </div>
            <div class="score-strip">
              <div class="score-team away">
                <span class="abbr">OPP</span>
                <span class="runs">${s.away.score}</span>
              </div>
              <div class="score-mid">
                <div class="inning-label">${s.half === 'top' ? '▲' : '▼'} ${s.inning}</div>
                <div class="outs-row">
                  <span class="out-circle ${s.outs >= 1 ? 'on' : ''}" aria-hidden="true"></span>
                  <span class="out-circle ${s.outs >= 2 ? 'on' : ''}" aria-hidden="true"></span>
                  <span class="out-circle ${s.outs >= 3 ? 'on' : ''}" aria-hidden="true"></span>
                </div>
              </div>
              <div class="score-team home">
                <span class="runs">${s.home.score}</span>
                <span class="abbr">${s.home.abbr}</span>
              </div>
            </div>
          </div>

          <div class="main-simple">
            <div class="matrices panel">
              <div class="matchup-simple">
                ${this._playerCard('P', pitcher.player, true, pitcher.entry, hl?.source === 'pitcher' ? hl : null)}
                ${this._playerCard('BAT', batter.player, false, null, hl?.source === 'batter' ? hl : null)}
              </div>
              <label class="toggle-row matrices-toggle">
                <input type="checkbox" data-toggle="show-matrices" ${this.showMatrices ? 'checked' : ''} />
                <span>Show matrices</span>
              </label>
              <div class="result ${s.lastResult ? 'show' : ''}">
                ${s.lastResult ? this._resultHtml(s.lastResult) : '<span class="muted">Pick your tactic, then Resolve</span>'}
              </div>
            </div>

            <div class="controls panel">
              <div class="controls-head">
                <label class="toggle-row ai-toggle">
                  <input type="checkbox" data-toggle="ai-tactics" ${this.aiTactics ? 'checked' : ''} />
                  <span>AI tactics <small>${this.aiTactics ? '(OPP)' : '(off — both sides)'}</small></span>
                </label>
              </div>

              <div class="tactics-grid ${this.aiTactics ? 'single' : ''}">
                ${this._tacticCol('def', defense.isHome ? defense.abbr : 'OPP', aiDef, s)}
                ${this._tacticCol('off', offense.isHome ? offense.abbr : 'OPP', aiOff, s)}
              </div>

              <div class="actions">
                <button class="btn btn-primary btn-resolve" data-action="resolve" ${s.phase !== 'tactics' ? 'disabled' : ''}>
                  Resolve PA
                </button>
                ${
                  showBullpen
                    ? `<button class="btn btn-ghost btn-sub" data-action="open-pitcher-sub" ${s.phase !== 'tactics' ? 'disabled' : ''}>Pitcher Sub</button>`
                    : `<span class="muted sub-note">AI manages OPP pitching</span>`
                }
              </div>
            </div>
          </div>

          <div class="panel boxscore">
            <div class="boxscore-head">
              <h2>Linescore</h2>
            </div>
            ${this._linescore(s)}
            <div class="log compact">
              ${
                s.log.slice(0, 10).map((e) => `<div class="entry ${e.kind}">${this._esc(e.msg)}</div>`).join('') ||
                '<div class="entry">Resolve a PA to start the log.</div>'
              }
            </div>
          </div>
        </div>
        ${this._rosterRail(s.home, s.home.abbr, 'home', s)}
      </div>

      ${showBullpen && this.subOpen ? this._pitcherSubModal(defense, defenseKey) : ''}

      <div class="gameover ${s.phase === 'gameover' ? 'show' : ''}">
        <div class="box">
          <h1>${this._esc(s.winner || '')} WINS</h1>
          <p>Final · OPP ${s.away.score} – ${s.home.score} ${s.home.abbr}</p>
          ${s.forfeit ? `<p class="hint">Forfeit: ${this._esc(s.forfeit)} out of pitchers</p>` : ''}
          <button class="btn btn-primary" data-action="restart-play" style="margin-top:12px">Play Again</button>
          <button class="btn btn-ghost" data-action="goto" data-value="matchup" style="margin-top:8px">Matchup</button>
        </div>
      </div>
    `;
  }

  _rosterRail(side, label, sideKey, s) {
    const isBatting = (s.half === 'top' && !side.isHome) || (s.half === 'bottom' && side.isHome);
    const due = side.battingOrderIndex % side.lineup.length;
    const pit = this.engine.pitchers[side.activePitcherId];
    const entry = side.staff.find((x) => x.playerId === side.activePitcherId);
    const pitMeta = pit
      ? `${pit.hand}HP · IP ${entry?.ipUsed ?? 0}/${pit.abilities.IP}`
      : '—';

    const rows = side.lineup
      .map((slot, i) => {
        const p = this.engine.batters[slot.playerId];
        const short = p?.name?.split(',')[0] || '?';
        const on = isBatting && i === due;
        return `
          <div class="rail-bat ${on ? 'due' : ''}">
            <span class="rail-ord">${i + 1}</span>
            <span class="rail-pos">${slot.pos}</span>
            <span class="rail-name">${this._esc(short)}</span>
          </div>`;
      })
      .join('');

    return `
      <aside class="roster-rail ${sideKey}">
        <div class="rail-head">${label}</div>
        <div class="rail-pitcher">
          <span class="muted">P</span>
          <span class="rail-pit-meta">${pitMeta}</span>
        </div>
        <div class="rail-lineup">${rows}</div>
      </aside>`;
  }

  _pitcherSubModal(defense, defenseKey) {
    const arms = this.engine.availablePitchers(defenseKey);
    const options = arms
      .map((p, idx) => {
        const a = this.engine.getPitcher(p.playerId)?.abilities || {};
        const label = `${p.hand || '?'}HP · IP ${p.ipUsed}/${p.ipMax}`;
        const stats = `K ${a.K ?? '—'} · BB ${a.BB ?? '—'} · HR ${a.HR ?? '—'}`;
        return `
          <button class="sub-arm ${p.active ? 'active' : ''}" data-action="change-pitcher" data-side="${defenseKey}" data-value="${p.playerId}" ${p.active || !p.available || p.remaining <= 0 ? 'disabled' : ''}>
            <span class="sub-arm-title">${p.active ? 'Active' : `Arm ${idx + 1}`}</span>
            <span class="sub-arm-meta">${label}</span>
            <span class="sub-arm-stats muted">${stats}</span>
          </button>`;
      })
      .join('');

    return `
      <div class="sub-modal" data-action="close-pitcher-sub">
        <div class="sub-sheet" data-action="noop">
          <div class="sub-sheet-head">
            <h3>Pitcher Sub · ${defense.abbr}</h3>
            <button class="btn btn-ghost btn-sm" data-action="close-pitcher-sub">Close</button>
          </div>
          <p class="muted sub-hint">Names hidden — pick by arm / IP / stuff.</p>
          <div class="sub-arm-list">${options || '<p class="muted">No arms available</p>'}</div>
        </div>
      </div>`;
  }

  _tacticCol(side, abbr, aiLocked, s) {
    const isDef = side === 'def';
    const pending = isDef ? s.pendingDefTactic : s.pendingOffTactic;
    const ids = isDef ? DEF_TACTIC_IDS : OFF_TACTIC_IDS;
    const action = isDef ? 'def-tactic' : 'off-tactic';
    const title = isDef ? 'DEF' : 'OFF';

    if (aiLocked) {
      const last = s.lastResult;
      const lastId = last ? (isDef ? last.defTactic : last.offTactic) : null;
      const lastName = lastId ? TACTICS[lastId]?.name || lastId : null;
      return `
        <div class="tactic-col ai-locked">
          <h3>${title} · ${abbr} <span class="ai-badge">AI</span></h3>
          <div class="ai-tactic-status">
            <div class="ai-pending">Chooses on Resolve</div>
            ${lastName ? `<div class="ai-last muted">Last: ${lastName}</div>` : ''}
          </div>
        </div>`;
    }

    return `
      <div class="tactic-col">
        <h3>${title} · ${abbr}${!this.aiTactics ? '' : ' <span class="you-badge">YOU</span>'}</h3>
        <div class="tactic-list">
          <button class="tactic-btn ${!pending ? 'selected' : ''}" data-action="${action}" data-value="" ${s.phase !== 'tactics' ? 'disabled' : ''}>None</button>
          ${ids
            .map((id) => {
              const tac = TACTICS[id];
              let disabled = s.phase !== 'tactics';
              let note = '';
              if (!isDef && id === 'steal' && !this.engine.canPlaySteal()) {
                disabled = true;
                note = 'n/a';
              }
              if (!isDef && id === 'sacfly' && !this.engine.canPlaySacFly()) {
                disabled = true;
                note = 'n/a';
              }
              const mod =
                tac.d2Mod != null
                  ? ` <small>D2 ${tac.d2Mod > 0 ? '+' : ''}${tac.d2Mod}</small>`
                  : '';
              return `<button class="tactic-btn ${pending === id ? 'selected' : ''}" data-action="${action}" data-value="${id}" ${disabled ? 'disabled' : ''}>
                ${tac.name}${note ? `<small>${note}</small>` : mod}
              </button>`;
            })
            .join('')}
        </div>
        ${
          !isDef && pending === 'steal'
            ? `<div class="steal-target">
                <span>Target</span>
                <button class="${s.stealTarget === 2 ? 'on' : ''}" data-action="steal-target" data-value="2" ${!s.bases[0] || s.bases[1] ? 'disabled' : ''}>2B</button>
                <button class="${s.stealTarget === 3 ? 'on' : ''}" data-action="steal-target" data-value="3" ${!s.bases[1] || s.bases[2] ? 'disabled' : ''}>3B</button>
              </div>`
            : ''
        }
      </div>`;
  }

  _esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  _highlightCell(result) {
    if (!result || result.d1 == null || result.d2 == null) return null;
    if (result.matrixSource !== 'pitcher' && result.matrixSource !== 'batter') return null;
    const row = result.d1 <= 10 ? result.d1 - 1 : result.d1 - 11;
    return { source: result.matrixSource, row, col: result.d2 - 1 };
  }

  _linescore(s) {
    const maxInn = Math.max(9, s.inning);
    const inns = Array.from({ length: maxInn }, (_, i) => i);
    const row = (side) =>
      inns
        .map((i) => {
          let show = '';
          if (i + 1 > s.inning) show = '';
          else if (i + 1 === s.inning && s.half === 'top' && side.isHome) show = '';
          else show = side.inningRuns[i] || 0;
          return `<td>${show}</td>`;
        })
        .join('');

    return `
      <div class="linescore">
        <table>
          <thead>
            <tr>
              <th></th>
              ${inns.map((i) => `<th>${i + 1}</th>`).join('')}
              <th>R</th><th>H</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="team">OPP</td>
              ${row(s.away)}
              <td><strong>${s.away.score}</strong></td>
              <td>${s.away.hits}</td>
            </tr>
            <tr>
              <td class="team">${s.home.abbr}</td>
              ${row(s.home)}
              <td><strong>${s.home.score}</strong></td>
              <td>${s.home.hits}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  _diamond(s) {
    return `
      <div class="diamond">
        <div class="base b1 ${s.bases[0] ? 'occupied' : ''}"><span>1</span></div>
        <div class="base b2 ${s.bases[1] ? 'occupied' : ''}"><span>2</span></div>
        <div class="base b3 ${s.bases[2] ? 'occupied' : ''}"><span>3</span></div>
        <div class="base hp"><span>HP</span></div>
      </div>
    `;
  }

  _playerCard(role, player, isPitcher, entry, hl) {
    if (!player) return `<div class="card"><div class="name">—</div></div>`;
    const a = player.abilities;
    const meta = isPitcher
      ? `IP ${entry?.ipUsed ?? 0}/${a.IP}`
      : `${player.positions.join('/')} · ${player.hand} · SPD ${a.SPD}`;

    const pills = isPitcher
      ? `<div class="stat-pills">
          <span class="pill">K ${a.K}</span>
          <span class="pill">BB ${a.BB}</span>
          <span class="pill">HR ${a.HR}</span>
          <span class="pill">IP ${a.IP}</span>
        </div>`
      : `<div class="stat-pills">
          <span class="pill">H ${a.H}</span>
          <span class="pill">2B ${a['2B']}</span>
          <span class="pill">HR ${a.HR}</span>
          <span class="pill">BB ${a.BB}</span>
          <span class="pill">K ${a.K}</span>
        </div>`;

    let matrix = '';
    if (this.showMatrices || hl) {
      matrix = `<div class="matrix">${player.matrix
        .map((row, ri) =>
          row
            .map((c, ci) => {
              const on = hl && hl.row === ri && hl.col === ci ? ' hl' : '';
              const label = c === '1B' ? '1' : c === '2B' ? '2' : c[0];
              return `<i class="${c}${on}">${label}</i>`;
            })
            .join('')
        )
        .join('')}</div>`;
    }

    return `
      <div class="card">
        <div class="role">${role}</div>
        <div class="name">${isPitcher ? `${player.hand}HP` : this._esc(player.name)}</div>
        <div class="meta">${meta}</div>
        ${pills}
        ${matrix}
      </div>
    `;
  }

  _resultHtml(r) {
    const label = OUTCOME_LABEL[r.finalResult] || r.finalResult;
    const defName = r.defTactic ? TACTICS[r.defTactic]?.name || r.defTactic : 'None';
    const offName = r.offTactic ? TACTICS[r.offTactic]?.name || r.offTactic : 'None';
    const details = (r.detail || []).slice(0, 4);
    return `
      <div class="code">${this._esc(label)}</div>
      <div class="dice">
        ${r.d1 != null ? `D1 ${r.d1}` : ''}
        ${r.d2Raw != null ? ` · D2 ${r.d2Raw}${r.d2 !== r.d2Raw ? ` → ${r.d2}` : ''}` : ''}
        ${r.matrixSource ? ` · ${r.matrixSource}` : ''}
      </div>
      <div class="tactic-used muted">DEF ${this._esc(defName)} · OFF ${this._esc(offName)}</div>
      ${
        details.length
          ? `<ul class="result-detail">${details.map((d) => `<li>${this._esc(d)}</li>`).join('')}</ul>`
          : ''
      }
      ${r.restartAtBat ? '<p class="hint">At-bat restarts</p>' : ''}
    `;
  }
}
