# Salary Market Results

## Method
1. All players start at **$1**
2. **25×16** two-AI snake drafts (full rules, $1000 cap)
3. Each round: raise early/hot picks, cut ignored players
4. Accumulate draft demand (earlier = heavier)
5. Rank by `0.5·demand + 0.5·raw_ability`, with an **ability floor** so elite raw talent cannot collapse to $1
6. Map rank → exponential salary curve; scale so two top-18 sides ≈ **$1700** combined

## Top salaries

| $ | Type | Name | Team | Raw |
|---:|---|---|---|---:|
| 74 | pitcher | Crochet, Garrett | BOS | 50.4 |
| 72 | pitcher | Brown, Hunter | HOU | 44.9 |
| 70 | pitcher | Wheeler, Zack | PHI | 54.6 |
| 68 | pitcher | Gausman, Kevin | TOR | 45.8 |
| 66 | pitcher | Skubal, Tarik | DET | 55.4 |
| 64 | pitcher | Webb, Logan | SF | 44.3 |
| 62 | batter | Laureano, Ramón | SD | 23.0 |
| 60 | pitcher | deGrom, Jacob | TEX | 44.8 |
| 59 | batter | Tatis Jr., Fernando | SD | 23.2 |
| 57 | pitcher | Valdez, Framber | HOU | 41.4 |
| 55 | pitcher | Woo, Bryan | SEA | 49.6 |
| 54 | pitcher | Snell, Blake | LAD | 40.9 |
| 52 | pitcher | Rogers, Trevor | BAL | 51.3 |
| 50 | pitcher | Suarez, Ranger | PHI | 42.3 |
| 49 | pitcher | Lodolo, Nick | CIN | 40.2 |
| 47 | pitcher | Sánchez, Cristopher | PHI | 49.5 |
| 46 | pitcher | Glasnow, Tyler | LAD | 44.2 |
| 45 | batter | Judge, Aaron | NYY | 37.6 |
| 43 | batter | Canzone, Dominic | SEA | 22.1 |
| 49 | pitcher | Bradish, Kyle | BAL | 50.2 |
| 41 | batter | Refsnyder, Rob | BOS | 23.0 |
| 40 | pitcher | Schwellenbach, Spencer | ATL | 47.2 |
| 39 | pitcher | Schlittler, Cam | NYY | 40.2 |
| 38 | pitcher | Pivetta, Nick | SD | 44.3 |
| 37 | batter | Profar, Jurickson | ATL | 20.7 |

## Distribution
min $1, median $1, mean $4.7, max $74  
≥$40: 27, ≥$20: 65, =$1: 677

## Ability → salary formulas

Clamp ≥ 1 after rounding.

### Recommended

**Batter** (R²=0.222, MAE=$2.6):
```
raw = 0.35*BB + 0.45*H + 0.75*2B + 1.40*HR - 0.12*K - 0.02*FO - 0.02*GO
    + 0.35*max(SPD,0) + 0.25*DEF
salary ≈ 3.48 + -0.6934*raw + 0.03803*raw²
```

**Pitcher** (R²=0.799, MAE=$3.4):
```
raw = 0.55*K + 0.18*FO + 0.22*GO - 0.40*BB - 0.35*1B - 0.55*2B - 1.10*HR + 4.5*IP
salary ≈ 6.60 + -1.1257*raw + 0.03891*raw²
```

### Multivariate market fit
- Batter R²=0.181, MAE=$3.2 — `{'H': -0.2469, '2B': -0.4442, 'HR': -0.7383, 'BB': -0.161, 'K': 0.1138, 'SPD': -0.1497, 'DEF': -0.1233, 'raw': 1.1178, 'intercept': -7.0191}`
- Pitcher R²=0.506, MAE=$5.8 — `{'IP': 0.2607, 'K': -0.0464, 'FO': -0.3054, 'GO': -0.1447, 'BB': -0.0673, '1B': 0.0289, '2B': 0.1022, 'HR': 0.2723, 'raw': 0.7221, 'intercept': -0.0016}`

Ability explains part of price; the rest is draft demand / positional scarcity.

## Files
- `data/salaries.csv`, `data/salary_market.json`, `data/SALARY_FORMULA.md`
- `game/data/*.csv` Salary column, `game/data/players.json` `salary` field
- `tools/salary_market.py`
