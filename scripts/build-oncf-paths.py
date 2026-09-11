#!/usr/bin/env python3
"""Route ONCF timetable stop pairs along OSM railway geometry.

Reads src/data/oncfSchedule.json + a Morocco railway=rail dump
(.gev-cache/oncf/osm_elements.json, or fetch), A*s each unique OD leg, and
writes src/data/oncfPaths.json keyed by "kind:fromIdx:toIdx".

Al Boraq (k=2) prefers highspeed=yes / LGV ways; TNR / Al Atlas prefer
conventional mainline. Legs that cannot be routed (coaches / off-network)
are omitted — the runtime falls back to a geodesic chord.
"""
from __future__ import annotations

import heapq
import json
import math
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEDULE = ROOT / "src/data/oncfSchedule.json"
OUT = ROOT / "src/data/oncfPaths.json"
CACHE = ROOT / ".gev-cache/oncf/osm_elements.json"
OSM_FALLBACK_URL = (
    "https://raw.githubusercontent.com/newsbubbles/rail_maroc_oncf/main/osm_elements.json"
)
OVERPASS_URLS = (
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
)
OVERPASS_QUERY = """
[out:json][timeout:180];
area["ISO3166-1"="MA"][admin_level=2]->.a;
way["railway"~"^(rail|construction)$"](area.a);
out geom;
""".strip()

SNAP_M = 6500.0
SIMPLIFY_M = 40.0
MAX_DETOUR = 3.25
# Timetable geocodes that sit far from the OSM rail alignment.
STATION_XY_OVERRIDES = {
    # Align to OSM / GTFS rail platforms when the Voyages geocode is off-track.
    "TANGER VILLE": (35.7772, -5.7849),
    "TANGER": (35.7772, -5.7849),
    "CASA PORT": (33.5990, -7.6128),
    "CASA VOYAGEURS": (33.5899, -7.6115),
    "CASA OASIS": (33.5568, -7.6400),
    "FES": (34.0469, -5.0071),
    "SALE": (34.0395, -6.8155),
    "SALE TABRIQUET": (34.0335, -6.8050),
    "RABAT RIAD": (33.9710, -6.8510),
}


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = a
    lat2, lon2 = b
    r1, r2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    h = math.sin(dlat / 2) ** 2 + math.cos(r1) * math.cos(r2) * math.sin(dlon / 2) ** 2
    return 2 * 6371000 * math.asin(min(1.0, math.sqrt(h)))


