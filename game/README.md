# 9-Inning Duel — Web Game

Hotseat browser version of **9-Inning Duel** (Official Rulebook v1.1 gameplay).

Team building is skipped for now — presets load **LAD @ NYY** with legal lineups and pitching staffs.

## Play

```bash
cd game
python3 -m http.server 8080
```

Open http://localhost:8080

Or on GitHub Pages: `/game/` once deployed.

## Controls

1. Defense picks 0–1 tactic
2. Offense picks 0–1 tactic
3. **Resolve Plate Appearance**
4. Change pitchers from the bullpen panel anytime

Full 9 innings, extras, walk-offs, IP exhaustion / forfeit are supported.

## Matrix layout

Each 10×10 grind matrix is filled from the player's outcome rates with a
**upper-left → lower-right** gradient:

- **Upper-left** skews toward pitcher results (`SO` / `FO` / `GO`)
- **Lower-right** skews toward batter results (`BB` / `1B` / `2B` / `HR`)

That’s why tactic **D2 modifiers** matter: higher D2 slides toward batter
advantage; lower D2 slides toward pitcher advantage.

## Steal cutoffs

- Steal **2B**: Check ≤ **9**
- Steal **3B**: Check ≤ **6** (stricter)
