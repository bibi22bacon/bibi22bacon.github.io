#!/usr/bin/env python3
"""
2-AI draft salary market for 9-Inning Duel.

Start all at $1 → repeated full-rule drafts → raise early/hot picks,
cut ignored players → stop when top-end prices stabilize → fit formulas.
"""

from __future__ import annotations

import csv
import json
import math
import random
import statistics
from collections import defaultdict
from pathlib import Path

ROOT = Path("/workspace")
PLAYERS_JSON = ROOT / "game/data/players.json"
BATTERS_CSV = ROOT / "game/data/batters.csv"
PITCHERS_CSV = ROOT / "game/data/pitchers.csv"
OUT_DIR = ROOT / "data"
OUT_DIR.mkdir(exist_ok=True)

CAP = 1000
MIN_ROSTER, MAX_ROSTER = 12, 25
MIN_PRICE = 1
LINEUP_ORDER = ["C", "SS", "2B", "3B", "1B", "OF", "OF", "OF", "DH"]


def load_players():
    data = json.loads(PLAYERS_JSON.read_text())
    for b in data["batters"]:
        b["kind"] = "batter"
    for p in data["pitchers"]:
        p["kind"] = "pitcher"
    return data["batters"], data["pitchers"]


def batter_raw(a):
    return (
        0.35 * a["BB"] + 0.45 * a["H"] + 0.75 * a["2B"] + 1.40 * a["HR"]
        - 0.12 * a["K"] - 0.02 * a.get("FO", 0) - 0.02 * a.get("GO", 0)
        + 0.35 * max(a["SPD"], 0) + 0.25 * a["DEF"]
    )


def pitcher_raw(a):
    return (
        0.55 * a["K"] + 0.18 * a["FO"] + 0.22 * a["GO"]
        - 0.40 * a["BB"] - 0.35 * a["1B"] - 0.55 * a["2B"] - 1.10 * a["HR"]
        + 4.5 * a["IP"]
    )


def raw_value(p):
    return batter_raw(p["abilities"]) if p["kind"] == "batter" else pitcher_raw(p["abilities"])


def covers(player, slot):
    if slot == "DH":
        return player["kind"] == "batter"
    if slot == "OF":
        return "OF" in player["positions"]
    return slot in player["positions"]


def assign_need(batters):
    need = {"C": 1, "1B": 1, "2B": 1, "3B": 1, "SS": 1, "OF": 3, "DH": 1}
    used = set()
    for slot in LINEUP_ORDER:
        for i, b in enumerate(batters):
            if i in used:
                continue
            if need.get(slot, 0) > 0 and covers(b, slot):
                used.add(i)
                need[slot] -= 1
                break
    return need


class Team:
    def __init__(self, style, rng):
        self.style = style
        self.rng = rng
        self.ids = []
        self.spent = 0

    @property
    def cash(self):
        return CAP - self.spent

    def bats(self, by_id):
        return [by_id[i] for i in self.ids if by_id[i]["kind"] == "batter"]

    def ip(self, by_id):
        return sum(by_id[i]["abilities"]["IP"] for i in self.ids if by_id[i]["kind"] == "pitcher")

    def need(self, by_id):
        return assign_need(self.bats(by_id))

    def complete(self, by_id):
        n = self.need(by_id)
        return all(v <= 0 for v in n.values()) and self.ip(by_id) > 9 and len(self.ids) >= MIN_ROSTER


def score(p, team, prices, by_id, phase):
    price = max(prices[p["id"]], 1)
    val = raw_value(p)
    need = team.need(by_id)
    ip = team.ip(by_id)
    if p["kind"] == "batter":
        filled = False
        for slot, n in need.items():
            if n > 0 and covers(p, slot):
                urg = {"C": 10, "SS": 7, "2B": 6, "3B": 6, "1B": 5, "OF": 4, "DH": 2}[slot]
                val += urg * n * (3 if phase == "need" else 1)
                filled = True
                break
        if phase == "need" and not filled:
            val -= 25
    else:
        if ip <= 9:
            val += 8 * min(p["abilities"]["IP"], max(1, 10 - ip))
        elif phase == "need":
            val -= 20

    if team.style == "stars":
        # Pay for talent while cash-rich
        val = val * (1.15 + 0.04 * max(val, 0))
        if team.cash > 400:
            vpd_bias = val  # absolute talent bias below
        else:
            vpd_bias = 0
    else:
        vpd_bias = 0
    if team.style == "pitching":
        val *= 1.35 if p["kind"] == "pitcher" else 0.88
    elif team.style == "contact" and p["kind"] == "batter":
        val += 0.5 * p["abilities"]["H"] + 0.35 * p["abilities"]["BB"]
    elif team.style == "speed" and p["kind"] == "batter":
        val += 0.8 * max(p["abilities"]["SPD"], 0)

    vpd = val / (price ** (0.65 if team.style == "stars" else 1.0))
    if team.style == "value":
        vpd *= 1.25
    if team.style == "stars" and team.cash > 400:
        vpd += 0.08 * val
    return vpd + vpd_bias * 0.01 + 0.15 * team.rng.random()