def load_osm() -> list[dict]:
    if CACHE.exists() and CACHE.stat().st_size > 1000:
        data = json.loads(CACHE.read_text(encoding="utf-8"))
        if isinstance(data, list) and data:
            print(f"osm cache {CACHE} ({len(data)} ways)")
            return data
        if isinstance(data, dict) and data.get("elements"):
            print(f"osm cache {CACHE} ({len(data['elements'])} elements)")
            return data["elements"]

    print("fetching OSM railway ways…")
    last_err: Exception | None = None
    for url in OVERPASS_URLS:
        try:
            req = urllib.request.Request(
                url,
                data=("data=" + urllib.parse.quote(OVERPASS_QUERY)).encode("utf-8"),
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "GodsEye-ONCF-paths/1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=200) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            els = payload.get("elements") or []
            if els:
                CACHE.parent.mkdir(parents=True, exist_ok=True)
                CACHE.write_text(json.dumps(els), encoding="utf-8")
                print(f"overpass {url} → {len(els)} elements")
                return els
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            print(f"overpass failed ({url}): {exc}")

    try:
        with urllib.request.urlopen(OSM_FALLBACK_URL, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        els = data if isinstance(data, list) else data.get("elements") or []
        if els:
            CACHE.parent.mkdir(parents=True, exist_ok=True)
            CACHE.write_text(json.dumps(els), encoding="utf-8")
            print(f"fallback dump → {len(els)} elements")
            return els
    except Exception as exc:  # noqa: BLE001
        last_err = exc

    raise SystemExit(f"could not load OSM railways: {last_err}")


def way_is_highspeed(tags: dict) -> bool:
    if tags.get("highspeed") in ("yes", "true", "1"):
        return True
    name = f"{tags.get('name', '')} {tags.get('ref', '')}".lower()
    return "lgv" in name or "al boraq" in name or "al-boraq" in name or "high speed" in name


def build_graph(elements: list[dict]):
    node_xy: dict[int, tuple[float, float]] = {}
    edges: dict[int, list[tuple[int, float, bool]]] = defaultdict(list)

    for el in elements:
        if el.get("type") != "way":
            continue
        tags = el.get("tags") or {}
        railway = tags.get("railway")
        if railway not in ("rail", "construction"):
            continue
        if tags.get("service") in ("yard", "siding", "spur") and tags.get("usage") in (
            "military",
            "industrial",
            "tourism",
        ):
            continue
        geom = el.get("geometry") or []
        if len(geom) < 2:
            continue
        hs = way_is_highspeed(tags)
        nodes = el.get("nodes") or []
        pts: list[tuple[int, tuple[float, float]]] = []
        for i, g in enumerate(geom):
            lat, lon = float(g["lat"]), float(g["lon"])
            if i < len(nodes):
                nid = int(nodes[i])
            else:
                nid = hash((round(lat, 6), round(lon, 6))) & 0x7FFFFFFFFFFFFFFF
            node_xy[nid] = (lat, lon)
            pts.append((nid, (lat, lon)))
        for i in range(len(pts) - 1):
            a_id, a_xy = pts[i]
            b_id, b_xy = pts[i + 1]
            dist = haversine_m(a_xy, b_xy)
            if dist <= 0.05:
                continue
            edges[a_id].append((b_id, dist, hs))
            edges[b_id].append((a_id, dist, hs))

    return node_xy, edges


def snap_station(lat: float, lon: float, node_xy: dict[int, tuple[float, float]]) -> int | None:
    best_id = None
    best_d = SNAP_M
    target = (lat, lon)
    for nid, xy in node_xy.items():
        d = haversine_m(target, xy)
        if d < best_d:
            best_d = d
            best_id = nid
    return best_id


def edge_cost(meters: float, highspeed: bool, prefer_hs: bool) -> float:
    if prefer_hs:
        return meters * (0.55 if highspeed else 1.35)
    return meters * (1.45 if highspeed else 1.0)


def astar(
    start: int,
    goal: int,
    node_xy: dict[int, tuple[float, float]],
    edges: dict[int, list[tuple[int, float, bool]]],
    prefer_hs: bool,
) -> list[int] | None:
    if start == goal:
        return [start]
    goal_xy = node_xy[goal]

    def heuristic(nid: int) -> float:
        return haversine_m(node_xy[nid], goal_xy)

    open_heap: list[tuple[float, int]] = [(heuristic(start), start)]
    g_score = {start: 0.0}
    came_from: dict[int, int] = {}
    closed: set[int] = set()

    while open_heap:
        _, current = heapq.heappop(open_heap)
        if current in closed:
            continue
        if current == goal:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()
            return path
        closed.add(current)
        for nb, meters, hs in edges.get(current, ()):
            if nb in closed:
                continue
            tentative = g_score[current] + edge_cost(meters, hs, prefer_hs)
            if tentative + 1e-6 < g_score.get(nb, float("inf")):
                came_from[nb] = current
                g_score[nb] = tentative
                heapq.heappush(open_heap, (tentative + heuristic(nb), nb))
    return None


def douglas_peucker(points: list[tuple[float, float]], tol_m: float) -> list[tuple[float, float]]:
    if len(points) <= 2:
        return points

    def perp_dist(p, a, b) -> float:
        lat0 = math.radians((a[0] + b[0]) / 2)
        ax, ay = a[1] * math.cos(lat0) * 111320, a[0] * 110540
        bx, by = b[1] * math.cos(lat0) * 111320, b[0] * 110540
        px, py = p[1] * math.cos(lat0) * 111320, p[0] * 110540
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

    stack = [(0, len(points) - 1)]
    keep = {0, len(points) - 1}
    while stack:
        i, j = stack.pop()
        max_d = 0.0
        max_i = None
        a, b = points[i], points[j]
        for k in range(i + 1, j):
            d = perp_dist(points[k], a, b)
            if d > max_d:
                max_d = d
                max_i = k
        if max_i is not None and max_d > tol_m:
            keep.add(max_i)
            stack.append((i, max_i))
            stack.append((max_i, j))
    return [points[i] for i in sorted(keep)]


def path_length_m(points: list[tuple[float, float]]) -> float:
    total = 0.0
    for i in range(1, len(points)):
        total += haversine_m(points[i - 1], points[i])
    return total


def compact(points: list[tuple[float, float]]) -> list[list[float]]:
    return [[round(lat, 4), round(lon, 4)] for lat, lon in points]


def unique_legs(schedule: dict) -> list[tuple[int, int, int]]:
    seen: set[tuple[int, int, int]] = set()
    out: list[tuple[int, int, int]] = []
    for day in ("weekday", "weekend"):
        for trip in schedule.get(day) or []:
            kind = int(trip.get("k", 1))
            stops = trip.get("s") or []
            for i in range(len(stops) - 1):
                a = int(stops[i][1])
                b = int(stops[i + 1][1])
                if a == b:
                    continue
                key = (kind, a, b)
                if key in seen:
                    continue
                seen.add(key)
                out.append(key)
    return out


def main() -> None:
    if not SCHEDULE.exists():
        raise SystemExit(f"missing {SCHEDULE}")
    schedule = json.loads(SCHEDULE.read_text(encoding="utf-8"))
    stations = schedule["stations"]
    elements = load_osm()
    node_xy, edges = build_graph(elements)
    print(f"graph nodes={len(node_xy)} adjacency={len(edges)}")

    snaps: list[int | None] = []
    station_xy: list[tuple[float, float]] = []
    for st in stations:
        name = str(st.get("n") or "").upper()
        if name in STATION_XY_OVERRIDES:
            lat, lon = STATION_XY_OVERRIDES[name]
        else:
            lat, lon = float(st["lat"]), float(st["lon"])
        station_xy.append((lat, lon))
        snaps.append(snap_station(lat, lon, node_xy))
    snapped = sum(1 for s in snaps if s is not None)
    print(f"stations snapped {snapped}/{len(stations)}")

    legs = unique_legs(schedule)
    print(f"routing {len(legs)} unique OD legs…")
    paths: dict[str, list[list[float]]] = {}
    failed = 0
    detoured = 0
    reused = 0

    for kind, a, b in legs:
        key = f"{kind}:{a}:{b}"
        rev = f"{kind}:{b}:{a}"
        if rev in paths:
            paths[key] = list(reversed(paths[rev]))
            reused += 1
            continue
        sa, sb = snaps[a], snaps[b]
        if sa is None or sb is None:
            failed += 1
            continue
        prefer_hs = kind == 2
        node_path = astar(sa, sb, node_xy, edges, prefer_hs)
        if not node_path:
            failed += 1
            continue
        pts = [node_xy[n] for n in node_path]
        sta = station_xy[a]
        stb = station_xy[b]
        if haversine_m(pts[0], sta) > 5:
            pts = [sta] + pts
        if haversine_m(pts[-1], stb) > 5:
            pts = pts + [stb]
        route_m = path_length_m(pts)
        direct_m = max(1.0, haversine_m(sta, stb))
        if route_m > direct_m * MAX_DETOUR and direct_m > 2500:
            detoured += 1
            continue
        # Keep short urban loops (Casa-Port via Aïn Sebaâ) detailed.
        tol = 12.0 if direct_m < 15000 else (25.0 if direct_m < 80000 else SIMPLIFY_M)
        simplified = douglas_peucker(pts, tol)
        if len(simplified) < 2:
            failed += 1
            continue
        paths[key] = compact(simplified)

    payload = {
        "source": "OpenStreetMap railway=rail (ODbL) routed for ONCF Voyages stop pairs",
        "timezone": schedule.get("timezone", "Africa/Casablanca"),
        "snapMeters": SNAP_M,
        "simplifyMeters": SIMPLIFY_M,
        "paths": paths,
        "stats": {
            "stations": len(stations),
            "snapped": snapped,
            "legsAttempted": len(legs),
            "legsRouted": len(paths),
            "legsFailed": failed,
            "legsDetoured": detoured,
            "legsReversed": reused,
        },
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(
        f"wrote {OUT} bytes={OUT.stat().st_size} "
        f"routed={len(paths)} failed={failed} detoured={detoured} reversed={reused}"
    )


if __name__ == "__main__":
    main()
