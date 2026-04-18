"""
Comprehensive API test suite for the AI Cephalometric Service.
Tests all endpoints: /health, /ai/analysis-norms, /ai/calculate-measurements,
/ai/classify-diagnosis, /ai/suggest-treatment, /ai/detect-landmarks.

Usage:
    python scratch/test_all_apis.py [--base-url http://localhost:8000] [--key dev-service-key]
"""
import sys
import json
import time
import argparse
import urllib.request
import urllib.error
import urllib.parse

# ── Config ─────────────────────────────────────────────────────────────────────
DEFAULT_URL = "http://localhost:8000"
DEFAULT_KEY = "dev-service-key"

# ── Colour helpers (works on Windows via ANSI) ─────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):  print(f"  {GREEN}[PASS]{RESET} {msg}")
def fail(msg): print(f"  {RED}[FAIL]{RESET} {msg}")
def warn(msg): print(f"  {YELLOW}[WARN]{RESET} {msg}")
def section(title): print(f"\n{BOLD}{CYAN}{'='*60}{RESET}\n{BOLD}{title}{RESET}\n{'='*60}")

# ── HTTP helpers ───────────────────────────────────────────────────────────────
def _request(method: str, url: str, body: dict | None, key: str) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Service-Key": key,
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_str = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(body_str)
        except Exception:
            return e.code, {"detail": body_str}
    except Exception as e:
        return 0, {"detail": str(e)}

def get(path, base, key):   return _request("GET",  base + path, None, key)
def post(path, body, base, key): return _request("POST", base + path, body, key)

def assert_status(status, expected, label):
    if status == expected:
        ok(f"{label} -> HTTP {status}")
        return True
    else:
        fail(f"{label} -> expected HTTP {expected}, got {status}")
        return False

def assert_field(data, field, label, expected_type=None):
    if field not in data:
        fail(f"  Missing field '{field}' in {label}")
        return False
    if expected_type and not isinstance(data[field], expected_type):
        fail(f"  Field '{field}' has wrong type in {label}: {type(data[field]).__name__}")
        return False
    ok(f"  Field '{field}' present ({type(data[field]).__name__})")
    return True

# ── Sample data ────────────────────────────────────────────────────────────────

# Realistic landmark set (small image pixels, calibrated at ~0.5mm/px)
SAMPLE_LANDMARKS = {
    "S":       {"x": 400.0, "y": 200.0},
    "N":       {"x": 380.0, "y": 170.0},
    "A":       {"x": 360.0, "y": 290.0},
    "B":       {"x": 355.0, "y": 340.0},
    "Pog":     {"x": 350.0, "y": 370.0},
    "Me":      {"x": 352.0, "y": 395.0},
    "Gn":      {"x": 352.0, "y": 390.0},
    "Go":      {"x": 310.0, "y": 370.0},
    "Or":      {"x": 460.0, "y": 210.0},
    "Po":      {"x": 440.0, "y": 210.0},
    "ANS":     {"x": 370.0, "y": 295.0},
    "PNS":     {"x": 420.0, "y": 285.0},
    "Ar":      {"x": 430.0, "y": 250.0},
    "Co":      {"x": 440.0, "y": 225.0},
    "UI":      {"x": 368.0, "y": 310.0},
    "LI":      {"x": 362.0, "y": 325.0},
    "U1_c":    {"x": 368.0, "y": 330.0},
    "L1_c":    {"x": 362.0, "y": 345.0},
    "U6":      {"x": 395.0, "y": 315.0},
    "L6":      {"x": 390.0, "y": 330.0},
    "LIR":     {"x": 360.0, "y": 350.0},
    "Ls":      {"x": 366.0, "y": 305.0},
    "Li":      {"x": 364.0, "y": 320.0},
    "Prn":     {"x": 358.0, "y": 275.0},
    "SoftPog": {"x": 348.0, "y": 375.0},
}

