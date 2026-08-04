import { GameEngine, DEF_TACTIC_IDS, OFF_TACTIC_IDS, TACTICS } from './engine.js';

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
    this.engine = new GameEngine(data, data.presets);
    this.engine.on(() => this.render());
    this._bind();
    this.render();
  }

  _bind() {
    this.root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      const action = t.dataset.action;
      const value = t.dataset.value;

      if (action === 'def-tactic') {
        this.engine.setDefTactic(this.engine.state.pendingDefTactic === value ? null : value);
      } else if (action === 'off-tactic') {
        this.engine.setOffTactic(this.engine.state.pendingOffTactic === value ? null : value);
      } else if (action === 'steal-target') {
        this.engine.setStealTarget(Number(value));
      } else if (action === 'resolve') {
        this.engine.resolvePA();
      } else if (action === 'change-pitcher') {
        const side = t.dataset.side;
        this.engine.changePitcher(side, value);
      } else if (action === 'restart') {
        this.engine = new GameEngine(this.data, this.data.presets);
        this.engine.on(() => this.render());
        this.render();
      }
    });
  }

  render() {
    const s = this.engine.state;
    const batter = this.engine.currentBatter();
    const pitcher = this.engine.currentPitcher();
    const offense = this.engine.offenseSide();
    const defense = this.engine.defenseSide();

    this.root.innerHTML = `
      <div class="brand">9-Inning Duel · Hotseat</div>
      ${this._scoreboard(s)}
      <div class="linescore panel" style="margin-top:12px">${this._linescore(s)}</div>

      <div class="main">
        <div class="left">
          <div class="panel">
            <h2>Field</h2>
            <div class="diamond-wrap">
              ${this._diamond(s)}
              <div>
                <div class="runner-chip"><strong>1B:</strong> ${s.bases[0]?.name || '—'}</div>
                <div class="runner-chip"><strong>2B:</strong> ${s.bases[1]?.name || '—'}</div>
                <div class="runner-chip"><strong>3B:</strong> ${s.bases[2]?.name || '—'}</div>
                <div class="runner-chip" style="margin-top:14px"><strong>Outs:</strong> ${s.outs}</div>
                <div class="runner-chip"><strong>At bat:</strong> ${offense.abbr}</div>
              </div>
            </div>

            <div class="matchup">
              ${this._playerCard('Pitcher (DEF)', pitcher.player, true, pitcher.entry)}
              <div class="vs">VS</div>
              ${this._playerCard(`Batter #${batter.orderIndex + 1}`, batter.player, false)}
            </div>

            <div class="result ${s.lastResult ? 'show' : ''}" id="result">
              ${s.lastResult ? this._resultHtml(s.lastResult) : ''}
            </div>
          </div>

          <div class="panel" style="margin-top:12px">
            <h2>Play Log</h2>
            <div class="log">
              ${s.log.map((e) => `<div class="entry ${e.kind}">${e.msg}</div>`).join('') || '<div class="entry">Game start — LAD @ NYY. Play tactics, then Resolve PA.</div>'}
            </div>
          </div>
        </div>

        <div class="right">
          <div class="panel">
            <h2>Tactic Cards ${s.phase === 'gameover' ? '(Game Over)' : ''}</h2>
            <p class="hint" style="margin-top:0">Hotseat: defense picks first, then offense. Select at most one each (or none), then Resolve.</p>
            <div class="tactics-grid">
              <div class="tactic-col">
                <h3>Defense · ${defense.abbr}</h3>
                <div class="tactic-list">
                  <button class="tactic-btn ${!s.pendingDefTactic ? 'selected' : ''}" data-action="def-tactic" data-value="" ${s.phase !== 'tactics' ? 'disabled' : ''}>
                    No tactic
                  </button>
                  ${DEF_TACTIC_IDS.map((id) => {
                    const tac = TACTICS[id];
                    const disabled = s.phase !== 'tactics';
                    return `<button class="tactic-btn ${s.pendingDefTactic === id ? 'selected' : ''}" data-action="def-tactic" data-value="${id}" ${disabled ? 'disabled' : ''}>
                      ${tac.name}${tac.d2Mod ? ` <small>D2 ${tac.d2Mod > 0 ? '+' : ''}${tac.d2Mod}</small>` : '<small>DEF</small>'}
                    </button>`;
                  }).join('')}
                </div>
              </div>
              <div class="tactic-col">
                <h3>Offense · ${offense.abbr}</h3>
                <div class="tactic-list">
                  <button class="tactic-btn ${!s.pendingOffTactic ? 'selected' : ''}" data-action="off-tactic" data-value="" ${s.phase !== 'tactics' ? 'disabled' : ''}>
                    No tactic
                  </button>
                  ${OFF_TACTIC_IDS.map((id) => {
                    const tac = TACTICS[id];
                    let disabled = s.phase !== 'tactics';
                    let note = 'OFF';
                    if (id === 'steal' && !this.engine.canPlaySteal()) {
                      disabled = true;
                      note = 'Need open 2B/3B';
                    }
                    if (id === 'sacfly' && !this.engine.canPlaySacFly()) {
                      disabled = true;
                      note = 'Need a runner';
                    }
                    return `<button class="tactic-btn ${s.pendingOffTactic === id ? 'selected' : ''}" data-action="off-tactic" data-value="${id}" ${disabled ? 'disabled' : ''}>
                      ${tac.name}<small>${note}${tac.d2Mod ? ` · D2 ${tac.d2Mod}` : ''}</small>
                    </button>`;
                  }).join('')}
                </div>
                ${
                  s.pendingOffTactic === 'steal'
                    ? `<div class="steal-target">Steal
                        <button class="${s.stealTarget === 2 ? 'on' : ''}" data-action="steal-target" data-value="2" ${!s.bases[0] || s.bases[1] ? 'disabled' : ''}>2B</button>
                        <button class="${s.stealTarget === 3 ? 'on' : ''}" data-action="steal-target" data-value="3" ${!s.bases[1] || s.bases[2] ? 'disabled' : ''}>3B</button>
                      </div>`
                    : ''
                }
              </div>
            </div>

            <div class="actions">
              <button class="btn btn-primary" data-action="resolve" ${s.phase !== 'tactics' ? 'disabled' : ''}>
                Resolve Plate Appearance
              </button>
              <button class="btn btn-ghost" data-action="restart">New Game</button>
            </div>
          </div>

          <div class="panel" style="margin-top:12px">
            <h2>Bullpen · ${defense.abbr}</h2>
            <div class="bullpen">
              ${this.engine.availablePitchers(defense.isHome ? 'home' : 'away').map((p) => `
                <button class="${p.active ? 'active' : ''}" data-action="change-pitcher" data-side="${defense.isHome ? 'home' : 'away'}" data-value="${p.playerId}" ${p.active ? 'disabled' : ''}>
                  <span>${p.name} (${p.hand})</span>
                  <span>IP ${p.ipUsed}/${p.ipMax}</span>
                </button>
              `).join('') || '<div class="hint">No pitchers remaining</div>'}
            </div>
          </div>
        </div>
      </div>

      <div class="gameover ${s.phase === 'gameover' ? 'show' : ''}">
        <div class="box">
          <h1>${s.winner || ''} WINS</h1>
          <p>Final · ${s.away.abbr} ${s.away.score} – ${s.home.score} ${s.home.abbr}</p>
          ${s.forfeit ? `<p class="hint">Forfeit: ${s.forfeit} out of pitchers</p>` : ''}
          <button class="btn btn-primary" data-action="restart" style="margin-top:12px">Play Again</button>
        </div>
      </div>
    `;
  }

  _scoreboard(s) {
    const halfLabel = s.half === 'top' ? 'TOP' : 'BOT';
    return `
      <div class="scoreboard">
        <div class="team-block away">
          <div class="team-abbr away">${s.away.abbr}</div>
          <div class="team-name">${s.away.name}</div>
          <div class="team-score">${s.away.score}</div>
        </div>
        <div class="center-board">
          <div class="inning-label">${halfLabel} ${s.inning}</div>
          <div class="outs-row">
            <span>OUTS</span>
            <span class="out-dot ${s.outs >= 1 ? 'on' : ''}"></span>
            <span class="out-dot ${s.outs >= 2 ? 'on' : ''}"></span>
            <span class="out-dot ${s.outs >= 3 ? 'on' : ''}"></span>
          </div>
          <div class="count-meta">H ${s.away.hits}–${s.home.hits}</div>
        </div>
        <div class="team-block home">
          <div class="team-abbr home">${s.home.abbr}</div>
          <div class="team-name">${s.home.name}</div>
          <div class="team-score">${s.home.score}</div>
        </div>
      </div>
    `;
  }

  _linescore(s) {
    const maxInn = Math.max(9, s.inning);
    const inns = Array.from({ length: maxInn }, (_, i) => i);
    const row = (side) =>
      inns
        .map((i) => {
          const played =
            i + 1 < s.inning ||
            (i + 1 === s.inning && (s.half === 'bottom' || side.isHome === false)) ||
            s.phase === 'gameover';
          // simplify: show number if inning started for that half
          let show = side.inningRuns[i];
          if (i + 1 > s.inning) show = '';
          else if (i + 1 === s.inning && s.half === 'top' && side.isHome) show = '';
          else show = side.inningRuns[i] || 0;
          return `<td>${show}</td>`;
        })
        .join('');

    return `
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
            <td class="team">${s.away.abbr}</td>
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

  _playerCard(role, player, isPitcher, entry) {
    if (!player) return `<div class="card"><div class="name">—</div></div>`;
    const a = player.abilities;
    const pills = isPitcher
      ? `
        <span class="pill">IP ${(entry?.ipUsed ?? 0)}/${a.IP}</span>
        <span class="pill">${player.hand}HP</span>
        <span class="pill">K ${a.K}</span>
        <span class="pill">BB ${a.BB}</span>
      `
      : `
        <span class="pill">${player.positions.join('/')}</span>
        <span class="pill">${player.hand}</span>
        <span class="pill">SPD ${a.SPD}</span>
        <span class="pill">DEF ${a.DEF}</span>
      `;

    const flat = player.matrix.flat();
    const matrix = flat
      .map((c) => `<i class="${c}">${c === '1B' ? '1' : c === '2B' ? '2' : c[0]}</i>`)
      .join('');

    return `
      <div class="card">
        <div class="role">${role}</div>
        <div class="name">${player.name}</div>
        <div class="meta">${player.team} · 2025</div>
        <div class="stat-pills">${pills}</div>
        <div class="matrix">${matrix}</div>
      </div>
    `;
  }

  _resultHtml(r) {
    const label = OUTCOME_LABEL[r.finalResult] || r.finalResult;
    return `
      <div class="code">${label}</div>
      <div class="dice">
        ${r.d1 != null ? `D1 ${r.d1}` : ''}
        ${r.d2Raw != null ? ` · D2 ${r.d2Raw}${r.d2 !== r.d2Raw ? ` → ${r.d2}` : ''}` : ''}
        ${r.baseResult && r.baseResult !== r.finalResult ? ` · base ${r.baseResult}` : ''}
        ${r.matrixSource ? ` · via ${r.matrixSource}` : ''}
      </div>
      <ul>${(r.detail || []).map((d) => `<li>${d}</li>`).join('')}</ul>
      ${r.restartAtBat ? '<p class="hint">At-bat restarts — same batter.</p>' : ''}
    `;
  }
}