def choose(cands, team, prices, by_id, phase):
    if not cands:
        return None
    ranked = sorted(cands, key=lambda p: score(p, team, prices, by_id, phase), reverse=True)
    top = ranked[:4]
    w = [max(0.01, score(p, team, prices, by_id, phase)) for p in top]
    return team.rng.choices(top, weights=w, k=1)[0]


def force_fill(team, available, prices, by_id):
    while True:
        need = team.need(by_id)
        holes = [s for s, n in need.items() if n > 0]
        ip = team.ip(by_id)
        if not holes and ip > 9 and len(team.ids) >= MIN_ROSTER:
            return
        if len(team.ids) >= MAX_ROSTER or team.cash < 1:
            return
        cands = []
        if holes:
            cands = [
                by_id[i] for i in available
                if by_id[i]["kind"] == "batter" and prices[i] <= team.cash
                and any(covers(by_id[i], s) for s in holes)
            ]
            cands.sort(key=lambda p: (prices[p["id"]], -raw_value(p)))
        elif ip <= 9:
            cands = [
                by_id[i] for i in available
                if by_id[i]["kind"] == "pitcher" and prices[i] <= team.cash
            ]
            cands.sort(key=lambda p: (prices[p["id"]] / max(p["abilities"]["IP"], 1), prices[p["id"]]))
        else:
            cands = [by_id[i] for i in available if prices[i] <= team.cash]
            cands.sort(key=lambda p: prices[p["id"]])
        if not cands:
            return
        p = cands[0]
        available.discard(p["id"])
        team.ids.append(p["id"])
        team.spent += prices[p["id"]]


def draft(players, prices, rng, styles):
    by_id = {p["id"]: p for p in players}
    available = set(by_id)
    teams = [
        Team(styles[0], random.Random(rng.randint(1, 10**9))),
        Team(styles[1], random.Random(rng.randint(1, 10**9))),
    ]
    log = []
    pick_i = 0
    for wave in range(70):
        order = teams if wave % 2 == 0 else list(reversed(teams))
        moved = False
        for team in order:
            if len(team.ids) >= MAX_ROSTER or team.cash < 1:
                continue
            need = team.need(by_id)
            holes = [s for s, n in need.items() if n > 0]
            ip = team.ip(by_id)
            phase = "need" if holes or ip <= 9 or len(team.ids) < MIN_ROSTER else "luxury"
            if phase == "luxury" and team.complete(by_id) and (team.cash < 200 or len(team.ids) >= 24):
                continue

            cands = []
            for pid in available:
                p = by_id[pid]
                if prices[pid] > team.cash:
                    continue
                if phase == "need":
                    if holes and p["kind"] == "batter" and any(covers(p, s) for s in holes):
                        cands.append(p)
                    elif ip <= 9 and p["kind"] == "pitcher":
                        cands.append(p)
                    elif len(team.ids) < MIN_ROSTER:
                        cands.append(p)
                else:
                    cands.append(p)
            if not cands:
                cands = [by_id[i] for i in available if prices[i] <= team.cash]
                if holes:
                    pref = [p for p in cands if p["kind"] == "batter" and any(covers(p, s) for s in holes)]
                    if pref:
                        cands = pref
                elif ip <= 9:
                    pref = [p for p in cands if p["kind"] == "pitcher"]
                    if pref:
                        cands = pref
            choice = choose(cands, team, prices, by_id, phase)
            if not choice:
                continue
            available.remove(choice["id"])
            team.ids.append(choice["id"])
            team.spent += prices[choice["id"]]
            log.append((choice["id"], pick_i, team.style, prices[choice["id"]]))
            pick_i += 1
            moved = True
        if not moved:
            break
        if all(t.complete(by_id) for t in teams) and wave >= 14:
            break
    for t in teams:
        force_fill(t, available, prices, by_id)
    return log, all(t.complete(by_id) for t in teams)


