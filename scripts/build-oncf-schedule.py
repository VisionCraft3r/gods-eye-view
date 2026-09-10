#!/usr/bin/env python3
"""Compile the ONCF 3-day xlsx into weekday/weekend trip templates."""
from __future__ import annotations

import json
import math
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ROOT = Path(__file__).resolve().parents[1]
XLSX = Path("/Users/MacAI/Downloads/ONCF_programme_3_jours.xlsx")
OUT = ROOT / "src/data/oncfSchedule.json"

# Existing ONCF GTFS snapshot plus extra stations named in the 3-day programme.
STATIONS = {
    "TANGER VILLE": (35.7643, -5.834),
    "ASILAH": (35.4653, -6.0344),
    "KENITRA": (34.261, -6.5802),
    "RABAT AGDAL": (34.0078, -6.8517),
    "RABAT VILLE": (34.0212, -6.8395),
    "SALE": (34.053, -6.749),
    "SALE TABRIQUET": (34.04, -6.77),
    "CASA VOYAGEURS": (33.5979, -7.6191),
    "CASA PORT": (33.6065, -7.628),
    "CASA OASIS": (33.5692, -7.6495),
    "AIN SEBAA": (33.6167, -7.55),
    "MOHAMMEDIA": (33.6867, -7.3833),
    "BOUZNIKA": (33.7833, -7.1667),
    "SKHIRAT": (33.85, -7.0333),
    "TEMARA": (33.9167, -6.9167),
    "SETTAT": (32.9955, -7.6174),
    "BENGUERIR": (32.2333, -7.95),
    "MARRAKECH": (31.6295, -8.0153),
    "MEKNES": (33.8849, -5.5389),
    "FES": (33.9789, -4.9935),
    "TAZA": (34.2167, -4.0167),
    "TAOURIRT": (34.4065, -3.0034),
    "OUJDA": (34.6805, -1.911),
    "NADOR VILLE": (35.1681, -2.9343),
    "EL JADIDA": (33.2316, -8.5147),
    "SAFI": (32.2994, -9.2379),
    "KHOURIBGA": (32.8811, -6.9063),
    "OUED ZEM": (32.8633, -6.5667),
    "SIDI KACEM": (34.2167, -5.7),
    "AEROPORT MED V": (33.3702, -7.5894),
    "AIN SBIT": (33.038, -6.528),
    "AIN-TAOUJDATE": (33.934, -5.213),
    "AL AKBA LHAMRA": (35.552, -5.908),
    "BERRECHID": (33.267, -7.583),
    "BOUSKOURA": (33.448, -7.649),
    "DALIA": (35.732, -5.856),
    "EL KSAR EL KEBIR": (34.998, -5.905),
    "ENNASSIM": (33.545, -7.642),
    "ENNOUASSER": (33.393, -7.581),
    "MEKNES AL AMIR": (33.895, -5.547),
    "RABAT RIAD": (33.971, -6.821),
    "SIDI EL AIDI": (33.118, -7.622),
    "SIDI SLIMANE MEDINA": (34.262, -5.925),
    "SIDI YAHIA": (34.306, -6.306),
    "SOUK EL ARBAA": (34.528, -6.028),
    "TLETA RISSANA": (35.215, -6.032),
    "TNINE SIDI LYAMAN": (35.362, -6.012),
    "YOUSSOUFIA": (32.246, -8.529),
    "EL GOUFAF": (32.94, -7.41),
    "RAS EL AIN": (32.975, -7.655),
    "TAMDROST": (32.96, -7.52),
    "SIDI HAJJAJ": (33.04, -7.33),
    "SIDI RHAZOUANI": (32.86, -7.12),
    "MOUALINE EL OUED": (32.90, -7.22),
    "MRIZIG": (32.84, -6.99),
    "BIDANE": (32.28, -8.62),
    "EL ARIA": (32.20, -8.72),
    "KHATT AZACANE": (32.22, -8.90),
    "SEBAA-AIOUN": (33.90, -5.385),
    "MATMATA": (34.09, -4.56),
    "SIDI HARAZEM": (34.027, -4.883),
    "OUED AMLIL": (34.198, -4.28),
    "CHEBABAT": (34.23, -4.22),
    "TOUABAA": (34.15, -4.68),
    "MSOUN": (34.33, -3.57),
    "GUERCIF": (34.232, -3.353),
    "EL AIOUN": (34.585, -2.506),
    "OUED METLILI": (34.48, -2.52),
    "NAIMA": (34.61, -2.21),
    "BENI-OUKIL": (34.53, -1.99),
    "NADOR SUD": (35.10, -2.94),
    "SELOUANE": (35.071, -2.939),
    "BENI NSAR VILLE": (35.256, -2.928),
    "HASSI BERKANE": (34.85, -2.87),
    "MELG EL OUIDANE": (34.94, -2.41),
    "OUELED RAHOU": (34.88, -2.62),
    "MECHRA BEL KSIRI": (34.574, -5.954),
    "DAR EL GUEDARI": (34.25, -6.32),
    "ESSAOUIRA": (31.513, -9.770),
    "OUARZAZATE": (30.933, -6.893),
    "TETOUAN": (35.571, -5.368),
    "CHEFCHAOUEN": (35.171, -5.269),
    "MARTIL": (35.616, -5.275),
    "FNIDEQ (SUPRA.)": (35.848, -5.357),
    "TAN TAN": (28.438, -11.103),
    "TAN TAN PORT": (28.448, -11.278),
    "GUELMIME": (28.987, -10.057),
    "TIZNIT": (29.697, -9.732),
    "BOUIZAKARNE": (28.534, -10.171),
    "ASSA": (28.609, -9.427),
    "ZAG": (28.019, -9.337),
    "LAAYOUNE": (27.153, -13.203),
    "LAAYOUNE PORT": (27.073, -13.427),
    "BOUJDOUR": (26.128, -14.484),
    "SMARA": (26.739, -11.672),
    "TARFAYA": (27.939, -12.926),
    "TINERHIR": (31.515, -5.533),
    "BOUMALNE": (31.374, -5.995),
    "ELKELAA MGOUNA": (31.237, -6.132),
}


