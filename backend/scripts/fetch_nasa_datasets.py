import argparse
import csv
import io
import json
import re
import time
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import httpx

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "backend" / "data"

OSDR_BASE = "https://osdr.nasa.gov"
DONKI_BASE = "https://ccmc.gsfc.nasa.gov/DONKI/WS/get"
ISS_POSITIONS_URL = "https://api.wheretheiss.at/v1/satellites/25544/positions"
TECHTRANSFER_URL = "https://technology.nasa.gov/api/api/patent"

OSDR_DOMAIN_STUDIES: Dict[str, List[str]] = {
    "human_clinical": ["575", "569", "656"],
    "ocular_sans": ["583", "680", "681", "816", "817", "818"],
    "bone_muscle": ["351", "471", "477", "489", "608", "616", "653", "661", "702", "718"],
    "radiation_neuro_immune": ["479", "490", "492", "618", "640", "738", "751", "752", "776", "777", "778", "836"],
}

TECH_KEYWORDS = ["medical", "cardiovascular", "vision", "radiation", "bone"]
HTML_TAG_RE = re.compile(r"<[^>]+>")


def is_in_saa(latitude: float, longitude: float) -> bool:
    # Approximate South Atlantic Anomaly geomagnetic bounding region
    return -45.0 <= latitude <= -5.0 and -85.0 <= longitude <= 5.0


def iter_date_chunks(start: date, end: date, chunk_days: int = 55) -> Iterable[Tuple[date, date]]:
    # CCMC DONKI rejects queries spanning more than 60 days
    cur = start
    while cur <= end:
        chunk_end = min(cur + timedelta(days=chunk_days - 1), end)
        yield cur, chunk_end
        cur = chunk_end + timedelta(days=1)


def parse_flare_score(class_type: str) -> Tuple[str, float]:
    if not class_type:
        return "", 0.0
    letter = class_type[0].upper()
    scale = {"A": 0.01, "B": 0.1, "C": 1.0, "M": 10.0, "X": 100.0}.get(letter, 0.0)
    try:
        mag = float(class_type[1:])
    except ValueError:
        mag = 1.0
    return letter, round(scale * mag, 3)


def inspect_csv_shape(path: Path) -> Dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8", errors="replace", newline="") as fh:
            reader = csv.reader(fh)
            header = next(reader, [])
            rows = sum(1 for _ in reader)
        return {"rows": rows, "cols": len(header), "columns_preview": header[:10]}
    except Exception:
        return {"rows": 0, "cols": 0, "columns_preview": []}


