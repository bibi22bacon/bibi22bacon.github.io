#!/usr/bin/env python3
"""Rebuild the five AI opponent rosters under the $1000 cap from card ability value."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAYERS = ROOT / "game" / "data" / "players.json"
CAP = 1000
SLOTS = ["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "DH"]
MIN_ROSTER = 12


def bat_val(p: dict) -> float:
    a = p["abilities"]
    return (
        a.get("H", 0) * 1.5
        + a.get("2B", 0) * 2.2
        + a.get("HR", 0) * 4.5
        + a.get("BB", 0) * 1.1
        - a.get("K", 0) * 0.35
        + a.get("SPD", 0) * 1.2
        + a.get("DEF", 0) * 0.4
    )


def pit_val(p: dict) -> float:
    a = p["abilities"]
    return (
        a.get("IP", 0) * 10
        + a.get("K", 0) * 0.55
        + a.get("FO", 0) * 0.15
        + a.get("GO", 0) * 0.15
        - a.get("BB", 0) * 1.4
        - a.get("1B", 0) * 1.1
        - a.get("2B", 0) * 2.0
        - a.get("HR", 0) * 5.0
    )


def eligible(slot: str, p: dict) -> bool:
    return True if slot == "DH" else slot in p["positions"]


def min_salary(players: list[dict], pred) -> int:
    cands = [p["salary"] for p in players if pred(p)]
    return min(cands) if cands else 12


def assign_cores(cores: list[str], by: dict) -> list[dict | None] | None:
    lineup: list[dict | None] = [None] * 9
    rem = [by[i] for i in cores]
    while rem:
        rem.sort(
            key=lambda p: sum(
                1 for i, occ in enumerate(lineup) if occ is None and eligible(SLOTS[i], p)
            )
        )
        p = rem.pop(0)
        opts = [i for i, occ in enumerate(lineup) if occ is None and eligible(SLOTS[i], p)]
        if not opts:
            return None

        def pref(i: int) -> int:
            s = SLOTS[i]
            if s in p["positions"]:
                return p["positions"].index(s)
            return 0 if s == "DH" else 99

        opts.sort(key=pref)
        lineup[opts[0]] = p
    return lineup


def cover_ip(pits: list[dict], used: set[str], need: int, max_cost: int):
    """Cheapest-then-best arms covering `need` IP within max_cost."""
    cands = [p for p in pits if p["id"] not in used and p["salary"] <= max_cost]
    cands.sort(key=lambda p: (p["salary"] / max(p["abilities"]["IP"], 0.5), -p["_v"]))
    for p in cands:
        if p["abilities"]["IP"] >= need and p["salary"] <= max_cost:
            return [p]
    best = None
    n = min(len(cands), 140)
    for i in range(n):
        a = cands[i]
        for j in range(i + 1, n):
            b = cands[j]
            cost = a["salary"] + b["salary"]
            if cost > max_cost:
                continue
            if a["abilities"]["IP"] + b["abilities"]["IP"] < need:
                continue
            val = a["_v"] + b["_v"]
            if best is None or cost < best[0] or (cost == best[0] and val > best[1]):
                best = (cost, val, [a, b])
    return best[2] if best else None


def build(cores, pit_cores, meta, bats, pits, by):
    lineup = assign_cores(cores, by)
    if lineup is None:
        raise RuntimeError(f"assign fail {meta['abbr']}")

    used = set(cores) | set(pit_cores)
    staff = list(pit_cores)
    spent = sum(by[i]["salary"] for i in used)
    empty = [i for i, occ in enumerate(lineup) if occ is None]

    # Position floors for empty slots
    floors = []
    for i in empty:
        s = SLOTS[i]
        if s == "DH":
            floors.append(min_salary(bats, lambda p: True))
        else:
            floors.append(min_salary(bats, lambda p, slot=s: slot in p["positions"]))
    floor_bats = sum(floors)

    ip = sum(by[i]["abilities"]["IP"] for i in staff)
    extra = []
    if ip <= 9:
        need = 9 - ip + 1
        # Leave bat floors; spend the rest on a real arm, not Gomber-tier junk when possible.
        max_arm = CAP - spent - floor_bats
        # Prefer a single quality arm: best value among IP-covering arms costing <= max_arm,
        # but not forced to the absolute cheapest.
        cover = [p for p in pits if p["id"] not in used and p["abilities"]["IP"] >= need and p["salary"] <= max_arm]
        if cover:
            # Prefer cost-efficient arms so lineup isn't starved; avoid $150+ #2s
            # unless they are clearly elite per dollar.
            extra = [
                max(
                    cover,
                    key=lambda p: (p["_v"] / max(p["salary"], 1)) * 40
                    + p["_v"] * 0.35
                    - (0.25 * p["salary"] if p["salary"] > 90 else 0),
                )
            ]
        else:
            picked = cover_ip(pits, used, need, max_arm)
            if not picked:
                raise RuntimeError(f"IP fail {meta['abbr']} max_arm={max_arm}")
            extra = picked
        reserved = sum(p["salary"] for p in extra)
    else:
        reserved = 0

    bat_budget = CAP - spent - reserved
    if bat_budget < floor_bats:
        raise RuntimeError(f"bat budget {meta['abbr']} {bat_budget} < {floor_bats}")

    # Fill scarcest / highest-floor empties first
    order = sorted(range(len(empty)), key=lambda j: (-floors[j], SLOTS[empty[j]]))
    bat_spent = 0
    remaining_floors = floors[:]
    for rank, j in enumerate(order):
        i = empty[j]
        s = SLOTS[i]
        # remaining floor after this pick
        other = sum(remaining_floors[k] for k in range(len(empty)) if k != j and lineup[empty[k]] is None)
        # recount properly:
        still = [k for k in order[rank + 1:]]
        other = sum(floors[k] for k in still)
        rem = bat_budget - bat_spent
        max_here = rem - other
        cands = [p for p in bats if p["id"] not in used and eligible(s, p) and p["salary"] <= max_here]
        if not cands:
            raise RuntimeError(f"no cand {meta['abbr']} {s} max={max_here}")
        pick = max(cands, key=lambda p: (p["_v"], -p["salary"]))
        lineup[i] = pick
        used.add(pick["id"])
        bat_spent += pick["salary"]

    spent += bat_spent
    for p in extra:
        staff.append(p["id"])
        used.add(p["id"])
        spent += p["salary"]

    ip = sum(by[i]["abilities"]["IP"] for i in staff)
    assert ip > 9
    leftover = CAP - spent
    bench: list[str] = []

    def roster_n():
        return 9 + len(staff) + len(bench)

    # Greedy upgrades
    for _ in range(100):
        if leftover < 1:
            break
        best = None
        best_score = -1.0
        for i, p in enumerate(lineup):
            if p["id"] in cores:
                continue
            s = SLOTS[i]
            budget = p["salary"] + leftover
            for c in bats:
                if c["id"] in used or not eligible(s, c):
                    continue
                if not (p["salary"] < c["salary"] <= budget):
                    continue
                gain = c["_v"] - p["_v"]
                if gain <= 0.25:
                    continue
                cost = c["salary"] - p["salary"]
                # Keep enough leftover to reach min roster if needed
                need_slots = max(0, MIN_ROSTER - roster_n())
                # if replacing doesn't change count
                min_keep = 12 * need_slots
                if leftover - cost < min_keep:
                    continue
                score = gain - 0.015 * cost
                if score > best_score:
                    best_score = score
                    best = ("bat", i, p, c, cost)
        for si, pid in enumerate(staff):
            if pid in pit_cores:
                continue
            p = by[pid]
            budget = p["salary"] + leftover
            for c in pits:
                if c["id"] in used:
                    continue
                if not (p["salary"] < c["salary"] <= budget):
                    continue
                new_ip = ip - p["abilities"]["IP"] + c["abilities"]["IP"]
                if new_ip <= 9:
                    continue
                gain = c["_v"] - p["_v"]
                if gain <= 0.25:
                    continue
                cost = c["salary"] - p["salary"]
                need_slots = max(0, MIN_ROSTER - roster_n())
                if leftover - cost < 12 * need_slots:
                    continue
                score = gain - 0.015 * cost
                if score > best_score:
                    best_score = score
                    best = ("pit", si, p, c, cost)
        # Add depth pitcher
        if len(staff) < 5 and leftover >= 12:
            need_slots = max(0, MIN_ROSTER - (roster_n() + 1))
            for c in pits:
                if c["id"] in used or c["salary"] > leftover:
                    continue
                if leftover - c["salary"] < 12 * need_slots:
                    continue
                score = c["_v"] * 0.45
                if score > best_score:
                    best_score = score
                    best = ("addp", None, None, c, c["salary"])
        if not best:
            break
        kind = best[0]
        if kind == "bat":
            _, i, p, c, cost = best
            used.discard(p["id"])
            used.add(c["id"])
            lineup[i] = c
            leftover -= cost
            spent += cost
        elif kind == "pit":
            _, si, p, c, cost = best
            ip = ip - p["abilities"]["IP"] + c["abilities"]["IP"]
            used.discard(p["id"])
            used.add(c["id"])
            staff[si] = c["id"]
            leftover -= cost
            spent += cost
        else:
            _, _, _, c, cost = best
            staff.append(c["id"])
            used.add(c["id"])
            leftover -= cost
            spent += cost
            ip += c["abilities"]["IP"]

    # Pad to min roster with best leftover bench bats / arms
    while roster_n() < MIN_ROSTER:
        cands_b = [p for p in bats if p["id"] not in used and p["salary"] <= leftover]
        cands_p = [p for p in pits if p["id"] not in used and p["salary"] <= leftover]
        pick = None
        kind = None
        if cands_b:
            pick = max(cands_b, key=lambda p: p["_v"])
            kind = "b"
        if cands_p:
            p = max(cands_p, key=lambda p: p["_v"])
            if pick is None or p["_v"] * 0.5 > pick["_v"]:
                pick = p
                kind = "p"
        if pick is None:
            # Must free money: downgrade weakest non-core batter by salary gap
            raised = False
            weak = [
                (i, p)
                for i, p in enumerate(lineup)
                if p["id"] not in cores
            ]
            weak.sort(key=lambda t: t[1]["_v"])
            for i, p in weak:
                s = SLOTS[i]
                cheaper = [
                    c
                    for c in bats
                    if c["id"] not in used
                    and eligible(s, c)
                    and c["salary"] < p["salary"]
                    and c["_v"] >= p["_v"] - 8
                ]
                if not cheaper:
                    cheaper = [
                        c
                        for c in bats
                        if c["id"] not in used and eligible(s, c) and c["salary"] < p["salary"]
                    ]
                if not cheaper:
                    continue
                # free the most money with least value loss
                c = min(cheaper, key=lambda x: (p["_v"] - x["_v"]) / max(p["salary"] - x["salary"], 1))
                used.discard(p["id"])
                used.add(c["id"])
                freed = p["salary"] - c["salary"]
                leftover += freed
                spent -= freed
                lineup[i] = c
                raised = True
                break
            if not raised:
                raise RuntimeError(f"cannot reach min roster {meta['abbr']}")
            continue
        used.add(pick["id"])
        leftover -= pick["salary"]
        spent += pick["salary"]
        if kind == "p":
            staff.append(pick["id"])
            ip += pick["abilities"]["IP"]
        else:
            bench.append(pick["id"])

    # Spend any leftover on one more upgrade pass
    for _ in range(40):
        if leftover < 1:
            break
        best = None
        best_score = -1.0
        for i, p in enumerate(lineup):
            if p["id"] in cores:
                continue
            s = SLOTS[i]
            budget = p["salary"] + leftover
            for c in bats:
                if c["id"] in used or not eligible(s, c):
                    continue
                if not (p["salary"] < c["salary"] <= budget):
                    continue
                gain = c["_v"] - p["_v"]
                if gain <= 0.2:
                    continue
                cost = c["salary"] - p["salary"]
                score = gain - 0.01 * cost
                if score > best_score:
                    best_score = score
                    best = ("bat", i, p, c, cost)
        for bi, bid in enumerate(bench):
            p = by[bid]
            budget = p["salary"] + leftover
            for c in bats:
                if c["id"] in used:
                    continue
                if not (p["salary"] < c["salary"] <= budget):
                    continue
                gain = c["_v"] - p["_v"]
                if gain <= 0.2:
                    continue
                cost = c["salary"] - p["salary"]
                score = gain - 0.01 * cost
                if score > best_score:
                    best_score = score
                    best = ("bench", bi, p, c, cost)
        for si, pid in enumerate(staff):
            if pid in pit_cores:
                continue
            p = by[pid]
            budget = p["salary"] + leftover
            for c in pits:
                if c["id"] in used:
                    continue
                if not (p["salary"] < c["salary"] <= budget):
                    continue
                new_ip = ip - p["abilities"]["IP"] + c["abilities"]["IP"]
                if new_ip <= 9:
                    continue
                gain = c["_v"] - p["_v"]
                if gain <= 0.2:
                    continue
                cost = c["salary"] - p["salary"]
                score = gain - 0.01 * cost
                if score > best_score:
                    best_score = score
                    best = ("pit", si, p, c, cost)
        if not best:
            break
        kind = best[0]
        if kind == "bat":
            _, i, p, c, cost = best
            used.discard(p["id"])
            used.add(c["id"])
            lineup[i] = c
            leftover -= cost
            spent += cost
        elif kind == "bench":
            _, bi, p, c, cost = best
            used.discard(p["id"])
            used.add(c["id"])
            bench[bi] = c["id"]
            leftover -= cost
            spent += cost
        else:
            _, si, p, c, cost = best
            ip = ip - p["abilities"]["IP"] + c["abilities"]["IP"]
            used.discard(p["id"])
            used.add(c["id"])
            staff[si] = c["id"]
            leftover -= cost
            spent += cost

    ordered = [{"playerId": lineup[i]["id"], "pos": SLOTS[i]} for i in range(9)]
    ids = [x["playerId"] for x in ordered] + staff + bench
    total = sum(by[i]["salary"] for i in ids)
    assert total <= CAP
    assert len(ids) == len(set(ids))
    assert len(ids) >= MIN_ROSTER
    assert sum(by[i]["abilities"]["IP"] for i in staff) > 9
    val = sum(by[i]["_v"] for i in ids)
    return {
        **meta,
        "lineup": ordered,
        "pitchingStaff": staff,
        "starterId": staff[0],
        "bench": bench,
        "salary": total,
        "_val": val,
        "_left": CAP - total,
        "_n": len(ids),
    }


def main():
    data = json.loads(PLAYERS.read_text())
    bats = data["batters"]
    pits = data["pitchers"]
    by = {p["id"]: p for p in bats + pits}
    for p in bats:
        p["_v"] = bat_val(p)
    for p in pits:
        p["_v"] = pit_val(p)

    specs = [
        (
            ["b_188", "b_288"],
            ["p_449"],
            dict(
                id="ai_offense",
                name="AI Offense First",
                abbr="OFF",
                blurb="Judge + Ohtani + Skubal; value around them.",
            ),
        ),
        (
            ["b_188"],
            ["p_519", "p_449"],
            dict(
                id="ai_twoace",
                name="AI Two-Ace",
                abbr="ACE",
                blurb="Wheeler + Skubal + Judge; no Ohtani.",
            ),
        ),
        (
            ["b_188", "b_288"],
            ["p_114"],
            dict(
                id="ai_dual",
                name="AI Dual Threat",
                abbr="DUAL",
                blurb="Judge + Ohtani + Crochet.",
            ),
        ),
        (
            ["b_314", "b_451", "b_317", "b_377"],
            ["p_449"],
            dict(
                id="ai_midstack",
                name="AI Mid-Star Stack",
                abbr="MID",
                blurb="Raleigh + Witt + Ramírez + Springer + Skubal (no Judge/Ohtani).",
            ),
        ),
        (
            ["b_188", "b_376", "b_38"],
            ["p_449"],
            dict(
                id="ai_ofcore",
                name="AI Outfield Core",
                abbr="OFC",
                blurb="Judge + Soto + Bellinger + Skubal.",
            ),
        ),
    ]

    builds = []
    for cores, pit_cores, meta in specs:
        b = build(cores, pit_cores, meta, bats, pits, by)
        builds.append(b)
        print("=" * 60)
        print(
            f"{b['abbr']} ${b['salary']} left=${b['_left']} val={b['_val']:.0f} n={b['_n']}  {b['blurb']}"
        )
        for slot in b["lineup"]:
            p = by[slot["playerId"]]
            a = p["abilities"]
            print(
                f"  {slot['pos']:3} ${p['salary']:3} {p['name']:22} "
                f"H{a['H']:2} 2B{a['2B']} HR{a['HR']:2} BB{a['BB']:2} K{a['K']:2} v={p['_v']:.0f}"
            )
        for pid in b["pitchingStaff"]:
            p = by[pid]
            a = p["abilities"]
            star = "*" if pid == b["starterId"] else " "
            print(
                f"  {star}P ${p['salary']:3} {p['name']:22} "
                f"IP{a['IP']} K{a['K']:2} HR{a['HR']} BB{a['BB']} v={p['_v']:.0f}"
            )
        for bid in b["bench"]:
            p = by[bid]
            print(f"  BN ${p['salary']:3} {p['name']:22} v={p['_v']:.0f}")

    data["opponents"] = [{k: v for k, v in b.items() if not k.startswith("_")} for b in builds]
    PLAYERS.write_text(json.dumps(data, indent=2) + "\n")
    print("\nWrote", PLAYERS)


if __name__ == "__main__":
    main()