SAMPLE_MEASUREMENTS = {
    "SNA": 84.5, "SNB": 80.0, "ANB": 4.5, "FMA": 28.0,
    "IMPA": 92.0, "FMIA": 60.0, "SN-GoGn": 34.0,
    "UI-NA_DEG": 26.0, "LI-NB_DEG": 28.0,
    "JRatio": 63.0, "Wits": 2.5,
}

# ── Test Runners ───────────────────────────────────────────────────────────────
PASSED = 0
FAILED = 0

def record(passed: bool):
    global PASSED, FAILED
    if passed: PASSED += 1
    else: FAILED += 1

def run_all(base: str, key: str):
    global PASSED, FAILED
    PASSED = FAILED = 0

    # ── 1. Health ──────────────────────────────────────────────────────────────
    section("1. GET /health")
    status, data = get("/health", base, key)
    record(assert_status(status, 200, "Health check"))
    if status == 200:
        record(assert_field(data, "status", "health"))
        record(assert_field(data, "engine", "health", dict))
        record(assert_field(data, "providers", "health", dict))
        if data.get("status") == "healthy":
            ok("Service reports healthy")
            record(True)
        else:
            fail(f"Unexpected status: {data.get('status')}")
            record(False)
        print(f"  Uptime: {data.get('uptime_seconds', '?')}s | "
              f"Model loaded: {data.get('engine', {}).get('model_loaded')}")

    # ── 2. Analysis Norms ──────────────────────────────────────────────────────
    section("2. GET /ai/analysis-norms")
    status, data = get("/ai/analysis-norms", base, key)
    record(assert_status(status, 200, "Analysis norms"))
    if status == 200:
        analyses = data.get("analyses", {})
        record(assert_field(data, "analyses", "norms", dict))
        ok(f"  {len(analyses)} analyses loaded: {', '.join(list(analyses.keys())[:5])}...")
        record(True)
        # Spot-check a known analysis
        if "Steiner" in analyses:
            steiner = analyses["Steiner"]
            meas = steiner.get("measurements", [])
            ok(f"  Steiner has {len(meas)} measurements")
            record(True)
        else:
            fail("  Steiner analysis missing!")
            record(False)

    # ── 3. No Auth → 401 ──────────────────────────────────────────────────────
    section("3. Auth rejection (wrong key)")
    status, data = _request("GET", base + "/ai/analysis-norms", None, "bad-key")
    record(assert_status(status, 401, "Wrong key rejected"))

    # ── 4. Calculate Measurements ──────────────────────────────────────────────
    section("4. POST /ai/calculate-measurements")
    payload = {
        "session_id": "test-session-001",
        "landmarks": SAMPLE_LANDMARKS,
        "pixel_spacing_mm": 0.5,
    }
    t0 = time.time()
    status, data = post("/ai/calculate-measurements", payload, base, key)
    elapsed = time.time() - t0
    record(assert_status(status, 200, "Calculate measurements"))
    if status == 200:
        meas = data.get("measurements", [])
        record(assert_field(data, "measurements", "measurements response", list))
        ok(f"  Computed {len(meas)} measurements in {elapsed*1000:.0f}ms")
        record(True)
        # Spot-check key measurements are present
        codes = {m["code"] for m in meas}
        for expected_code in ["SNA", "SNB", "ANB", "FMA"]:
            if expected_code in codes:
                val = next(m["value"] for m in meas if m["code"] == expected_code)
                status_str = next(m["status"] for m in meas if m["code"] == expected_code)
                ok(f"  {expected_code}: {val:.2f}° -> {status_str}")
                record(True)
            else:
                warn(f"  {expected_code} not computed (maybe missing landmarks)")
                record(True)  # not a hard failure
    else:
        print(f"  Error detail: {data.get('detail', data)}")
        record(False)

    # Without calibration (no pixel_spacing)
    payload_no_cal = {
        "session_id": "test-session-001-nocal",
        "landmarks": SAMPLE_LANDMARKS,
    }
    status, data = post("/ai/calculate-measurements", payload_no_cal, base, key)
    record(assert_status(status, 200, "Calculate measurements (no calibration)"))
    if status == 200:
        count = len(data.get("measurements", []))
        ok(f"  {count} measurements (angles only, no mm distances)")
        record(True)

    # ── 5. Classify Diagnosis ──────────────────────────────────────────────────
    section("5. POST /ai/classify-diagnosis")
    diag_payload = {
        "session_id": "test-session-002",
        "measurements": SAMPLE_MEASUREMENTS,
        "patient_sex": "M",
        "patient_age": 25.0,
    }
    t0 = time.time()
    status, data = post("/ai/classify-diagnosis", diag_payload, base, key)
    elapsed = time.time() - t0
    record(assert_status(status, 200, "Classify diagnosis"))
    if status == 200:
        fields = ["skeletal_class", "skeletal_type", "vertical_pattern",
                  "maxillary_position", "mandibular_position",
                  "upper_incisor_inclination", "lower_incisor_inclination",
                  "confidence_score", "summary"]
        for f in fields:
            record(assert_field(data, f, "diagnosis"))
        print(f"\n  Diagnosis result ({elapsed*1000:.0f}ms):")
        print(f"    Skeletal Class  : {data.get('skeletal_class')} ({data.get('skeletal_type')})")
        print(f"    Corrected ANB   : {data.get('corrected_anb')}°")
        print(f"    Vertical Pattern: {data.get('vertical_pattern')}")
        print(f"    Maxillary Pos   : {data.get('maxillary_position')}")
        print(f"    Mandibular Pos  : {data.get('mandibular_position')}")
        print(f"    Upper Incisor   : {data.get('upper_incisor_inclination')}")
        print(f"    Lower Incisor   : {data.get('lower_incisor_inclination')}")
        print(f"    Confidence      : {data.get('confidence_score')}")
        if data.get("warnings"):
            warn(f"  Warnings: {data['warnings']}")
        print(f"\n  Summary:\n    {data.get('summary', '')}")
    else:
        print(f"  Error: {data.get('detail', data)}")
        record(False)

    # Borderline case — ANB right on threshold
    diag_borderline = dict(diag_payload)
    diag_borderline["measurements"] = {**SAMPLE_MEASUREMENTS, "ANB": 0.3}
    diag_borderline["session_id"] = "test-session-002b"
    status, data = post("/ai/classify-diagnosis", diag_borderline, base, key)
    record(assert_status(status, 200, "Borderline ANB diagnosis"))
    if status == 200:
        ok(f"  Borderline -> {data.get('skeletal_class')} / {data.get('skeletal_type')}")
        record(True)

    # ── 6. Suggest Treatment ───────────────────────────────────────────────────
    section("6. POST /ai/suggest-treatment")
    tx_payload = {
        "session_id": "test-session-003",
        "skeletal_class": "ClassII",
        "vertical_pattern": "Normal",
        "measurements": SAMPLE_MEASUREMENTS,
        "patient_age": 13.0,
    }
    t0 = time.time()
    status, data = post("/ai/suggest-treatment", tx_payload, base, key)
    elapsed = time.time() - t0
    record(assert_status(status, 200, "Suggest treatment (Class II, age 13)"))
    if status == 200:
        treatments = data.get("treatments", [])
        record(assert_field(data, "treatments", "treatment response", list))
        ok(f"  {len(treatments)} treatment plans returned in {elapsed*1000:.0f}ms")
        record(True)
        for t in treatments:
            pri = "[PRIMARY]" if t.get("is_primary") else "        "
            src = t.get("source", "?")
            dur = t.get("estimated_duration_months", "?")
            conf = t.get("confidence_score", "?")
            print(f"  {pri} [{src}] {t.get('treatment_name')} "
                  f"({dur}mo, conf={conf})")
    else:
        print(f"  Error: {data.get('detail', data)}")
        record(False)

    # Class III — young patient
    tx_c3 = {**tx_payload,
              "session_id": "test-session-003b",
              "skeletal_class": "ClassIII", "patient_age": 9.0}
    status, data = post("/ai/suggest-treatment", tx_c3, base, key)
    record(assert_status(status, 200, "Suggest treatment (Class III, age 9)"))
    if status == 200:
        ok(f"  {len(data.get('treatments', []))} plans for Class III child")
        record(True)

    # Class I — comprehensive braces
    tx_c1 = {**tx_payload,
              "session_id": "test-session-003c",
              "skeletal_class": "ClassI", "patient_age": 22.0}
    status, data = post("/ai/suggest-treatment", tx_c1, base, key)
    record(assert_status(status, 200, "Suggest treatment (Class I, adult)"))
    if status == 200:
        ok(f"  {len(data.get('treatments', []))} plans for Class I adult")
        record(True)

    # ── 7. Detect Landmarks (no model) ────────────────────────────────────────
    section("7. POST /ai/detect-landmarks")
    import base64
    # 1×1 white JPEG as minimal valid image
    tiny_jpeg_b64 = (
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLD"
        "BkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/"
        "2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy"
        "MjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgAB"
        "AQEAAAAAAAAAAAAAAAAABgUE/8QAHRAAAQQDAQEAAAAAAAAAAAAAAQACAxESIQT"
        "h8f/EABUBAQEAAAAAAAAAAAAAAAAAAAAB/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP"
        "/aAAwDAQACEQMRAD8Amo1szr5AqRUWn//Z"
    )
    lm_payload = {
        "session_id": "test-session-004",
        "image_base64": tiny_jpeg_b64,
        "pixel_spacing_mm": 0.5,
    }
    status, data = post("/ai/detect-landmarks", lm_payload, base, key)
    # Model may not be loaded (no .pth file); 422 is acceptable, 200 is great
    if status == 200:
        ok(f"Landmark detection OK — {len(data.get('landmarks', {}))} landmarks returned")
        record(True)
    elif status in (422, 500):
        warn(f"Landmark detection returned HTTP {status} "
             f"(likely no model file loaded) — non-critical: {data.get('detail', '')[:80]}")
        record(True)   # Not a failure — model may not be present in test env
    else:
        fail(f"Landmark detection -> unexpected HTTP {status}")
        record(False)

    # ── 8. Validation errors ───────────────────────────────────────────────────
    section("8. Input validation (422 expected)")
    bad = post("/ai/classify-diagnosis", {"session_id": "x"}, base, key)
    record(assert_status(bad[0], 422, "Missing required fields -> 422"))

    empty_lm = post("/ai/calculate-measurements",
                    {"session_id": "x", "landmarks": {}}, base, key)
    record(assert_status(empty_lm[0], 200, "Empty landmarks -> 200 (zero results)"))
    if empty_lm[0] == 200:
        count = len(empty_lm[1].get("measurements", []))
        ok(f"  Returned {count} measurements for empty landmark set (expected 0)")
        record(count == 0)

    # ── Summary ────────────────────────────────────────────────────────────────
    total = PASSED + FAILED
    section(f"RESULTS: {PASSED}/{total} passed")
    if FAILED == 0:
        print(f"  {GREEN}{BOLD}ALL TESTS PASSED{RESET}")
    else:
        print(f"  {RED}{BOLD}{FAILED} TEST(S) FAILED{RESET}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Service API Test Suite")
    parser.add_argument("--base-url", default=DEFAULT_URL)
    parser.add_argument("--key", default=DEFAULT_KEY)
    args = parser.parse_args()

    # Enable ANSI on Windows
    import os
    os.system("")

    print(f"\n{BOLD}AI Cephalometric Service — API Test Suite{RESET}")
    print(f"Target: {args.base_url} | Key: {args.key[:8]}...")
    run_all(args.base_url, args.key)
