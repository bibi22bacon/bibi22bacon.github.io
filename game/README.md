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
