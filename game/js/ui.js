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
        this.engine.changePitcher(t.dataset.side, value);
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
    const hl = this._highlightCell(s.lastResult);

    this.root.innerHTML = `
      <div class="topbar">
        <div class="brand">9-INNING DUEL</div>
        <button class="btn btn-ghost btn-sm" data-action="restart">New Game</button>
      </div>

      <div class="score-strip">
        <div class="score-team away">
          <span class="abbr">${s.away.abbr}</span>
          <span class="runs">${s.away.score}</span>
        </div>
        <div class="score-mid">
          <div class="inning-label">${s.half === 'top' ? '▲' : '▼'} ${s.inning}</div>
          <div class="outs-row">
            <span class="out-circle ${s.outs >= 1 ? 'on' : ''}">${s.outs >= 1 ? '●' : '○'}</span>
            <span class="out-circle ${s.outs >= 2 ? 'on' : ''}">${s.outs >= 2 ? '●' : '○'}</span>
            <span class="out-circle ${s.outs >= 3 ? 'on' : ''}">${s.outs >= 3 ? '●' : '○'}</span>
          </div>
        </div>
        <div class="score-team home">
          <span class="runs">${s.home.score}</span>
          <span class="abbr">${s.home.abbr}</span>
        </div>
      </div>

      <div class="bases-row">
        ${this._diamond(s)}
        <div class="bases-meta">
          <div><span class="muted">1B</span> ${s.bases[0]?.name || '—'}</div>
          <div><span class="muted">2B</span> ${s.bases[1]?.name || '—'}</div>
          <div><span class="muted">3B</span> ${s.bases[2]?.name || '—'}</div>
          <div class="muted" style="margin-top:6px">At bat · ${offense.abbr}</div>
        </div>
      </div>

      <div class="main-simple">
        <div class="matrices panel">
          <div class="matchup-simple">
            ${this._playerCard('P', pitcher.player, true, pitcher.entry, hl?.source === 'pitcher' ? hl : null)}
            ${this._playerCard('BAT', batter.player, false, null, hl?.source === 'batter' ? hl : null)}
          </div>
          <div class="result ${s.lastResult ? 'show' : ''}">
            ${s.lastResult ? this._resultHtml(s.lastResult) : '<span class="muted">Resolve a PA to see the result</span>'}
          </div>
        </div>

        <div class="controls panel">
          <div class="tactics-grid">
            <div class="tactic-col">
              <h3>DEF · ${defense.abbr}</h3>
              <div class="tactic-list">
                <button class="tactic-btn ${!s.pendingDefTactic ? 'selected' : ''}" data-action="def-tactic" data-value="" ${s.phase !== 'tactics' ? 'disabled' : ''}>None</button>
                ${DEF_TACTIC_IDS.map((id) => {
                  const tac = TACTICS[id];
                  return `<button class="tactic-btn ${s.pendingDefTactic === id ? 'selected' : ''}" data-action="def-tactic" data-value="${id}" ${s.phase !== 'tactics' ? 'disabled' : ''}>
                    ${tac.name}${tac.d2Mod ? ` <small>D2 ${tac.d2Mod > 0 ? '+' : ''}${tac.d2Mod}</small>` : ''}
                  </button>`;
                }).join('')}
              </div>
            </div>
            <div class="tactic-col">
              <h3>OFF · ${offense.abbr}</h3>
              <div class="tactic-list">
                <button class="tactic-btn ${!s.pendingOffTactic ? 'selected' : ''}" data-action="off-tactic" data-value="" ${s.phase !== 'tactics' ? 'disabled' : ''}>None</button>
                ${OFF_TACTIC_IDS.map((id) => {
                  const tac = TACTICS[id];
                  let disabled = s.phase !== 'tactics';
                  let note = '';
                  if (id === 'steal' && !this.engine.canPlaySteal()) { disabled = true; note = 'n/a'; }
                  if (id === 'sacfly' && !this.engine.canPlaySacFly()) { disabled = true; note = 'n/a'; }
                  return `<button class="tactic-btn ${s.pendingOffTactic === id ? 'selected' : ''}" data-action="off-tactic" data-value="${id}" ${disabled ? 'disabled' : ''}>
                    ${tac.name}${note ? `<small>${note}</small>` : tac.d2Mod ? `<small>D2 ${tac.d2Mod}</small>` : ''}
                  </button>`;
                }).join('')}
              </div>
              ${
                s.pendingOffTactic === 'steal'
                  ? `<div class="steal-target">
                      <button class="${s.stealTarget === 2 ? 'on' : ''}" data-action="steal-target" data-value="2" ${!s.bases[0] || s.bases[1] ? 'disabled' : ''}>2B</button>
                      <button class="${s.stealTarget === 3 ? 'on' : ''}" data-action="steal-target" data-value="3" ${!s.bases[1] || s.bases[2] ? 'disabled' : ''}>3B</button>
                    </div>`
                  : ''
              }
            </div>
          </div>

          <div class="actions">
            <button class="btn btn-primary" data-action="resolve" ${s.phase !== 'tactics' ? 'disabled' : ''}>Resolve PA</button>
          </div>

          <div class="bullpen-inline">
            <span class="muted">Bullpen</span>
            ${this.engine.availablePitchers(defense.isHome ? 'home' : 'away').map((p) => `
              <button class="pill-btn ${p.active ? 'active' : ''}" data-action="change-pitcher" data-side="${defense.isHome ? 'home' : 'away'}" data-value="${p.playerId}" ${p.active ? 'disabled' : ''}>
                ${p.name.split(',')[0]} ${p.ipUsed}/${p.ipMax}
              </button>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="panel boxscore">
        <h2>Box Score</h2>
        ${this._linescore(s)}
        <div class="log compact">
          ${s.log.slice(0, 8).map((e) => `<div class="entry ${e.kind}">${e.msg}</div>`).join('') || '<div class="entry">Play tactics, then Resolve PA.</div>'}
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
      ? `${player.hand}HP · IP ${(entry?.ipUsed ?? 0)}/${a.IP}`
      : `${player.positions.join('/')} · ${player.hand} · SPD ${a.SPD}`;

    const matrix = player.matrix
      .map((row, ri) =>
        row
          .map((c, ci) => {
            const on = hl && hl.row === ri && hl.col === ci ? ' hl' : '';
            const label = c === '1B' ? '1' : c === '2B' ? '2' : c[0];
            return `<i class="${c}${on}">${label}</i>`;
          })
          .join('')
      )
      .join('');

    return `
      <div class="card">
        <div class="role">${role}</div>
        <div class="name">${player.name}</div>
        <div class="meta">${meta}</div>
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
        ${r.matrixSource ? ` · ${r.matrixSource}` : ''}
      </div>
      ${r.restartAtBat ? '<p class="hint">At-bat restarts</p>' : ''}
    `;
  }
}
