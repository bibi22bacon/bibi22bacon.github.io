# 9-Inning Duel — Official Rulebook

**Version 1.1 — Refined Edition**

A realistic two-player baseball simulation. Build a roster under a salary cap, set your lineup, and resolve every plate appearance through a shared 10×10 duel matrix.

---

## 1. Game Overview

| | |
|---|---|
| **Players** | 2 |
| **Length** | 9 innings |
| **Roles** | Each player is a manager — drafting a team, setting tactics, and managing pitching |

Each plate appearance is a **duel** between the active pitcher and the current batter. Dice select a cell on a grind matrix printed on the player cards; tactic cards can modify the roll or transform the result.

---

## 2. Components

- Playing mat (diamond, dugouts / bullpen areas, lineup slots)
- Position icons (C, 1B, 2B, 3B, SS, OF, DH)
- **D1** — red twenty-sided die (d20)
- **D2** — blue ten-sided die (d10)
- Player cards (batters and pitchers)
- Tactic cards (9 unique cards; each player receives one full set)

---

## 3. Player Cards

Each card shows identity info (name, year, team, eligible positions, L/R), a **salary** cost, ability ratings, and a **10×10 grind matrix** on the back used to resolve plate appearances.

### Key abilities

- **IP** (pitchers) — innings the pitcher may throw before forced removal
- **DEF** (fielders / catchers) — used by certain tactic checks (e.g. steal)
- **SPD** (baserunners) — used by steal, bunt, and related tactics

A batter may list up to three eligible positions (for example **OF**, **2B/SS**, or **DH/1B**). Pitchers are listed as **P**.

---

## 4. Team Building

### 4.1 Roster

Before the game, each player drafts a roster of **12–25** cards under a shared **salary cap of $1,000**. Every card costs at least **$1**; there is no maximum price for a single star.

### 4.2 Starting lineup

Place nine batter cards on the mat in batting order. The defense must cover:

**C · 1B · 2B · 3B · SS · OF · OF · OF · DH**

Put a position icon on each starter matching an eligible position printed on that card. A player may only be assigned a position listed on their card.

### 4.3 Pitching staff

The combined **IP** of all pitchers on your roster must be **greater than 9**. Choose one active pitcher to start the game; keep remaining pitchers in the bullpen.

---

## 5. Pitcher Exhaustion

A pitcher’s **IP** is the maximum number of innings they may pitch this game.

- You may replace the active pitcher with a bullpen pitcher at any time.
- When a pitcher reaches their IP limit, they are **forced out** of the game.
- Entering mid-inning always costs **1 full IP**, regardless of how many batters are faced.
- If your active pitcher hits their IP limit and you have **no eligible reliever** left, you **forfeit immediately**.

---

## 6. Sequence of Play

Play nine innings of standard baseball (three outs per half-inning; home bats last). Each batter’s plate appearance is resolved as a duel (Section 7). Track score, outs, and baserunners on the playing mat.

After nine innings, the higher score wins. If tied, continue extra innings until one side leads after a completed inning.

---

## 7. Resolving a Plate Appearance (Duel)

Follow these steps in order for every plate appearance:

1. **Tactic cards.** Each player may place **0 or 1** tactic card face-down.
2. **Roll.** The defensive player rolls **D1** (d20). The offensive player rolls **D2** (d10).
3. **Reveal & modify D2.** Reveal both tactic cards. Sum every D2 modifier from the cards played. Apply the total to D2, then **clamp** the final D2 value to the range **1–10**.
4. **Read the grind matrix.** Use the dice to index a cell on the appropriate player card (Section 8). That cell’s abbreviation is the **base result**.
5. **Apply transformations.** Apply the defensive player’s tactic effects to the base result, then apply the offensive player’s tactic effects. Some cards replace the normal duel entirely (see Section 10).
6. **Execute the outcome.** Carry out baserunning and outs per Section 9, then continue the half-inning.

---

## 8. Grind Matrix Indexing

Every player card has a 10×10 matrix. Rows and columns are numbered 1–10.

- If **D1 = 1–10**, read the matrix on the **pitcher’s** card. Row = D1.
- If **D1 = 11–20**, read the matrix on the **batter’s** card. Row = D1 − 10.
- **Column** = the final D2 value after modifiers (1–10).

*Example: D1 = 14, modified D2 = 7 → use the batter’s card, row 4, column 7.*

---

## 9. Outcome Types

| Code | Name | Effect |
|------|------|--------|
| **SO** | Strikeout | Batter is out. |
| **FO** | Fly out | Batter is out. Runners do **not** advance (unless a tactic says otherwise). |
| **GO** | Ground out | Batter is out. All runners advance 1 base. If this is the 3rd out, the half-inning ends and no runner may score on the play. |
| **BB** | Walk | Batter to 1st. Forced runners advance 1 base. |
| **1B** | Single | Batter to 1st. All runners advance 1 base. |
| **2B** | Double | Batter to 2nd. All runners advance 2 bases. |
| **HR** | Home run | Batter and all runners score. |

