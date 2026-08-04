#!/usr/bin/env python3
"""
Salary scale for 9-Inning Duel — absolute ability anchors.

Why this replaces AI-market $ and pure percentiles
--------------------------------------------------
1) Live AI-draft dollars plateau → fake $1 cliffs.
2) Percentiles over the *whole* pool make every everyday MLB regular look
   like a star (because the long tail of scrub cards fills the bottom).

New method
----------
• Rebuild outcome rates from counting stats (AB/BB/SO/…), *before* the
  card's 2×-from-average stretch.
• Score batters / pitchers with the game's value formulas.
• Map **absolute score → dollars** with anchors sized for a $1000 cap.
• Light positional scarcity for batters.
• Floor $12, ceil $200.

Result: Judge/Ohtani cost star money; Soto/Freeman cost mid-star money;
bench pieces stay in the teens/20s — and a normal roster fits under $1000.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path("/workspace")
PLAYERS_JSON = ROOT / "game/data/players.json"
BATTERS_CSV = ROOT / "game/data/batters.csv"
PITCHERS_CSV = ROOT / "game/data/pitchers.csv"
OUT_DIR = ROOT / "data"

CAP = 1000
FLOOR = 12
CEIL = 200

# Absolute value → salary (piecewise linear). Tuned on real-rate scores.
BAT_ANCHORS = [
    (12.0, 12),
    (16.0, 18),
    (18.0, 28),
    (19.5, 40),
    (21.0, 60),
    (22.5, 95),
    (24.0, 135),
    (25.5, 170),
    (27.0, 190),
    (29.0, 200),
]
PIT_ANCHORS = [
    (18.0, 12),
    (24.0, 24),
    (28.0, 40),
    (32.0, 65),
    (36.0, 110),
    (40.0, 150),
    (44.0, 175),
    (48.0, 190),
    (52.0, 200),
]

POS_SCARCITY = {
    "C": 1.10,
    "SS": 1.07,
    "2B": 1.03,
    "3B": 1.02,
    "1B": 0.98,
    "OF": 0.97,
    "DH": 0.94,
}


def fnum(x, default=0.0):
    try:
        return float(str(x).replace(",", ""))
    except Exception:
        return default


def batter_value(a: dict) -> float:
    return (
        0.35 * a["BB"]
        + 0.45 * a["H"]
        + 0.75 * a["2B"]
        + 1.40 * a["HR"]
        - 0.12 * a["K"]
        - 0.02 * a.get("FO", 0)
        - 0.02 * a.get("GO", 0)
        + 0.35 * max(a.get("SPD", 0), 0)
        + 0.25 * a.get("DEF", 0)
    )


def pitcher_value(a: dict) -> float:
    quality = (
        0.55 * a["K"]
        + 0.18 * a["FO"]
        + 0.22 * a["GO"]
        - 0.40 * a["BB"]
        - 0.35 * a["1B"]
        - 0.55 * a["2B"]
        - 1.10 * a["HR"]
    )
    return quality + 3.2 * a["IP"]


def lerp(anchors, x: float) -> float:
    if x <= anchors[0][0]:
        return float(anchors[0][1])
    if x >= anchors[-1][0]:
        return float(anchors[-1][1])
    for (x0, y0), (x1, y1) in zip(anchors, anchors[1:]):
        if x <= x1:
            t = (x - x0) / (x1 - x0) if x1 != x0 else 1.0
            return y0 + (y1 - y0) * t
    return float(anchors[-1][1])


def load_batter_real_rates() -> dict[str, dict]:
    rows = list(csv.reader(BATTERS_CSV.open(encoding="utf-8")))
    out = {}
    for row in rows[3:]:
        if not row or not row[0]:
            continue
        pa = fnum(row[13]) or 1.0
        ab = fnum(row[5])
        s1, s2, s3, hr = fnum(row[6]), fnum(row[7]), fnum(row[8]), fnum(row[9])
        so, bb, gb = fnum(row[10]), fnum(row[11]), fnum(row[12])
        bip = max(0.0, ab - so - s1 - s2 - s3 - hr)
        bip_pct = bip / pa * 100
        go = bip_pct * gb / 100
        fo = bip_pct - go
        # SPD/DEF still from card (not outcome rates)
        out[row[0]] = {
            "K": so / pa * 100,
            "BB": bb / pa * 100,
            "H": s1 / pa * 100,
            "2B": (s2 + s3) / pa * 100,
            "HR": hr / pa * 100,
            "FO": fo,
            "GO": go,
            "PA": pa,
        }
    return out


def load_pitcher_real_rates() -> dict[str, dict]:
    rows = list(csv.reader(PITCHERS_CSV.open(encoding="utf-8")))
    out = {}
    for row in rows[3:]:
        if not row or not row[0]:
            continue
        pa = fnum(row[13]) or 1.0
        ab = fnum(row[5])
        s1, s2, s3, hr = fnum(row[6]), fnum(row[7]), fnum(row[8]), fnum(row[9])
        so, bb, gb = fnum(row[10]), fnum(row[11]), fnum(row[12])
        ip = fnum(row[15])
        bip = max(0.0, ab - so - s1 - s2 - s3 - hr)
        bip_pct = bip / pa * 100
        go = bip_pct * gb / 100
        fo = bip_pct - go
        out[row[0]] = {
            "K": so / pa * 100,
            "BB": bb / pa * 100,
            "1B": s1 / pa * 100,
            "2B": (s2 + s3) / pa * 100,
            "HR": hr / pa * 100,
            "FO": fo,
            "GO": go,
            "IP": max(1.0, round(ip / 30) if ip else 1.0),  # card-like IP buckets
            "IP_raw": ip,
        }
    return out


def price_players(data: dict) -> tuple[list[dict], list[dict]]:
    bat_rates = load_batter_real_rates()
    pit_rates = load_pitcher_real_rates()
    batters, pitchers = [], []

    for b in data["batters"]:
        rates = dict(bat_rates.get(b["name"], {}))
        rates["SPD"] = b["abilities"].get("SPD", 0)
        rates["DEF"] = b["abilities"].get("DEF", 5)
        val = batter_value(rates)
        mult = POS_SCARCITY.get((b.get("positions") or ["DH"])[0], 1.0)
        sal = int(round(max(FLOOR, min(CEIL, lerp(BAT_ANCHORS, val) * mult))))
        rec = {**b, "kind": "batter", "value": round(val, 3), "salary": sal}
        batters.append(rec)

    for p in data["pitchers"]:
        rates = dict(pit_rates.get(p["name"], {}))
        # Prefer printed card IP (game rule resource)
        rates["IP"] = p["abilities"].get("IP", rates.get("IP", 1))
        val = pitcher_value(rates)
        sal = int(round(max(FLOOR, min(CEIL, lerp(PIT_ANCHORS, val)))))
        rec = {**p, "kind": "pitcher", "value": round(val, 3), "salary": sal}
        pitchers.append(rec)

    return batters, pitchers


def upd_csv(path: Path, group: list[dict]) -> None:
    rows = list(csv.reader(path.open(encoding="utf-8")))
    sal_idx = header_i = None
    for i, row in enumerate(rows[:5]):
        if "Salary" in row:
            sal_idx, header_i = row.index("Salary"), i
            break
    if sal_idx is None:
        return
    by_name = {p["name"]: p for p in group}
    for row in rows[header_i + 1 :]:
        if row and row[0] in by_name:
            while len(row) <= sal_idx:
                row.append("")
            row[sal_idx] = str(by_name[row[0]]["salary"])
    with path.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(rows)


def rebuild_opponents(data: dict) -> list[dict]:
    bm = {b["name"]: b for b in data["batters"]}
    pm = {p["name"]: p for p in data["pitchers"]}

    def covers(name: str, slot: str) -> bool:
        b = bm[name]
        if slot == "DH":
            return True
        if slot == "OF":
            return "OF" in b["positions"]
        return slot in b["positions"]

    def raw_b(n: str) -> float:
        a = bm[n]["abilities"]
        return (
            0.35 * a["BB"]
            + 0.45 * a["H"]
            + 0.75 * a["2B"]
            + 1.40 * a["HR"]
            - 0.12 * a["K"]
            + 0.35 * max(a["SPD"], 0)
            + 0.25 * a["DEF"]
        )

    def build(cores_b, cores_p, meta, forbid_b=()):
        slots = ["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "DH"]
        used = set(cores_b) | set(cores_p) | set(forbid_b)
        spent = sum(bm[n]["salary"] for n in cores_b) + sum(pm[n]["salary"] for n in cores_p)
        assigned = [None] * 9
        cores_set = set(cores_b)

        def place(name: str) -> None:
            opts = [i for i, s in enumerate(slots) if assigned[i] is None and covers(name, s)]
            if name == "Ohtani, Shohei" and any(slots[i] == "DH" for i in opts):
                idx = next(i for i in opts if slots[i] == "DH")
            else:
                nondh = [i for i in opts if slots[i] != "DH"]
                idx = (nondh or opts)[0]
            assigned[idx] = name

        for name in cores_b:
            place(name)

        core_ip = sum(pm[n]["abilities"]["IP"] for n in cores_p)
        pitch_reserve = 0 if core_ip > 9 else 55

        for i, s in enumerate(slots):
            if assigned[i] is not None:
                continue
            left = sum(1 for j in range(i + 1, 9) if assigned[j] is None)
            pick = None
            for reserve in (80 + pitch_reserve, 45 + pitch_reserve, pitch_reserve, 0):
                hard = CAP - spent - reserve - FLOOR * left
                cands = [
                    n
                    for n in bm
                    if n not in used and covers(n, s) and bm[n]["salary"] <= max(FLOOR, hard)
                ]
                if cands:
                    pick = max(cands, key=lambda n: (raw_b(n) - 0.05 * bm[n]["salary"], raw_b(n)))
                    break
            if pick is None:
                cands = [n for n in bm if n not in used and covers(n, s)]
                pick = min(cands, key=lambda n: (bm[n]["salary"], -raw_b(n)))
            assigned[i] = pick
            used.add(pick)
            spent += bm[pick]["salary"]

        guard = 0
        while spent > CAP - pitch_reserve and guard < 24:
            guard += 1
            idxs = [i for i, n in enumerate(assigned) if n not in cores_set]
            if not idxs:
                break
            i = max(idxs, key=lambda i: bm[assigned[i]]["salary"])
            old = assigned[i]
            cheaper = [
                n
                for n in bm
                if n not in used and covers(n, slots[i]) and bm[n]["salary"] < bm[old]["salary"]
            ]
            if not cheaper:
                break
            new = min(cheaper, key=lambda n: bm[n]["salary"])
            spent += bm[new]["salary"] - bm[old]["salary"]
            used.discard(old)
            used.add(new)
            assigned[i] = new

        staff = list(cores_p)
        ip = sum(pm[n]["abilities"]["IP"] for n in staff)

        def add_arm(n: str) -> bool:
            nonlocal spent, ip
            if n in used or spent + pm[n]["salary"] > CAP:
                return False
            staff.append(n)
            used.add(n)
            spent += pm[n]["salary"]
            ip += pm[n]["abilities"]["IP"]
            return True

        for n, p in sorted(pm.items(), key=lambda kv: -pitcher_value(kv[1]["abilities"])):
            if ip > 9 and len(staff) >= 4:
                break
            if ip <= 9 or (len(staff) < 4 and p["salary"] <= 60):
                add_arm(n)

        while ip <= 9:
            cands = [n for n in pm if n not in used and spent + pm[n]["salary"] <= CAP]
            if not cands:
                idxs = [i for i, n in enumerate(assigned) if n not in cores_set]
                if not idxs:
                    raise RuntimeError(f"IP>9 impossible for {meta}")
                i = max(idxs, key=lambda i: bm[assigned[i]]["salary"])
                old = assigned[i]
                cheaper = [
                    n
                    for n in bm
                    if n not in used and covers(n, slots[i]) and bm[n]["salary"] < bm[old]["salary"]
                ]
                if not cheaper:
                    raise RuntimeError(f"Cannot free cap in {meta}")
                new = min(cheaper, key=lambda n: bm[n]["salary"])
                spent += bm[new]["salary"] - bm[old]["salary"]
                used.discard(old)
                used.add(new)
                assigned[i] = new
                continue
            add_arm(min(cands, key=lambda n: (pm[n]["salary"], -pm[n]["abilities"]["IP"])))

        bench = []
        while 9 + len(staff) + len(bench) < 12 and spent + FLOOR <= CAP:
            cands = [n for n in bm if n not in used and bm[n]["salary"] <= CAP - spent]
            if not cands:
                break
            pick = min(cands, key=lambda n: (bm[n]["salary"], -raw_b(n)))
            bench.append(pick)
            used.add(pick)
            spent += bm[pick]["salary"]

        assert spent <= CAP and ip > 9 and all(assigned), (meta[2], spent, ip)
        id_, name, abbr, blurb = meta
        return {
            "id": id_,
            "name": name,
            "abbr": abbr,
            "blurb": blurb,
            "lineup": [{"playerId": bm[n]["id"], "pos": slots[i]} for i, n in enumerate(assigned)],
            "pitchingStaff": [pm[n]["id"] for n in staff],
            "starterId": pm[staff[0]]["id"],
            "bench": [bm[n]["id"] for n in bench],
            "salary": spent,
        }

    return [
        build(
            ["Judge, Aaron", "Ohtani, Shohei"],
            ["Skubal, Tarik"],
            ("ai_offense", "AI Offense First", "OFF", "Judge + Ohtani; one ace; value fillers."),
        ),
        build(
            ["Judge, Aaron"],
            ["Wheeler, Zack", "Skubal, Tarik"],
            ("ai_twoace", "AI Two-Ace", "ACE", "Two aces + Judge; bargain lineup."),
            forbid_b=("Ohtani, Shohei",),
        ),
        build(
            ["Judge, Aaron", "Ohtani, Shohei"],
            ["Crochet, Garrett"],
            ("ai_dual", "AI Dual Threat", "DUAL", "Judge + Ohtani + Crochet; value arms."),
        ),
    ]


def main() -> None:
    data = json.loads(PLAYERS_JSON.read_text())
    batters, pitchers = price_players(data)

    for b, priced in zip(data["batters"], batters):
        b["salary"] = priced["salary"]
    for p, priced in zip(data["pitchers"], pitchers):
        p["salary"] = priced["salary"]

    # Re-sync by name (zip order matches)
    bmap = {p["name"]: p["salary"] for p in batters}
    pmap = {p["name"]: p["salary"] for p in pitchers}
    for b in data["batters"]:
        b["salary"] = bmap[b["name"]]
    for p in data["pitchers"]:
        p["salary"] = pmap[p["name"]]

    upd_csv(BATTERS_CSV, batters)
    upd_csv(PITCHERS_CSV, pitchers)

    all_p = sorted(batters + pitchers, key=lambda p: (-p["salary"], p["name"]))
    with (OUT_DIR / "salaries.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "type", "team", "salary", "value"])
        for p in all_p:
            w.writerow([p["name"], p["kind"], p["team"], p["salary"], f"{p['value']:.3f}"])

    data["opponents"] = rebuild_opponents(data)
    PLAYERS_JSON.write_text(json.dumps(data, indent=2) + "\n")

    sals = [p["salary"] for p in all_p]
    b9 = sum(p["salary"] for p in sorted(batters, key=lambda p: -p["salary"])[:9])
    p5 = sum(p["salary"] for p in sorted(pitchers, key=lambda p: -p["salary"])[:5])
    bands = [(12, 19), (20, 29), (30, 49), (50, 79), (80, 119), (120, 200)]
    band_md = "\n".join(f"| ${lo}–{hi} | {sum(1 for s in sals if lo <= s <= hi)} |" for lo, hi in bands)
    top_md = "\n".join(f"| {p['salary']} | {p['kind']} | {p['name']} | {p['value']:.1f} |" for p in all_p[:20])

    (OUT_DIR / "salary_market.json").write_text(
        json.dumps(
            {
                "meta": {
                    "method": "absolute real-rate value → dollar anchors",
                    "cap": CAP,
                    "floor": FLOOR,
                    "ceil": CEIL,
                    "bat_anchors": BAT_ANCHORS,
                    "pit_anchors": PIT_ANCHORS,
                    "max": max(sals),
                    "median": sorted(sals)[len(sals) // 2],
                    "best9_batters": b9,
                    "best5_pitchers": p5,
                    "opponents": [{"abbr": o["abbr"], "salary": o["salary"]} for o in data["opponents"]],
                }
            },
            indent=2,
        )
        + "\n"
    )

    (OUT_DIR / "SALARY_FORMULA.md").write_text(
        f"""# Salary Scale — absolute ability anchors

