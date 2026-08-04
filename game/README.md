# 9-Inning Duel — Web Game

Browser version of **9-Inning Duel** (Official Rulebook gameplay).

Rules live in [`docs/9_Inning_Duel_Official_Rulebook.md`](../docs/9_Inning_Duel_Official_Rulebook.md). When gameplay rules change, update the rulebook in the same change.

## Flow

1. **Draft** a roster under the **$1000** salary cap (12–25 players, legal lineup, pitching IP > 9)
2. Pick one of five **AI opponents** (Offense First / Two-Ace / Dual Threat / Mid-Star Stack / Outfield Core)
3. Optionally **set batting order** (1–9) before the game
4. **Play live** with tactics (AI manages the away side by default — toggleable), or run a **quick sim** / **multi-sim (1–10000 games)** with **no tactics**

You always bat last (HOME).

## Play

```bash
cd game
python3 -m http.server 8080
```

Open http://localhost:8080

## Simulation

- Quick sim = 1 full game, no tactics, auto pitching
- Multi-sim = up to **10000** games; shows W–L, runs/game, run differential

## Steal cutoffs

- Steal **2B**: Check ≤ **9**
- Steal **3B**: Check ≤ **6**