---

## 10. Tactic Cards

Each player begins with the same set of **9 tactic cards** (one of each card below). Before a duel you may play at most one card. After the duel resolves, return the card to your hand.

**DEF** cards may only be played by the defensive player. **OFF** cards may only be played by the offensive player. **Fake Move** may be played by either side.

### 10.1 Defense tactics

| Card | Side | Effect |
|------|------|--------|
| **Fake Move** | DEF or OFF | No mechanical effect. Useful as a bluff. |
| **Pickoff** | DEF | If the offense played **Steal**, the runner is out and the at-bat restarts. If Steal was not played, Pickoff does nothing. |
| **Infield Forward** | DEF | D2 +2 (then clamp 1–10). If the offense also played **Bunt**, cancel the bunt; resolve the duel with Infield Forward’s modifier instead. |
| **Intentional Walk** | DEF | Skip the duel. The batter is awarded a **BB** immediately. |
| **Double Play** | DEF | D2 +1 (then clamp 1–10). If the final outcome is **GO** and a runner is on 1st, both the batter and the runner on 1st are out. |

### 10.2 Offense tactics

| Card | Side | Effect |
|------|------|--------|
| **Steal** | OFF | Attempt to steal **2nd** or **3rd** before the pitch. Compute **Check = D1 + Catcher DEF − D2 − Runner SPD**. If **Check ≤ 9**, the runner is safe; if **Check ≥ 10**, the runner is out. Then **restart the at-bat** (unless the steal made the 3rd out). |
| **Bunt** | OFF | Replace the grind-matrix duel. Compute **B = D1 − D2 − Runner SPD**, then use the bunt table below. |
| **Hit & Run** | OFF | On a **1B** or **2B**, each runner already on base advances **one extra** base. If the base result is **SO**, resolve a **Steal** attempt instead. |
| **Sacrifice Fly** | OFF | D2 −1 (then clamp 1–10). If the final outcome is **FO**, each baserunner advances 1 base. |

### 10.3 Bunt resolution table

Compute **B = D1 − D2 − Runner SPD**. Use the first matching row:

| If… | Result | Notes |
|-----|--------|-------|
| B ≤ −5 | **1B** | Bunt single — batter reaches first; runners advance 1 base. |
| −4 ≤ B ≤ 4 | **GO** | Successful sacrifice — batter out; runners advance 1 base. |
| B ≥ 5 | **FO** | Failed bunt — batter out; runners hold. |

*Calibration (SPD 6, typical bunter): ~33% 1B / ~45% GO / ~23% FO ≈ 78% productive bunts, near modern MLB rates.*

---

## 11. Substitutions & Mid-Game Management

- **Pitchers:** may be changed at any time per Section 5.
- **Position players:** you may substitute a bench batter between plate appearances. The replacement must be legal for the vacated defensive position (or become the DH if replacing the DH).
- Substituted cards are removed from the game (no re-entry), unless you agree on a house rule before starting.

---

## 12. Winning the Game

After 9 innings, the player with more runs wins. If the home team already leads after the top of the 9th, the bottom of the 9th is not played. Tied games continue to extra innings until there is a winner. A forfeit (Section 5) counts as a loss for the forfeiting player.

---

## Appendix A — Clarifications & Probability Calibration

This refined edition preserves the draft’s structure while correcting language and filling gaps that were incomplete in v1.0.

### Playability clarifications

1. **Matrix row mapping** for D1 = 11–20 → row = D1 − 10.
2. **Transformation order**: defensive tactic effects, then offensive tactic effects.
3. **Extra innings** and walk-off / bottom-of-9th standard baseball practice stated explicitly.
4. Eligible positions on cards may include **DH** in addition to C / 1B / 2B / 3B / SS / OF.

### Steal & bunt calibration (v1.1)

Dice and card ratings were simulated against 2025 card SPD/DEF distributions and tuned toward modern MLB rates (~78% SB success; bunts ~30% hits / ~75% productive).

**Steal:** `Check = D1 + Catcher DEF − D2 − Runner SPD` — safe if **Check ≤ 9**.

| Matchup | Approx. success |
|---------|-----------------|
| SPD 6 vs Catcher DEF 4 (typical) | ~82% |
| SPD 8 vs Catcher DEF 4 (fast) | ~90% |
| SPD 2 vs Catcher DEF 6 (slow) | ~52% |
| League-wide vs typical catchers | ~75–78% |

**Bunt:** `B = D1 − D2 − Runner SPD` — **1B** if B ≤ −5; **GO** if B ≤ 4; else **FO**.

| Runner SPD | 1B | GO | FO | Productive (1B+GO) |
|------------|----|----|----|--------------------|
| 4 | 23% | 45% | 33% | 68% |
| 6 | 33% | 45% | 23% | 78% |
| 8 | 43% | 44% | 14% | 86% |

If any clarification conflicts with your intended design, adjust that line and treat this document as the living ruleset.