def adjust(prices, logs, players):
    """Raise early picks hard; cut ignored; allow wide spread under the cap."""
    score = defaultdict(float)
    times = defaultdict(int)
    n = max(1, len(logs))
    for log in logs:
        n_picks = max(1, len(log))
        for pid, idx, _s, _p in log:
            times[pid] += 1
            # Front of the board dominates price discovery
            score[pid] += (n_picks - idx) ** 2

    ordered = sorted(score.items(), key=lambda kv: kv[1], reverse=True)
    rank = {pid: i for i, (pid, _) in enumerate(ordered)}
    new = {}
    for p in players:
        pid = p["id"]
        old = prices[pid]
        freq = times.get(pid, 0) / n
        r = rank.get(pid, 9999)
        if r < 8:
            np = old * 1.55 + 8
        elif r < 25:
            np = old * 1.35 + 4
        elif r < 60:
            np = old * 1.18 + 2
        elif r < 120:
            np = old * 1.08 + 1
        elif freq >= 0.2:
            np = old * 1.03
        elif freq > 0:
            np = old * 0.97
        else:
            np = old * 0.85
        new[pid] = max(MIN_PRICE, min(int(round(np)), 250))
    return new


def top_stable(old, new, players, k=60):
    top_ids = sorted(players, key=lambda p: new[p["id"]], reverse=True)[:k]
    chg = [abs(new[p["id"]] - old[p["id"]]) / max(old[p["id"]], 1) for p in top_ids]
    return statistics.mean(chg) < 0.05


def solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[piv] = M[piv], M[c]
        div = M[c][c] or 1e-12
        for j in range(c, n + 1):
            M[c][j] /= div
        for r in range(n):
            if r == c:
                continue
            f = M[r][c]
            for j in range(c, n + 1):
                M[r][j] -= f * M[c][j]
    return [M[i][n] for i in range(n)]


def fit(group, prices, feat_fn, names):
    X, y = [], []
    for p in group:
        X.append(feat_fn(p) + [1.0])
        y.append(float(prices[p["id"]]))
    names = names + ["intercept"]
    n, m = len(X), len(X[0])
    XtX = [[0.0] * m for _ in range(m)]
    XtY = [0.0] * m
    for i in range(n):
        for a in range(m):
            XtY[a] += X[i][a] * y[i]
            for b in range(m):
                XtX[a][b] += X[i][a] * X[i][b]
    for i in range(m):
        XtX[i][i] += 1e-2
    w = solve(XtX, XtY)
    preds = [sum(X[i][j] * w[j] for j in range(m)) for i in range(n)]
    mean_y = sum(y) / n
    ss_tot = sum((yi - mean_y) ** 2 for yi in y) or 1
    ss_res = sum((y[i] - preds[i]) ** 2 for i in range(n))
    return {
        "weights": dict(zip(names, w)),
        "r2": 1 - ss_res / ss_tot,
        "mae": sum(abs(y[i] - preds[i]) for i in range(n)) / n,
        "n": n,
    }


def rescale_for_cap(group, demand_prices, max_s, best_n_target, best_n):
    """Map within-role demand+ability ranks onto a steep $ curve for the $1000 cap.

    Live draft prices plateau with substitutes (~tens of dollars). Absolute $ must
    be remapped or the cap never bites. Batters and pitchers are scaled separately
    so pitcher IP-heavy raw values do not crush batter salaries.
    """
    g = list(group)
    nd = max(1, len(g) - 1)
    by_d = sorted(g, key=lambda p: -demand_prices[p["id"]])
    by_r = sorted(g, key=lambda p: -raw_value(p))
    demand_pct = {p["id"]: 1 - i / nd for i, p in enumerate(by_d)}
    raw_pct = {p["id"]: 1 - i / nd for i, p in enumerate(by_r)}
    scored = []
    for p in g:
        score = 0.5 * demand_pct[p["id"]] + 0.5 * raw_pct[p["id"]]
        if raw_pct[p["id"]] >= 0.98:
            score = max(score, 0.96)
        elif raw_pct[p["id"]] >= 0.95:
            score = max(score, 0.92)
        scored.append((score, raw_value(p), p))
    ordered = [p for _, _, p in sorted(scored, key=lambda t: (-t[0], -t[1], t[2]["name"]))]
    k = 0.095
    raw_pay = [1 + (max_s - 1) * math.exp(-k * i) for i in range(len(ordered))]
    top = sum(raw_pay[:best_n]) or 1
    scale = best_n_target / top
    out = {}
    for i, p in enumerate(ordered):
        out[p["id"]] = int(round(max(MIN_PRICE, min(max_s + 20, raw_pay[i] * scale))))
    return out, ordered