def norm(name: str) -> str:
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.upper().replace("-", " ")
    text = re.sub(r"[^A-Z0-9 ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    aliases = {
        "TANGER VILLE": "TANGER VILLE",
        "AEROPORT MED V": "AEROPORT MED V",
        "CASA VOYAGEURS": "CASA VOYAGEURS",
        "BEN GUERIR": "BENGUERIR",
        "KENITRA MEDINA": "KENITRA",
        "NADOR": "NADOR VILLE",
    }
    return aliases.get(text, text)


def colrow(ref: str):
    col, row = "", ""
    for ch in ref:
        if ch.isalpha():
            col += ch
        else:
            row += ch
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n, int(row)


def cell_val(c):
    t = c.attrib.get("t")
    is_elem = c.find("m:is", NS)
    if t == "inlineStr" and is_elem is not None:
        return "".join((x.text or "") for x in is_elem.findall(".//m:t", NS))
    v = c.find("m:v", NS)
    return v.text if v is not None else None


def minutes(hhmm: str) -> int | None:
    if not hhmm or ":" not in hhmm:
        return None
    h, m = hhmm.split(":")[:2]
    try:
        return int(h) * 60 + int(m)
    except ValueError:
        return None


def parse_rows(path: Path):
    root = ET.fromstring(ZipFile(path).read("xl/worksheets/sheet2.xml"))
    rows = defaultdict(dict)
    for c in root.findall(".//m:c", NS):
        ref = c.attrib.get("r")
        if not ref:
            continue
        col, row = colrow(ref)
        rows[row][col] = cell_val(c)
    return rows


def kind_of(label: str) -> int:
    text = (label or "").lower()
    if "boraq" in text:
        return 2
    if "tnr" in text or "navette" in text:
        return 0
    return 1


def haversine_km(a, b):
    lat1, lon1 = a
    lat2, lon2 = b
    r1, r2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    h = math.sin(dlat / 2) ** 2 + math.cos(r1) * math.cos(r2) * math.sin(dlon / 2) ** 2
    return 2 * 6371 * math.asin(min(1, math.sqrt(h)))


def duration_min(dep: int, arr: int) -> int:
    if arr >= dep:
        return arr - dep
    return arr + 1440 - dep


