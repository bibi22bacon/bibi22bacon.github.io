# Salary Scale — absolute ability anchors

## Better way (this version)

| Old approach | Problem |
|--------------|---------|
| AI-draft live $ | Plateaus; dumps most cards to $1 |
| Percentile of full pool | Everyday MLB regulars look like stars (scrubs fill the bottom) |
| Card abilities (2× stretch) | Compresses gaps; contact guys inflate |

**New approach:** score from **real counting-stat rates** (pre-stretch), map **absolute value → $** with anchors sized for a **$1000** cap.

### Batter anchors (value → $)

| Value | ≈ $ |
|------:|---:|
| 16 | 18 |
| 18 | 28 |
| 21 | 60 |
| 24 | 135 |
| 27 | 190 |
| 29 | 200 |

Pitchers use a parallel curve (quality + IP).

Floor **$12**, ceil **$200**. Light scarcity: C/SS up, DH/OF down a bit.

## Board check

| Check | Value |
|-------|------:|
| Max | **$179** (Judge, Aaron) |
| Median | **$16** |
| Best 9 bats | **$1019** |
| Best 5 pits | **$569** |

### Distribution

| Band | Players |
|------|--------:|
| $12–19 | 621 |
| $20–29 | 169 |
| $30–49 | 150 |
| $50–79 | 39 |
| $80–119 | 19 |
| $120–200 | 4 |

### Top 20

| $ | Type | Name | Value |
|---:|---|---|---:|
| 179 | batter | Judge, Aaron | 26.6 |
| 162 | batter | Ohtani, Shohei | 25.7 |
| 129 | pitcher | Skubal, Tarik | 37.9 |
| 122 | pitcher | Wheeler, Zack | 37.2 |
| 115 | batter | Witt Jr., Bobby | 23.0 |
| 110 | pitcher | Rogers, Trevor | 36.0 |
| 108 | pitcher | Crochet, Garrett | 35.8 |
| 104 | batter | Raleigh, Cal | 22.5 |
| 104 | batter | Ramírez, José | 22.8 |
| 100 | pitcher | Bradish, Kyle | 35.1 |
| 98 | pitcher | Woo, Bryan | 35.0 |
| 97 | batter | Kurtz, Nick | 22.6 |
| 96 | pitcher | Sánchez, Cristopher | 34.8 |
| 89 | batter | Bellinger, Cody | 22.4 |
| 88 | pitcher | Schwellenbach, Spencer | 34.0 |
| 88 | pitcher | Woodruff, Brandon | 34.1 |
| 87 | batter | Carroll, Corbin | 22.3 |
| 83 | pitcher | Henderson, Logan | 33.6 |
| 82 | pitcher | Skenes, Paul | 33.5 |
| 82 | batter | Springer, George | 22.2 |

### AI opponents
- **OFF** $1000 — Judge + Ohtani; one ace; value fillers.
- **ACE** $981 — Two aces + Judge; bargain lineup.
- **DUAL** $994 — Judge + Ohtani + Crochet; value arms.

## Files
- `tools/salary_scale.py`
- `data/salaries.csv`
- `game/data/players.json`
