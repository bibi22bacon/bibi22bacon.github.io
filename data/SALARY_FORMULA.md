# Salary Scale — card ability → dollars

## Principle

This is a **board game**. Salary should reflect how strong a card is in the duel,
not real-world MLB rates.

You already turn counting stats → abilities (with 2× stretch for the 50% matrix
select). Those printed abilities are what produce results — so they are the
salary input.

## Method

1. Score the **card** (same value weights as before)
2. Map score → $ with anchors for a **$1000** cap
3. Light positional scarcity (C/SS up a bit)
4. Floor **$12**, ceil **$200**

### Distribution

| Band | Players |
|------|--------:|
| $12–19 | 325 |
| $20–29 | 255 |
| $30–49 | 218 |
| $50–79 | 131 |
| $80–119 | 45 |
| $120–200 | 28 |

Max **$189** · median **$26** · best-9 bats **$1164** · best-5 pits **$861**

### Top 20

| $ | Type | Name | Card value |
|---:|---|---|---:|
| 189 | pitcher | Skubal, Tarik | 46.3 |
| 185 | batter | Judge, Aaron | 37.6 |
| 185 | pitcher | Wheeler, Zack | 45.5 |
| 163 | pitcher | Bradish, Kyle | 42.4 |
| 162 | pitcher | Rogers, Trevor | 42.2 |
| 162 | pitcher | Woodruff, Brandon | 42.2 |
| 154 | pitcher | Crochet, Garrett | 41.3 |
| 151 | batter | Ohtani, Shohei | 32.7 |
| 151 | pitcher | Skenes, Paul | 40.8 |
| 150 | pitcher | Eovaldi, Nathan | 40.6 |
| 149 | pitcher | Woo, Bryan | 40.5 |
| 148 | pitcher | Sánchez, Cristopher | 40.4 |
| 145 | pitcher | Sale, Chris | 40.0 |
| 145 | pitcher | Yamamoto, Yoshinobu | 40.0 |
| 143 | pitcher | Gilbert, Logan | 39.7 |
| 140 | pitcher | Greene, Hunter | 39.3 |
| 140 | pitcher | McLean, Nolan | 39.3 |
| 135 | pitcher | Henderson, Logan | 38.6 |
| 134 | pitcher | Miller, Mason | 38.5 |
| 131 | batter | Raleigh, Cal | 27.9 |

### AI opponents
- **OFF** $996 — Judge + Ohtani; one ace; value fillers.
- **ACE** $1000 — Two aces + Judge; bargain lineup.
- **DUAL** $996 — Judge + Ohtani + Crochet; value arms.

## Files
- `tools/salary_scale.py`
- `data/salaries.csv`
- `game/data/players.json`
