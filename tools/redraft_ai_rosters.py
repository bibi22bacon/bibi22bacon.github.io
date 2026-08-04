#!/usr/bin/env python3
"""Rebuild the five AI / top-build opponents to maximize card strength under $1000."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAYERS = ROOT / "game" / "data" / "players.json"
CAP = 1000
MIN_ROSTER = 12
SLOTS = ["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "DH"]


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
        + a.get("FO", 0) * 0.1
        + a.get("GO", 0) * 0.1
        - a.get("BB", 0) * 1.4
        - a.get("1B", 0) * 1.1
        - a.get("2B", 0) * 2.0
        - a.get("HR", 0) * 5.0
    )


def eligible(slot: str, p: dict) -> bool:
    return True if slot == "DH" else slot in p.get("positions", [])


def min_sal(players, pred) -> int:
    vals = [p["salary"] for p in players if pred(p)]
    return min(vals) if vals else 12


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


def build(cores, pit_cores, meta, bats, pits, by, banned=None):
    banned = set(banned or [])
    lineup = assign_cores(cores, by)
    if lineup is None:
        raise RuntimeError(f"assign fail {meta['abbr']}")

    used = set(cores) | set(pit_cores)
    staff = list(pit_cores)
    spent = sum(by[i]["salary"] for i in used)
    empty = [i for i, occ in enumerate(lineup) if occ is None]

    floors = []
    for i in empty:
        s = SLOTS[i]
        if s == "DH":
            floors.append(min_sal(bats, lambda p: p["id"] not in banned))
        else:
            floors.append(
                min_sal(bats, lambda p, slot=s: slot in p["positions"] and p["id"] not in banned)
            )
    floor_bats = sum(floors)

    ip = sum(by[i]["abilities"]["IP"] for i in staff)
    extra = []
    reserved_pit = 0
    if ip <= 9:
        need = 9 - ip + 1
        max_arm = CAP - spent - floor_bats
        cover = [
            p
            for p in pits
            if p["id"] not in used
            and p["id"] not in banned
            and p["abilities"]["IP"] >= need
            and p["salary"] <= max_arm
        ]
        if cover:
            # Prefer cheap IP cover so lineup budget stays healthy; mild value tiebreak
            extra = [
                max(
                    cover,
                    key=lambda p: p["_v"] * 0.35
                    - p["salary"] * 0.55
                    + (8 if p["abilities"]["IP"] >= need + 1 else 0),
                )
            ]
        else:
            # cheapest cover
            cands = sorted(
                [p for p in pits if p["id"] not in used and p["id"] not in banned],
                key=lambda p: (p["salary"] / max(p["abilities"]["IP"], 0.5), -p["_v"]),
            )
            found = None
            for p in cands:
                if p["abilities"]["IP"] >= need and p["salary"] <= max_arm:
                    found = [p]
                    break
            if not found:
                best = None
                for i, a in enumerate(cands[:100]):
                    for b in cands[i + 1 : 100]:
                        cost = a["salary"] + b["salary"]
                        if cost > max_arm:
                            continue
                        if a["abilities"]["IP"] + b["abilities"]["IP"] < need:
                            continue
                        val = a["_v"] + b["_v"]
                        if best is None or cost < best[0] or (cost == best[0] and val > best[1]):
                            best = (cost, val, [a, b])
                if best:
                    found = best[2]
            if not found:
                raise RuntimeError(f"IP fail {meta['abbr']}")
            extra = found
        reserved_pit = sum(p["salary"] for p in extra)

    bat_budget = CAP - spent - reserved_pit
    if bat_budget < floor_bats:
        raise RuntimeError(f"bat budget {meta['abbr']}")

    # Fill empties with roughly even spend so later slots aren't $12 trash.
    # Hard-ish share: ~1.15× even, so leftover can upgrade the weakest later.
    order = sorted(range(len(empty)), key=lambda j: (-floors[j], SLOTS[empty[j]]))
    bat_spent = 0
    for rank, j in enumerate(order):
        i = empty[j]
        s = SLOTS[i]
        still = order[rank + 1 :]
        other = sum(floors[k] for k in still)
        rem = bat_budget - bat_spent
        slots_left = 1 + len(still)
        even = rem / slots_left
        soft_cap = max(floors[j] + 5, int(even * 1.15) + 5)
        hard_max = rem - other
        max_here = min(hard_max, soft_cap)
        cands = [
            p
            for p in bats
            if p["id"] not in used
            and p["id"] not in banned
            and eligible(s, p)
            and p["salary"] <= max_here
        ]
        # If the share band is empty of decent cards, open to hard max
        if not cands or max(p["_v"] for p in cands) < 38:
            cands = [
                p
                for p in bats
                if p["id"] not in used
                and p["id"] not in banned
                and eligible(s, p)
                and p["salary"] <= hard_max
            ]
        if not cands:
            raise RuntimeError(f"no cand {meta['abbr']} {s}")
        # Prefer efficiency inside the share so we don't blow budget early
        pick = max(
            cands,
            key=lambda p: (p["_v"] / max(p["salary"], 1)) * 80 + p["_v"] * 4 - 0.08 * abs(p["salary"] - even),
        )
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

    # Aggressive upgrades — kill floor trash
    for _ in range(120):
        leftover = CAP - spent
        if leftover < 1 and roster_n() >= MIN_ROSTER:
            break
        best = None
        best_score = -1.0
        for i, p in enumerate(lineup):
            if p["id"] in cores:
                continue
            s = SLOTS[i]
            budget = p["salary"] + leftover
            for c in bats:
                if c["id"] in used or c["id"] in banned or not eligible(s, c):
                    continue
                if not (p["salary"] < c["salary"] <= budget):
                    continue
                gain = c["_v"] - p["_v"]
                if gain <= 0.15:
                    continue
                cost = c["salary"] - p["salary"]
                need_slots = max(0, MIN_ROSTER - roster_n())
                if leftover - cost < 12 * need_slots:
                    continue
                # Heavily reward replacing weak cards
                weak_bonus = max(0, 55 - p["_v"]) * 0.35
                floor_bonus = 8.0 if p["salary"] <= 20 else (3.0 if p["salary"] <= 35 else 0.0)
                score = gain + weak_bonus + floor_bonus - 0.004 * cost
                if score > best_score:
                    best_score = score
                    best = ("bat", i, p, c, cost)
        for si, pid in enumerate(staff):
            if pid in pit_cores:
                continue
            p = by[pid]
            budget = p["salary"] + leftover
            for c in pits:
                if c["id"] in used or c["id"] in banned:
                    continue
                if not (p["salary"] < c["salary"] <= budget):
                    continue
                new_ip = ip - p["abilities"]["IP"] + c["abilities"]["IP"]
                if new_ip <= 9:
                    continue
                gain = c["_v"] - p["_v"]
                if gain <= 0.15:
                    continue
                cost = c["salary"] - p["salary"]
                need_slots = max(0, MIN_ROSTER - roster_n())
                if leftover - cost < 12 * need_slots:
                    continue
                score = gain - 0.008 * cost
                if score > best_score:
                    best_score = score
                    best = ("pit", si, p, c, cost)
        # Add depth if under min roster or leftover is large
        if roster_n() < MIN_ROSTER or (leftover >= 40 and roster_n() < 14):
            for c in bats:
                if c["id"] in used or c["id"] in banned or c["salary"] > leftover:
                    continue
                need_slots = max(0, MIN_ROSTER - (roster_n() + 1))
                if leftover - c["salary"] < 12 * need_slots:
                    continue
                score = c["_v"] * 0.55
                if score > best_score:
                    best_score = score
                    best = ("addb", None, None, c, c["salary"])
            for c in pits:
                if c["id"] in used or c["id"] in banned or c["salary"] > leftover:
                    continue
                if len(staff) >= 5:
                    continue
                need_slots = max(0, MIN_ROSTER - (roster_n() + 1))
                if leftover - c["salary"] < 12 * need_slots:
                    continue
                score = c["_v"] * 0.5
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
        elif kind == "addb":
            _, _, _, c, cost = best
            bench.append(c["id"])
            used.add(c["id"])
            leftover -= cost
            spent += cost
        else:
            _, _, _, c, cost = best
            staff.append(c["id"])
            used.add(c["id"])
            leftover -= cost
            spent += cost
            ip += c["abilities"]["IP"]

    while roster_n() < MIN_ROSTER:
        leftover = CAP - spent
        cands = [
            p
            for p in bats + pits
            if p["id"] not in used and p["id"] not in banned and p["salary"] <= leftover
        ]
        if not cands:
            # downgrade weakest non-core to free money
            weak = [(i, p) for i, p in enumerate(lineup) if p["id"] not in cores]
            weak.sort(key=lambda t: t[1]["_v"])
            raised = False
            for i, p in weak:
                s = SLOTS[i]
                cheaper = [
                    c
                    for c in bats
                    if c["id"] not in used
                    and c["id"] not in banned
                    and eligible(s, c)
                    and c["salary"] < p["salary"]
                ]
                if not cheaper:
                    continue
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
                raise RuntimeError(f"min roster {meta['abbr']}")
            continue
        pick = max(cands, key=lambda p: p["_v"] if p["id"].startswith("b_") else p["_v"] * 0.5)
        used.add(pick["id"])
        spent += pick["salary"]
        if pick["id"].startswith("p_"):
            staff.append(pick["id"])
            ip += pick["abilities"]["IP"]
        else:
            bench.append(pick["id"])

    ordered = [{"playerId": lineup[i]["id"], "pos": SLOTS[i]} for i in range(9)]
    ids = [x["playerId"] for x in ordered] + staff + bench
    total = sum(by[i]["salary"] for i in ids)
    assert total <= CAP and len(ids) == len(set(ids)) and len(ids) >= MIN_ROSTER
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

    # Identity cores kept light so supporting cast isn't $12 trash.
    # banned sets keep the five builds distinct.
    judge, ohtani = "b_188", "b_288"
    skubal, wheeler, crochet = "p_449", "p_519", "p_114"
    suarez, fried = "p_475", "p_167"
    raleigh, witt, ramirez, marte = "b_314", "b_451", "b_317", "b_235"
    soto, belli, acuna = "b_376", "b_38", "b_2"

    specs = [
        (
            # ~$584 cores + cheap ace → ~$320 for corners/OF depth
            [judge, ohtani, raleigh, witt],
            [suarez],
            dict(
                id="ai_offense",
                name="AI Offense First",
                abbr="OFF",
                blurb="Judge + Ohtani + Raleigh + Witt; Suarez saves budget for bats.",
            ),
            [skubal, wheeler],
        ),
        (
            # Two aces eat ~$374 — only lock Judge so IF/OF can fill
            [judge],
            [skubal, wheeler],
            dict(
                id="ai_twoace",
                name="AI Two-Ace",
                abbr="ACE",
                blurb="Skubal + Wheeler + Judge; deep supporting lineup.",
            ),
            [ohtani],
        ),
        (
            # Drop one IF star so C/SS/OF aren't floor scraps
            [judge, ohtani, marte],
            [crochet],
            dict(
                id="ai_dual",
                name="AI Dual Threat",
                abbr="DUAL",
                blurb="Judge + Ohtani + Marte + Crochet; balanced depth.",
            ),
            [skubal, wheeler],
        ),
        (
            # No Judge/Ohtani; four mid stars + Skubal
            [raleigh, witt, ramirez, marte],
            [skubal],
            dict(
                id="ai_midstack",
                name="AI Mid-Star Stack",
                abbr="MID",
                blurb="No Judge/Ohtani — Raleigh/Witt/Ramírez/Marte + Skubal.",
            ),
            [judge, ohtani],
        ),
        (
            # Four OF stars + value ace; Witt anchors SS
            [judge, soto, belli, acuna, witt],
            [fried],
            dict(
                id="ai_ofcore",
                name="AI Outfield Core",
                abbr="OFC",
                blurb="Judge + Soto + Bellinger + Acuña + Witt + Fried.",
            ),
            [ohtani, skubal],
        ),
    ]

    builds = []
    for cores, pit_cores, meta, banned in specs:
        # Drop any core id that doesn't exist
        cores = [c for c in cores if c in by]
        pit_cores = [c for c in pit_cores if c in by]
        banned = [c for c in banned if c in by]
        b = build(cores, pit_cores, meta, bats, pits, by, banned=banned)
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
                f"H{a['H']:2} HR{a['HR']:2} v={p['_v']:.0f}"
            )
        for pid in b["pitchingStaff"]:
            p = by[pid]
            a = p["abilities"]
            star = "*" if pid == b["starterId"] else " "
            print(
                f"  {star}P ${p['salary']:3} {p['name']:22} "
                f"IP{a['IP']} K{a['K']:2} HR{a['HR']} v={p['_v']:.0f}"
            )
        for bid in b["bench"]:
            p = by[bid]
            print(f"  BN ${p['salary']:3} {p['name']:22} v={p['_v']:.0f}")

    # Sanity: each build should crush old ~730 val band
    vals = [b["_val"] for b in builds]
    print("\nValues:", [round(v) for v in vals], "min", round(min(vals)))

    data["opponents"] = [{k: v for k, v in b.items() if not k.startswith("_")} for b in builds]
    PLAYERS.write_text(json.dumps(data, indent=2) + "\n")
    print("Wrote", PLAYERS)


if __name__ == "__main__":
    main()
