# 9-Inning Duel — Web Game

Browser version of **9-Inning Duel** (Official Rulebook gameplay).

Rules live in [`docs/9_Inning_Duel_Official_Rulebook.md`](../docs/9_Inning_Duel_Official_Rulebook.md). When gameplay rules change, update the rulebook in the same change.

## Flow

1. **Draft** a roster under the **$1000** salary cap (12–25 players, legal lineup, pitching IP > 9)
2. Pick one of three **AI opponents** (Offense First / Two-Ace / Dual Threat)
3. **Play live** with tactics, or run a **quick sim** / **multi-sim (1–1000 games)** with **no tactics**

You always bat last (HOME).

## Play

```bash
cd game
python3 -m http.server 8080
```

Open http://localhost:8080

## Simulation

- Quick sim = 1 full game, no tactics, auto pitching
- Multi-sim = up to **1000** games; shows W–L, runs/game, run differential

## Steal cutoffs

- Steal **2B**: Check ≤ **9**
- Steal **3B**: Check ≤ **6**
