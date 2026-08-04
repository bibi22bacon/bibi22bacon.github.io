# 9-Inning Duel — Delivery Package

This archive contains today’s finished set:

| Path | Contents |
|------|----------|
| `docs/9_Inning_Duel_Official_Rulebook.md` | Official rules **v1.4** (source of truth) |
| `docs/9_Inning_Duel_Official_Rulebook.pdf` | Same rulebook as PDF |
| `game/` | Full hotseat web game (open `game/index.html` or serve the folder) |
| `game/data/players.json` | All batters/pitchers + salaries + AI opponents |
| `game/data/team_rosters.json` | 30 MLB default club presets |
| `game/data/batters.csv` / `pitchers.csv` | Spreadsheet-friendly card exports (salaries synced) |
| `data/salaries.csv` | Name / type / salary / prior value |
| `data/SALARY_FORMULA.md` | How sim-market salaries are produced |

## Run the web game

```bash
cd game
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

## Rulebook highlights (v1.4)

- Cap **$1000**, roster **12–25**, salary floor **$12** / ceil **$200**
- Pickoff: **D2 +1**
- Hit & Run + SO: lead-runner steal; lead on **3B** = steal of home → **automatic out**
- Salaries from **2-AI draft market + H2H sims** (`tools/sim_economy.mjs` in the repo)

## Not included (repo tooling only)

Build/market scripts live in the git repo under `tools/` if you need to regenerate salaries or AI tops.