def fetch_osdr_by_domain(
    client: httpx.Client,
    out_dir: Path,
    force: bool = False,
    max_file_bytes: int = 5_000_000,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    osdr_dir = out_dir / "osdr"
    osdr_dir.mkdir(parents=True, exist_ok=True)
    manifest_entries: List[Dict[str, Any]] = []
    domain_counts: Dict[str, int] = {}

    for domain, study_ids in OSDR_DOMAIN_STUDIES.items():
        domain_counts[domain] = 0
        for i in range(0, len(study_ids), 10):
            batch = ",".join(study_ids[i : i + 10])
            res = client.get(f"{OSDR_BASE}/osdr/data/osd/files/{batch}", params={"all_files": "true"})
            res.raise_for_status()
            studies = res.json().get("studies", {})

            for study_key, study_data in studies.items():
                study_dir = osdr_dir / domain / study_key
                study_dir.mkdir(parents=True, exist_ok=True)

                for f in study_data.get("study_files", []):
                    fname = f.get("file_name", "")
                    fsize = f.get("file_size") or 0
                    remote_url = f.get("remote_url")
                    if not remote_url or f.get("restricted") or fsize > max_file_bytes:
                        continue

                    is_csv = fname.lower().endswith(".csv")
                    is_isa = fname.lower().endswith("-isa.zip") or fname.lower().endswith("_isa.zip")
                    if not (is_csv or is_isa):
                        continue

                    if is_isa:
                        sample_out = study_dir / f"{study_key}_samples.tsv"
                        if not sample_out.exists() or force:
                            zip_res = client.get(f"{OSDR_BASE}{remote_url}")
                            zip_res.raise_for_status()
                            with zipfile.ZipFile(io.BytesIO(zip_res.content)) as zf:
                                for member in zf.namelist():
                                    if Path(member).name.startswith("s_") and member.endswith(".txt"):
                                        sample_out.write_bytes(zf.read(member))
                                        break
                        continue

                    dest = study_dir / fname
                    if not dest.exists() or force:
                        file_res = client.get(f"{OSDR_BASE}{remote_url}")
                        file_res.raise_for_status()
                        dest.write_bytes(file_res.content)

                    domain_counts[domain] += 1
                    shape = inspect_csv_shape(dest)
                    manifest_entries.append(
                        {
                            "domain": domain,
                            "study": study_key,
                            "file": str(dest.relative_to(ROOT_DIR)),
                            **shape,
                        }
                    )

    return domain_counts, manifest_entries


def fetch_donki_multiyear(
    client: httpx.Client,
    out_dir: Path,
    start_date: date,
    end_date: date,
) -> Dict[str, Any]:
    donki_dir = out_dir / "donki"
    donki_dir.mkdir(parents=True, exist_ok=True)

    flr_by_id: Dict[str, Dict[str, Any]] = {}
    sep_by_id: Dict[str, Dict[str, Any]] = {}
    gst_by_id: Dict[str, Dict[str, Any]] = {}

    for chunk_start, chunk_end in iter_date_chunks(start_date, end_date):
        params = {"startDate": chunk_start.isoformat(), "endDate": chunk_end.isoformat()}
        for ep, store, id_key in [
            ("FLR", flr_by_id, "flrID"),
            ("SEP", sep_by_id, "sepID"),
            ("GST", gst_by_id, "gstID"),
        ]:
            res = client.get(f"{DONKI_BASE}/{ep}", params=params)
            if res.status_code != 200 or not res.text.strip():
                continue
            for item in res.json():
                eid = item.get(id_key)
                if eid:
                    store[eid] = item

    daily = defaultdict(
        lambda: {
            "flare_count": 0,
            "m_class_count": 0,
            "x_class_count": 0,
            "max_flare_score": 0.0,
            "sep_count": 0,
            "max_kp_index": 0.0,
        }
    )

    flr_rows: List[Dict[str, Any]] = []
    for item in sorted(flr_by_id.values(), key=lambda x: x.get("beginTime", "")):
        ctype = item.get("classType", "")
        letter, score = parse_flare_score(ctype)
        begin = item.get("beginTime", "")
        day = begin[:10]
        if day:
            daily[day]["flare_count"] += 1
            if letter == "M":
                daily[day]["m_class_count"] += 1
            elif letter == "X":
                daily[day]["x_class_count"] += 1
            daily[day]["max_flare_score"] = max(daily[day]["max_flare_score"], score)

        linked = ";".join(e.get("activityID", "") for e in (item.get("linkedEvents") or []))
        flr_rows.append(
            {
                "flr_id": item.get("flrID"),
                "begin_time": begin,
                "peak_time": item.get("peakTime"),
                "end_time": item.get("endTime"),
                "class_type": ctype,
                "class_letter": letter,
                "flare_intensity_score": score,
                "source_location": item.get("sourceLocation"),
                "active_region_num": item.get("activeRegionNum"),
                "linked_events": linked,
            }
        )

    sep_rows: List[Dict[str, Any]] = []
    for item in sorted(sep_by_id.values(), key=lambda x: x.get("eventTime", "")):
        ev_time = item.get("eventTime", "")
        day = ev_time[:10]
        if day:
            daily[day]["sep_count"] += 1
        instruments = ";".join(i.get("displayName", "") for i in (item.get("instruments") or []))
        linked = ";".join(e.get("activityID", "") for e in (item.get("linkedEvents") or []))
        sep_rows.append(
            {
                "sep_id": item.get("sepID"),
                "event_time": ev_time,
                "instruments": instruments,
                "linked_events": linked,
            }
        )

    gst_rows: List[Dict[str, Any]] = []
    for item in sorted(gst_by_id.values(), key=lambda x: x.get("startTime", "")):
        linked = ";".join(e.get("activityID", "") for e in (item.get("linkedEvents") or []))
        for kp in item.get("allKpIndex") or []:
            obs = kp.get("observedTime", "")
            kp_val = float(kp.get("kpIndex") or 0.0)
            day = obs[:10]
            if day:
                daily[day]["max_kp_index"] = max(daily[day]["max_kp_index"], kp_val)
            gst_rows.append(
                {
                    "gst_id": item.get("gstID"),
                    "start_time": item.get("startTime"),
                    "observed_time": obs,
                    "kp_index": kp_val,
                    "source": kp.get("source"),
                    "linked_events": linked,
                }
            )

    write_csv(donki_dir / "donki_flr_history.csv", flr_rows)
    write_csv(donki_dir / "donki_sep_history.csv", sep_rows)
    write_csv(donki_dir / "donki_gst_history.csv", gst_rows)

    daily_rows: List[Dict[str, Any]] = []
    cur = start_date
    while cur <= end_date:
        d_str = cur.isoformat()
        rec = daily[d_str]
        kp = rec["max_kp_index"]
        storm_level = "G4-G5_SEVERE" if kp >= 8 else ("G2-G3_MODERATE" if kp >= 6 else ("G1_MINOR" if kp >= 5 else "QUIET"))
        daily_rows.append({"date": d_str, **rec, "storm_level": storm_level})
        cur += timedelta(days=1)
    write_csv(donki_dir / "donki_daily_summary.csv", daily_rows)

    return {
        "range": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "flr_events": len(flr_rows),
        "sep_events": len(sep_rows),
        "gst_kp_records": len(gst_rows),
        "daily_rows": len(daily_rows),
    }


def write_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def fetch_iss_orbit_sample(client: httpx.Client, out_dir: Path, hours: int = 48, step_minutes: int = 10) -> int:
    iss_dir = out_dir / "orbital"
    iss_dir.mkdir(parents=True, exist_ok=True)

    now_ts = int(time.time())
    total_steps = (hours * 60) // step_minutes
    timestamps = [now_ts - i * step_minutes * 60 for i in range(total_steps)]
    timestamps.reverse()

    rows: List[Dict[str, Any]] = []
    # WhereTheISS limits batch lookups to 10 timestamps per request
    for i in range(0, len(timestamps), 10):
        batch = ",".join(str(t) for t in timestamps[i : i + 10])
        res = client.get(ISS_POSITIONS_URL, params={"timestamps": batch, "units": "kilometers"})
        res.raise_for_status()
        for item in res.json():
            lat = float(item["latitude"])
            lon = float(item["longitude"])
            rows.append(
                {
                    "timestamp": item["timestamp"],
                    "utc_time": datetime.fromtimestamp(item["timestamp"], tz=timezone.utc).isoformat(),
                    "latitude": round(lat, 5),
                    "longitude": round(lon, 5),
                    "altitude_km": round(float(item["altitude"]), 3),
                    "velocity_kmh": round(float(item["velocity"]), 2),
                    "visibility": item["visibility"],
                    "in_saa": is_in_saa(lat, lon),
                    "high_lat_exposure": abs(lat) > 50.0,
                }
            )

    write_csv(iss_dir / f"iss_orbit_{hours}h.csv", rows)
    return len(rows)


def fetch_techtransfer_patents(client: httpx.Client, out_dir: Path) -> Dict[str, int]:
    tech_dir = out_dir / "techtransfer"
    tech_dir.mkdir(parents=True, exist_ok=True)
    counts: Dict[str, int] = {}

    for keyword in TECH_KEYWORDS:
        res = client.get(f"{TECHTRANSFER_URL}/{keyword}")
        res.raise_for_status()
        results = res.json().get("results", [])
        cleaned = [
            {
                "id": item[0] if len(item) > 0 else "",
                "case_number": item[1] if len(item) > 1 else "",
                "title": HTML_TAG_RE.sub("", item[2]) if len(item) > 2 else "",
                "abstract": HTML_TAG_RE.sub("", item[3]) if len(item) > 3 else "",
                "category": item[5] if len(item) > 5 else "",
                "center": item[9] if len(item) > 9 else "",
            }
            for item in results[:25]
        ]
        (tech_dir / f"patents_{keyword}.json").write_text(json.dumps(cleaned, indent=2), encoding="utf-8")
        counts[keyword] = len(cleaned)

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch comprehensive NASA OSDR, DONKI, ISS, and TechTransfer datasets.")
    today = datetime.now(tz=timezone.utc).date()
    parser.add_argument("--donki-start", default="2020-01-01", help="DONKI start date (YYYY-MM-DD)")
    parser.add_argument("--donki-end", default=today.isoformat(), help="DONKI end date (YYYY-MM-DD)")
    parser.add_argument("--orbit-hours", type=int, default=48, help="Hours of ISS orbit history to sample")
    parser.add_argument("--force", action="store_true", help="Re-download existing OSDR files")
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    start_d = date.fromisoformat(args.donki_start)
    end_d = date.fromisoformat(args.donki_end)

    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        osdr_counts, osdr_manifest = fetch_osdr_by_domain(client, DATA_DIR, force=args.force)
        donki_summary = fetch_donki_multiyear(client, DATA_DIR, start_d, end_d)
        iss_count = fetch_iss_orbit_sample(client, DATA_DIR, hours=args.orbit_hours)
        tech_summary = fetch_techtransfer_patents(client, DATA_DIR)

    manifest = {
        "generated_at_utc": datetime.now(tz=timezone.utc).isoformat(),
        "osdr_csv_counts_by_domain": osdr_counts,
        "donki": donki_summary,
        "iss_orbit_points": iss_count,
        "techtransfer_patents": tech_summary,
        "osdr_datasets": osdr_manifest,
    }
    (DATA_DIR / "dataset_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in manifest.items() if k != "osdr_datasets"}, indent=2))
    print(f"Total OSDR CSV files cataloged: {len(osdr_manifest)}")


if __name__ == "__main__":
    main()
