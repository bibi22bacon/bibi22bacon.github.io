# Salary Market Results

## What went wrong?

Nothing is wrong with the **$1000 salary cap**. **Do not change that rule.**

The bug was **absolute scale**. The 2-AI draft ranked players correctly, but dollars
topped out around **$74**. Against a $1000 budget you could stack almost every star —
so the cap felt broken.

## Fix

1. Keep 2-AI draft **demand** ranks  
2. Blend with ability **within each role** (batters vs pitchers separately)  
3. Give each role its own steep dollar curve sized for the $1000 cap  

| Check | Value | Intent |
|-------|------:|--------|
| Cap (rule) | **$1000** | unchanged |
| Max salary | **$239** (Crochet, Garrett) | star tax |
| Best 9 batters | **$1300** | all-star lineup alone is illegal |
| Best 5 pitchers | **$999** | ace stacking is expensive |
| Best 9 bats + top 3 arms | **$1955** | fantasy roster blows the cap |
| Median / min | **$1 / $1** | cheap depth remains |

## Top salaries

| $ | Type | Name | Team | Raw |
|---:|---|---|---|---:|
| 239 | pitcher | Crochet, Garrett | BOS | 50.4 |
| 218 | pitcher | Wheeler, Zack | PHI | 54.6 |
| 205 | batter | Judge, Aaron | NYY | 37.6 |
| 198 | pitcher | Skubal, Tarik | DET | 55.4 |
| 186 | batter | Raleigh, Cal | SEA | 27.9 |
| 180 | pitcher | Rogers, Trevor | BAL | 51.3 |
| 169 | batter | Springer, George | TOR | 28.5 |
| 164 | pitcher | Woo, Bryan | SEA | 49.6 |
| 154 | batter | Witt Jr., Bobby | KC | 27.1 |
| 149 | pitcher | Bradish, Kyle | BAL | 50.2 |
| 140 | batter | Ohtani, Shohei | LAD | 41.5 |
| 136 | pitcher | Woodruff, Brandon | MIL | 50.0 |
| 128 | batter | Kurtz, Nick | ATH | 29.2 |
| 124 | pitcher | Brown, Hunter | HOU | 44.9 |
| 116 | batter | Ramírez, José | CLE | 27.7 |
| 112 | pitcher | Gausman, Kevin | TOR | 45.8 |
| 106 | batter | Jones, Jahmai | DET | 27.1 |
| 102 | pitcher | Sánchez, Cristopher | PHI | 49.5 |
| 96 | batter | Marte, Ketel | AZ | 27.1 |
| 93 | pitcher | Skenes, Paul | PIT | 48.6 |
| 87 | batter | Schwarber, Kyle | PHI | 26.4 |
| 85 | pitcher | deGrom, Jacob | TEX | 44.8 |
| 80 | batter | Acuña Jr., Ronald | ATL | 26.4 |
| 77 | pitcher | Webb, Logan | SF | 44.3 |
| 72 | batter | Tatis Jr., Fernando | SD | 23.2 |

## Distribution
mean $5.8 · ≥$100: 18 · ≥$50: 33

## Ability → salary (approximate)

Clamp ≥ $1. Market demand still moves players off the curve.

**Batter** (R²=0.54, MAE=$8.0):
```
raw = 0.35*BB + 0.45*H + 0.75*2B + 1.40*HR - 0.12*K - 0.02*FO - 0.02*GO
    + 0.35*max(SPD,0) + 0.25*DEF
salary ≈ 35.06 + -6.2242*raw + 0.247090*raw²
```

**Pitcher** (R²=0.54, MAE=$9.6):
```
raw = 0.55*K + 0.18*FO + 0.22*GO - 0.40*BB - 0.35*1B - 0.55*2B - 1.10*HR + 4.5*IP
salary ≈ 18.69 + -2.8429*raw + 0.079918*raw²
```

## Should you change rules?

| Idea | Verdict |
|------|---------|
| Keep **$1000** cap | **Yes** — now it creates real choices |
| Cut cap to $500 | Only if you want *extreme* scarcity |
| Soft-cap / luxury tax | Not needed for v1 |

## Files
- `data/salaries.csv` · `data/salary_market.json`
- `game/data/batters.csv` · `pitchers.csv` · `players.json`
