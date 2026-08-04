# Salary Market — sim draft + head-to-head

## Principle
Salaries come from a **2-AI draft market** whose prices are heated by **simulated game results**, then remapped so a **$1000** cap bites.

## Method
1. Start everyone near the floor
2. Two AI managers snake-draft under live prices (full roster rules)
3. Those clubs play a short series; winners’ cards get market heat
4. Early/hot picks rise, ignored cards fall — repeat until stable
5. Remap demand → board $ (floor $12, ceil $200)
6. Draft many candidates under board $; tournament sims pick top AI builds

### Distribution
| Band | Players |
|------|--------:|
| $12–19 | 534 |
| $20–29 | 418 |
| $30–49 | 16 |
| $50–79 | 12 |
| $80–119 | 9 |
| $120–200 | 13 |

Max **$200** · median **$19** · best-9 bats **$1251** · best-5 pits **$900**

### Top 20
| $ | Type | Name | Prior |
|---:|---|---|---:|
| 200 | pitcher | Rogers, Trevor | 62.6 |
| 200 | pitcher | Skubal, Tarik | 61.2 |
| 195 | batter | Judge, Aaron | 130.1 |
| 182 | pitcher | Wheeler, Zack | 55.5 |
| 178 | batter | Ohtani, Shohei | 114.4 |
| 166 | pitcher | Sánchez, Cristopher | 55.4 |
| 162 | batter | Kurtz, Nick | 103.5 |
| 152 | pitcher | Fried, Max | 51.2 |
| 148 | batter | Springer, George | 102.7 |
| 139 | pitcher | Skenes, Paul | 51.9 |
| 135 | batter | Ramírez, José | 98.6 |
| 127 | pitcher | Crochet, Garrett | 46.9 |
| 123 | batter | Raleigh, Cal | 98.6 |
| 116 | pitcher | Eovaldi, Nathan | 52.3 |
| 113 | batter | Soto, Juan | 95.4 |
| 106 | pitcher | Yamamoto, Yoshinobu | 48.3 |
| 103 | batter | Marte, Ketel | 97.0 |
| 97 | pitcher | Woo, Bryan | 46.5 |
| 94 | batter | Jones, Jahmai | 95.3 |
| 89 | pitcher | Bradish, Kyle | 47.3 |

### AI opponents (sim tournament)
- **OFF** $994 — Sim-drafted offense stack. (stars, 59% tourney).
- **ACE** $993 — Sim-drafted two-ace staff. (pitching, 59% tourney).
- **DUAL** $998 — Sim-drafted star bat + quality arm. (power, 66% tourney).
- **MID** $1000 — Sim-drafted mid-tier stack (no Judge/Ohtani). (contact, 58% tourney).
- **OFC** $998 — Sim-drafted outfield-heavy club. (speed, 53% tourney).

## Files
- `tools/sim_economy.mjs` (market + top builds)
- `data/salary_market.json`
- `game/data/players.json`