def plausible(kind: int, dist_km: float, dur: int) -> bool:
    if dur < 1 or dist_km < 0.4:
        return False
    kmh = dist_km / (dur / 60)
    if kind == 2:
        return 40 <= kmh <= 340 and dist_km <= 420
    if kind == 0:
        return 15 <= kmh <= 180 and dist_km <= 280 and dur <= 240
    return 15 <= kmh <= 180 and dist_km <= 850 and dur <= 720


def build_day(rows, day: str):
    grouped = defaultdict(list)
    for r, cols in rows.items():
        if r == 1 or cols.get(1) != day:
            continue
        origin = cols.get(7) or ""
        dest = cols.get(9) or ""
        okey, dkey = norm(origin), norm(dest)
        if okey not in STATIONS or dkey not in STATIONS:
            continue
        dep = minutes(cols.get(10) or "")
        arr = minutes(cols.get(11) or "")
        if dep is None or arr is None:
            continue
        kind = kind_of(cols.get(3) or "")
        dist = haversine_km(STATIONS[okey], STATIONS[dkey])
        dur = duration_min(dep, arr)
        if not plausible(kind, dist, dur):
            continue
        grouped[(cols.get(2) or "", origin, dep, kind)].append((arr if arr >= dep else arr + 1440, dest))

    catalog = []
    index = {}

    def sid(name: str):
        key = norm(name)
        if key not in STATIONS:
            return None
        if key not in index:
            lat, lon = STATIONS[key]
            index[key] = len(catalog)
            catalog.append({"n": name.strip(), "lat": round(lat, 4), "lon": round(lon, 4)})
        return index[key]

    trips = []
    for (num, origin, dep, kind), dests in grouped.items():
        origin_id = sid(origin)
        if origin_id is None:
            continue
        stops = [(dep, origin_id)]
        seen = {origin_id}
        for arr, dest in sorted(dests, key=lambda item: item[0]):
            dest_id = sid(dest)
            if dest_id is None or dest_id in seen:
                continue
            stops.append((arr, dest_id))
            seen.add(dest_id)
        if len(stops) < 2:
            continue
        dist = 0.0
        for i in range(1, len(stops)):
            a = catalog[stops[i - 1][1]]
            b = catalog[stops[i][1]]
            dist += haversine_km((a["lat"], a["lon"]), (b["lat"], b["lon"]))
        duration = max(1, stops[-1][0] - stops[0][0])
        trips.append({
            "id": f"{num}:{origin_id}:{dep}",
            "n": num,
            "k": kind,
            "s": [[t, i] for t, i in stops],
            "kmh": round(dist / (duration / 60), 1),
        })
    trips.sort(key=lambda trip: (trip["s"][0][0], trip["n"]))
    return catalog, trips


def main():
    if not XLSX.exists():
        raise SystemExit(f"missing {XLSX}")
    rows = parse_rows(XLSX)
    weekday_cat, weekday = build_day(rows, "2026-09-10")
    weekend_cat, weekend = build_day(rows, "2026-09-12")
    # Shared station catalog (weekday first, then weekend-only).
    catalog = list(weekday_cat)
    remap = {i: i for i in range(len(weekday_cat))}
    names = {row["n"]: i for i, row in enumerate(catalog)}
    weekend_remap = {}
    for i, row in enumerate(weekend_cat):
        if row["n"] in names:
            weekend_remap[i] = names[row["n"]]
        else:
            weekend_remap[i] = len(catalog)
            names[row["n"]] = len(catalog)
            catalog.append(row)
    for trip in weekend:
        trip["s"] = [[t, weekend_remap[i]] for t, i in trip["s"]]
        origin = trip["s"][0][1]
        trip["id"] = f"{trip['n']}:{origin}:{trip['s'][0][0]}"
    payload = {
        "source": "ONCF Voyages public schedule API snapshot 2026-09-10/12",
        "timezone": "Africa/Casablanca",
        "weekdayDate": "2026-09-10",
        "weekendDate": "2026-09-12",
        "stations": catalog,
        "weekday": weekday,
        "weekend": weekend,
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"stations {len(catalog)} weekday {len(weekday)} weekend {len(weekend)} bytes {OUT.stat().st_size}")


if __name__ == "__main__":
    main()