def write_outputs(batters, pitchers, prices, history, formula):
    # Remap live draft $ onto cap-meaningful board prices (per role).
    bat_pay, bat_ord = rescale_for_cap(batters, prices, max_s=280, best_n_target=1300, best_n=9)
    pit_pay, pit_ord = rescale_for_cap(pitchers, prices, max_s=260, best_n_target=1000, best_n=5)
    board = {**bat_pay, **pit_pay}
    players = batters + pitchers

    # Sync salary onto player objects for JSON consumers
    for p in players:
        p["salary"] = board[p["id"]]

    def upd(path, group, idx):
        with open(path, newline="", encoding="utf-8") as f:
            rows = list(csv.reader(f))
        if len(rows[2]) > idx:
            rows[2][idx] = "Salary"
        by_name = {p["name"]: p for p in group}
        for row in rows[3:]:
            if not row or row[0] not in by_name:
                continue
            while len(row) <= idx:
                row.append("")
            row[idx] = str(board[by_name[row[0]]["id"]])
        with open(path, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerows(rows)

    upd(BATTERS_CSV, batters, 16)
    upd(PITCHERS_CSV, pitchers, 16)

    with open(OUT_DIR / "salaries.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "type", "team", "salary", "raw_value"])
        for p in sorted(players, key=lambda x: (-board[x["id"]], x["name"])):
            w.writerow([p["name"], p["kind"], p["team"], board[p["id"]], f"{raw_value(p):.3f}"])

    b9 = sum(board[p["id"]] for p in bat_ord[:9])
    p5 = sum(board[p["id"]] for p in pit_ord[:5])
    max_s = max(board.values())

    (OUT_DIR / "salary_market.json").write_text(
        json.dumps(
            {
                "meta": {
                    "cap": CAP,
                    "rounds": len(history),
                    "method": "2-AI draft demand + per-role ability blend + $1000-cap curve",
                    "max_salary": max_s,
                    "best9_batters": b9,
                    "best5_pitchers": p5,
                    "note": "Do not change the $1000 rule. Live draft $ plateau; board $ are remapped per role.",
                },
                "history": history,
                "formula": formula,
                "prices": {p["name"]: board[p["id"]] for p in players},
            },
            indent=2,
        )
    )

    # Persist salaries on players.json
    data = json.loads(PLAYERS_JSON.read_text())
    pay_by_name = {p["name"]: board[p["id"]] for p in players}
    for b in data["batters"]:
        b["salary"] = int(pay_by_name.get(b["name"], MIN_PRICE))
    for p in data["pitchers"]:
        p["salary"] = int(pay_by_name.get(p["name"], MIN_PRICE))
    PLAYERS_JSON.write_text(json.dumps(data, indent=2) + "\n")

    top = sorted(players, key=lambda p: -board[p["id"]])[:25]
    top_md = "\n".join(
        f"| {board[p['id']]} | {p['kind']} | {p['name']} | {p['team']} | {raw_value(p):.1f} |"
        for p in top
    )
    (OUT_DIR / "SALARY_FORMULA.md").write_text(
        f"""# Salary Market Results

## What went wrong (and what not to change)

The **$1000 salary cap is fine — do not change that rule.**

Live 2-AI draft prices plateau in the tens of dollars (deep substitute pool).
If those raw prices are used on the board, the cap never bites. Board salaries are
therefore remapped **per role** onto a steep curve sized for ${CAP}.

| Check | Value |
|-------|------:|
| Cap (rule) | **${CAP}** |
| Max salary | **${max_s}** |
| Best 9 batters | **${b9}** |
| Best 5 pitchers | **${p5}** |

## Method
1. All players start at **$1**
2. Two AI managers snake-draft with full rules (cap ${CAP}, roster {MIN_ROSTER}–{MAX_ROSTER},
   lineup C/1B/2B/3B/SS/OF×3/DH, pitching IP > 9)
3. Early/frequent picks get **raised**; ignored players get **cut** (floor $1)
4. After stabilization: within each role, blend demand + ability, remap to board $
5. Targets: best-9 batters ≈ $1300, best-5 pitchers ≈ $1000, stars ≈ $200–$280

## Top salaries

| $ | Type | Name | Team | Raw |
|---:|---|---|---|---:|
{top_md}

## Fitted formulas (on live-draft signal; board $ use the remap above)

Round to int, clamp ≥ 1.

### Batter — R²={formula['batter']['r2']:.3f}, MAE=${formula['batter']['mae']:.1f}

`raw = 0.35*BB + 0.45*H + 0.75*2B + 1.40*HR - 0.12*K - 0.02*FO - 0.02*GO + 0.35*max(SPD,0) + 0.25*DEF`

### Pitcher — R²={formula['pitcher']['r2']:.3f}, MAE=${formula['pitcher']['mae']:.1f}

`raw = 0.55*K + 0.18*FO + 0.22*GO - 0.40*BB - 0.35*1B - 0.55*2B - 1.10*HR + 4.5*IP`

## Should you change rules?
**No.** Keep the $1000 cap. Adjust the salary curve (this pipeline), not the rule.

## Outputs
- `data/salaries.csv`
- `data/salary_market.json`
- Salary column on `game/data/batters.csv` and `game/data/pitchers.csv`
"""
    )


def main():
    rng = random.Random(11)
    batters, pitchers = load_players()
    players = batters + pitchers
    prices = {p["id"]: MIN_PRICE for p in players}
    styles = [
        ("stars", "value"),
        ("value", "pitching"),
        ("pitching", "contact"),
        ("contact", "stars"),
        ("speed", "value"),
        ("stars", "pitching"),
        ("value", "speed"),
        ("pitching", "stars"),
    ]
    history = []
    per = 24
    print(f"Market: {len(players)} players, {per} drafts/round")

    for rnd in range(1, 81):
        logs = []
        valid = 0
        for g in range(per):
            log, ok = draft(players, prices, rng, styles[g % len(styles)])
            if log:
                logs.append(log)
            if ok:
                valid += 1
        new_prices = adjust(prices, logs, players)
        vals = list(new_prices.values())
        top20 = sorted(vals, reverse=True)[:20]
        mean_chg = statistics.mean(
            abs(new_prices[p["id"]] - prices[p["id"]]) / max(prices[p["id"]], 1) for p in players
        )
        history.append({
            "round": rnd,
            "valid": valid,
            "mean": statistics.mean(vals),
            "median": statistics.median(vals),
            "max": max(vals),
            "top20_mean": statistics.mean(top20),
            "gt1": sum(1 for v in vals if v > 1),
            "gt10": sum(1 for v in vals if v >= 10),
            "mean_chg": mean_chg,
        })
        h = history[-1]
        print(
            f"R{rnd:02d} valid={valid}/{per} max=${h['max']} top20≈${h['top20_mean']:.0f} "
            f"med=${h['median']:.0f} ≥$10={h['gt10']} chg={mean_chg:.1%}"
        )
        stop = rnd >= 25 and top_stable(prices, new_prices, players) and h["max"] >= 80
        near = rnd >= 35 and h["max"] >= 80 and h["mean_chg"] < 0.06 and top_stable(prices, new_prices, players)
        prices = new_prices
        if stop:
            print(f"Stabilized at round {rnd}")
            break
        if near:
            print(f"Near-stable stop at round {rnd}")
            break

    print("\nTop 25:")
    for p in sorted(players, key=lambda x: -prices[x["id"]])[:25]:
        print(f"  ${prices[p['id']]:4d}  {p['kind'][:3]}  {p['name']:28s} raw={raw_value(p):6.1f}")

    formula = {
        "batter": fit(
            batters, prices,
            lambda p: [p["abilities"][k] for k in ("H", "2B", "HR", "BB", "K", "SPD", "DEF")]
            + [batter_raw(p["abilities"])],
            ["H", "2B", "HR", "BB", "K", "SPD", "DEF", "raw"],
        ),
        "pitcher": fit(
            pitchers, prices,
            lambda p: [p["abilities"][k] for k in ("IP", "K", "FO", "GO", "BB", "1B", "2B", "HR")]
            + [pitcher_raw(p["abilities"])],
            ["IP", "K", "FO", "GO", "BB", "1B", "2B", "HR", "raw"],
        ),
    }
    print("\nFormula fit:")
    for kind, res in formula.items():
        print(f"  {kind}: R²={res['r2']:.3f} MAE=${res['mae']:.2f}")
        for n, w in sorted(res["weights"].items(), key=lambda kv: -abs(kv[1]))[:8]:
            print(f"    {n:10s} {w:+.4f}")

    write_outputs(batters, pitchers, prices, history, formula)
    print("\nWrote data/salaries.csv, salary_market.json, SALARY_FORMULA.md")


if __name__ == "__main__":
    main()
