#!/usr/bin/env python3
"""Build editable default rosters for all 30 MLB teams under the $1000 cap."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAYERS = ROOT / "game" / "data" / "players.json"
OUT = ROOT / "game" / "data" / "team_rosters.json"
CAP = 1000
MIN_ROSTER = 12
SLOTS = ["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "DH"]

TEAM_NAMES = {
    "ATH": "Athletics",
    "ATL": "Atlanta Braves",
    "AZ": "Arizona Diamondbacks",
    "BAL": "Baltimore Orioles",
    "BOS": "Boston Red Sox",
    "CHC": "Chicago Cubs",
    "CIN": "Cincinnati Reds",
    "CLE": "Cleveland Guardians",
    "COL": "Colorado Rockies",
    "CWS": "Chicago White Sox",
    "DET": "Detroit Tigers",
    "HOU": "Houston Astros",
    "KC": "Kansas City Royals",
    "LAA": "Los Angeles Angels",
    "LAD": "Los Angeles Dodgers",
    "MIA": "Miami Marlins",
    "MIL": "Milwaukee Brewers",
    "MIN": "Minnesota Twins",
    "NYM": "New York Mets",
    "NYY": "New York Yankees",
    "PHI": "Philadelphia Phillies",
    "PIT": "Pittsburgh Pirates",
    "SD": "San Diego Padres",
    "SEA": "Seattle Mariners",
    "SF": "San Francisco Giants",
    "STL": "St. Louis Cardinals",
    "TB": "Tampa Bay Rays",
    "TEX": "Texas Rangers",
    "TOR": "Toronto Blue Jays",
    "WSH": "Washington Nationals",
}


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
        - a.get("BB", 0) * 1.4
        - a.get("1B", 0) * 1.1
        - a.get("2B", 0) * 2.0
        - a.get("HR", 0) * 5.0
    )


def eligible(slot: str, p: dict) -> bool:
    if slot == "DH":
        return True
    return slot in p.get("positions", [])


def build_team(abbr: str, bats: list, pits: list, all_bats: list, all_pits: list) -> dict | None:
    used: set[str] = set()
    lineup: list[dict | None] = [None] * 9
    spent = 0
    borrowed: list[str] = []

    # Fill slots scarcest / most constrained first
    order = sorted(
        range(9),
        key=lambda i: (
            0 if SLOTS[i] != "DH" else 1,
            -sum(1 for p in bats if eligible(SLOTS[i], p)),
            SLOTS[i],
        ),
    )

    for i in order:
        slot = SLOTS[i]
        left = sum(1 for x in lineup if x is None) - 1
        max_here = CAP - spent - 12 * left - 40
        pool = bats
        cands = [
            p
            for p in pool
            if p["id"] not in used and eligible(slot, p) and p["salary"] <= max(max_here, 12)
        ]
        if not cands:
            max_here = CAP - spent - 12 * left - 24
            cands = [
                p
                for p in pool
                if p["id"] not in used and eligible(slot, p) and p["salary"] <= max(max_here, 12)
            ]
        # Thin depth charts: borrow cheapest legal league filler
        if not cands:
            max_here = CAP - spent - 12 * left - 24
            cands = sorted(
                [
                    p
                    for p in all_bats
                    if p["id"] not in used and eligible(slot, p) and p["salary"] <= max(max_here, 12)
                ],
                key=lambda p: (p["salary"], -p["_v"]),
            )[:8]
            if cands:
                borrowed.append(slot)
        if not cands:
            return None
        if slot in borrowed or (cands and cands[0].get("team") != abbr and pool is bats and not any(p["team"] == abbr for p in cands)):
            pick = min(cands, key=lambda p: (p["salary"], -p["_v"]))
            if slot not in borrowed:
                borrowed.append(slot)
        else:
            # prefer team players
            team_cands = [p for p in cands if p["team"] == abbr]
            pick = max(team_cands or cands, key=lambda p: (p["_v"], -p["salary"]))
        lineup[i] = {"playerId": pick["id"], "pos": slot}
        used.add(pick["id"])
        spent += pick["salary"]

    # Pitching: need IP > 9 (prefer team arms, else borrow)
    staff: list[str] = []
    ip = 0
    rem = CAP - spent
    arms = [p for p in pits if p["id"] not in used]
    if not arms:
        arms = [p for p in all_pits if p["id"] not in used]
    starter_cands = [p for p in arms if p["salary"] <= rem - 12 and p["abilities"]["IP"] >= 5]
    if not starter_cands:
        starter_cands = [p for p in arms if p["salary"] <= rem]
    if not starter_cands:
        starter_cands = [
            p for p in all_pits if p["id"] not in used and p["salary"] <= rem
        ]
        borrowed.append("P")
    if not starter_cands:
        return None
    starter = max(starter_cands, key=lambda p: p["_v"])
    staff.append(starter["id"])
    used.add(starter["id"])
    spent += starter["salary"]
    ip += starter["abilities"]["IP"]

    while ip <= 9:
        rem = CAP - spent
        need = 9 - ip + 1
        cands = [p for p in pits if p["id"] not in used and p["salary"] <= rem]
        if not cands:
            cands = [p for p in all_pits if p["id"] not in used and p["salary"] <= rem]
            if cands and "P" not in borrowed:
                borrowed.append("P")
        if not cands:
            return None
        cover = [p for p in cands if p["abilities"]["IP"] >= need]
        pick = max(
            cover or cands,
            key=lambda p: (min(p["abilities"]["IP"], need) * 8 + p["_v"] * 0.3)
            / max(p["salary"], 1),
        )
        staff.append(pick["id"])
        used.add(pick["id"])
        spent += pick["salary"]
        ip += pick["abilities"]["IP"]

    bench: list[str] = []

    def n_players():
        return 9 + len(staff) + len(bench)

    leftover = CAP - spent
    while n_players() < MIN_ROSTER and leftover >= 12:
        cands_b = [p for p in bats if p["id"] not in used and p["salary"] <= leftover]
        if not cands_b:
            cands_b = [p for p in all_bats if p["id"] not in used and p["salary"] <= leftover]
        cands_p = [p for p in pits if p["id"] not in used and p["salary"] <= leftover]
        if not cands_p:
            cands_p = [p for p in all_pits if p["id"] not in used and p["salary"] <= leftover]
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
        if not pick:
            break
        used.add(pick["id"])
        leftover -= pick["salary"]
        spent += pick["salary"]
        if kind == "p":
            staff.append(pick["id"])
            ip += pick["abilities"]["IP"]
        else:
            bench.append(pick["id"])

    # Greedy upgrades with leftover — same-team only (keep identity)
    for _ in range(40):
        leftover = CAP - spent
        if leftover < 1:
            break
        best = None
        best_score = -1.0
        for i, slot in enumerate(lineup):
            p = next(x for x in all_bats if x["id"] == slot["playerId"])
            budget = p["salary"] + leftover
            for c in bats:
                if c["id"] in used or not eligible(slot["pos"], c):
                    continue
                if not (p["salary"] < c["salary"] <= budget):
                    continue
                gain = c["_v"] - p["_v"]
                # Prefer replacing a borrowed filler with a team player even if close
                if p["team"] != abbr and c["team"] == abbr:
                    gain += 8
                if gain <= 0.2:
                    continue
                cost = c["salary"] - p["salary"]
                score = gain - 0.01 * cost
                if score > best_score:
                    best_score = score
                    best = ("bat", i, p, c, cost)
        for bi, bid in enumerate(bench):
            p = next(x for x in all_bats if x["id"] == bid)
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
            p = next(x for x in all_pits if x["id"] == pid)
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
                if p["team"] != abbr and c["team"] == abbr:
                    gain += 8
                if gain <= 0.2:
                    continue
                cost = c["salary"] - p["salary"]
                score = gain - 0.01 * cost
                if score > best_score:
                    best_score = score
                    best = ("pit", si, p, c, cost)
        if not best:
            if n_players() < 18 and leftover >= 12:
                cands = [p for p in bats if p["id"] not in used and p["salary"] <= leftover]
                if cands:
                    c = max(cands, key=lambda p: p["_v"])
                    used.add(c["id"])
                    bench.append(c["id"])
                    spent += c["salary"]
                    continue
            break
        kind = best[0]
        if kind == "bat":
            _, i, p, c, cost = best
            used.discard(p["id"])
            used.add(c["id"])
            lineup[i] = {"playerId": c["id"], "pos": lineup[i]["pos"]}
            spent += cost
        elif kind == "bench":
            _, bi, p, c, cost = best
            used.discard(p["id"])
            used.add(c["id"])
            bench[bi] = c["id"]
            spent += cost
        else:
            _, si, p, c, cost = best
            ip = ip - p["abilities"]["IP"] + c["abilities"]["IP"]
            used.discard(p["id"])
            used.add(c["id"])
            staff[si] = c["id"]
            spent += cost

    # Refresh borrowed note from final roster
    borrowed_final = []
    for slot in lineup:
        p = next(x for x in all_bats if x["id"] == slot["playerId"])
        if p["team"] != abbr:
            borrowed_final.append(slot["pos"])
    for pid in staff + bench:
        p = next((x for x in all_bats + all_pits if x["id"] == pid), None)
        if p and p["team"] != abbr:
            tag = "P" if pid.startswith("p_") else "BN"
            if tag not in borrowed_final:
                borrowed_final.append(tag)

    if n_players() < MIN_ROSTER or ip <= 9 or spent > CAP:
        return None

    return {
        "id": f"team_{abbr.lower()}",
        "abbr": abbr,
        "name": TEAM_NAMES.get(abbr, abbr),
        "lineup": lineup,
        "pitchingStaff": staff,
        "starterId": staff[0],
        "bench": bench,
        "salary": spent,
        "staffIP": ip,
        "size": n_players(),
        "note": (
            f"Includes call-up fillers for: {', '.join(borrowed_final)}"
            if borrowed_final
            else "All players from this team"
        ),
    }


def main():
    data = json.loads(PLAYERS.read_text())
    bats_all = data["batters"]
    pits_all = data["pitchers"]
    for p in bats_all:
        p["_v"] = bat_val(p)
    for p in pits_all:
        p["_v"] = pit_val(p)

    teams = sorted(TEAM_NAMES)
    out = []
    failed = []
    for abbr in teams:
        bats = [p for p in bats_all if p["team"] == abbr]
        pits = [p for p in pits_all if p["team"] == abbr]
        roster = build_team(abbr, bats, pits, bats_all, pits_all)
        if not roster:
            failed.append(abbr)
            print("FAIL", abbr)
            continue
        out.append(roster)
        print(f"OK {abbr} ${roster['salary']} n={roster['size']} IP={roster['staffIP']}")

    if failed:
        raise SystemExit(f"Failed teams: {failed}")

    payload = {"teams": out, "cap": CAP, "generatedFrom": "card-ability salaries"}
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {len(out)} teams → {OUT}")


if __name__ == "__main__":
    main()