## Better way (this version)

| Old approach | Problem |
|--------------|---------|
| AI-draft live $ | Plateaus; dumps most cards to $1 |
| Percentile of full pool | Everyday MLB regulars look like stars (scrubs fill the bottom) |
| Card abilities (2× stretch) | Compresses gaps; contact guys inflate |

**New approach:** score from **real counting-stat rates** (pre-stretch), map **absolute value → $** with anchors sized for a **$1000** cap.

### Batter anchors (value → $)

| Value | ≈ $ |
|------:|---:|
| 16 | 18 |
| 18 | 28 |
| 21 | 60 |
| 24 | 135 |
| 27 | 190 |
| 29 | 200 |

Pitchers use a parallel curve (quality + IP).

Floor **${FLOOR}**, ceil **${CEIL}**. Light scarcity: C/SS up, DH/OF down a bit.

## Board check

| Check | Value |
|-------|------:|
| Max | **${max(sals)}** ({all_p[0]['name']}) |
| Median | **${sorted(sals)[len(sals)//2]}** |
| Best 9 bats | **${b9}** |
| Best 5 pits | **${p5}** |

### Distribution

| Band | Players |
|------|--------:|
{band_md}

### Top 20

| $ | Type | Name | Value |
|---:|---|---|---:|
{top_md}

### AI opponents
{chr(10).join(f"- **{o['abbr']}** ${o['salary']} — {o['blurb']}" for o in data['opponents'])}

## Files
- `tools/salary_scale.py`
- `data/salaries.csv`
- `game/data/players.json`
"""
    )

    print(f"max=${max(sals)} median=${sorted(sals)[len(sals)//2]} best9=${b9} best5=${p5}")
    print("Top 12:")
    for p in all_p[:12]:
        print(f"  ${p['salary']:3d}  {p['kind'][:3]}  v={p['value']:5.1f}  {p['name']}")
    for name in ["Soto, Juan", "Freeman, Freddie", "Garcia, Maikel", "Judge, Aaron", "Ohtani, Shohei"]:
        p = next(x for x in batters if x["name"] == name)
        print(f"  check {name}: ${p['salary']} (v={p['value']:.1f})")
    print("Opponents:", ", ".join(f"{o['abbr']}=${o['salary']}" for o in data["opponents"]))


if __name__ == "__main__":
    main()
