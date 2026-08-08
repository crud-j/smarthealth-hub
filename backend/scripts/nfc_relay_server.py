#!/usr/bin/env python3
"""
NFC Wi-Fi Relay Server — SmartHealth Hub
=========================================

Standalone Python HTTP server that bridges an Android NFC reader app and
the FastAPI backend over a local Wi-Fi network.

Usage (from repo root)::

    python backend/scripts/nfc_relay_server.py

Exposes three endpoints:

    POST /nfc-uid       — accepts {"uid": "hex_string"} from Android
                          forwards to FastAPI and returns the patient JSON
    GET  /status        — health check; returns {"ok": true, "relay": "up"}
    GET  /              — mobile browser view; auto-refreshes every 2 s
                          showing the last scanned patient

Dependencies: Python stdlib + ``requests`` only.
Python 3.8+ required.

Security notes:
    - This server is for LOCAL NETWORK TESTING ONLY. Never expose port 9000
      to the internet.
    - No PHI beyond patient name + card_status is printed to the console.
      Diagnosis/treatment_notes are never in the relay path.
    - The FastAPI backend still enforces audit logging on every scan.
"""

from __future__ import annotations

import json
import sys
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

# ---------------------------------------------------------------------------
# Configuration — change these if your network differs
# ---------------------------------------------------------------------------

RELAY_HOST = "0.0.0.0"
RELAY_PORT = 9000

# FastAPI backend — runs on the laptop, accessible from localhost
FASTAPI_SCAN_UID_URL = "http://127.0.0.1:8000/api/v1/health-cards/scan-uid"
FASTAPI_VIEW_URL = "http://127.0.0.1:8000/api/v1/health-cards/view"

# ---------------------------------------------------------------------------
# ANSI colour helpers (work on Windows 10+ with VT mode)
# ---------------------------------------------------------------------------

_RESET = "\033[0m"
_GREEN = "\033[92m"
_YELLOW = "\033[93m"
_RED = "\033[91m"
_CYAN = "\033[96m"
_BOLD = "\033[1m"
_DIM = "\033[2m"


def _ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def log_info(msg: str) -> None:
    print(f"{_DIM}{_ts()}{_RESET} {_CYAN}[RELAY]{_RESET} {msg}")


def log_scan(uid_prefix: str, name: str | None, status: str) -> None:
    if name:
        print(
            f"{_DIM}{_ts()}{_RESET} {_GREEN}{_BOLD}[SCAN]{_RESET}  "
            f"UID {uid_prefix}... -> {_BOLD}{name}{_RESET} ({status})"
        )
    else:
        print(
            f"{_DIM}{_ts()}{_RESET} {_YELLOW}[SCAN]{_RESET}  "
            f"UID {uid_prefix}... -> NOT REGISTERED"
        )


def log_error(msg: str) -> None:
    print(f"{_DIM}{_ts()}{_RESET} {_RED}[ERROR]{_RESET} {msg}")


# ---------------------------------------------------------------------------
# In-memory last-scan cache (mirrors the FastAPI in-memory cache)
# Reset when the relay server restarts.
# ---------------------------------------------------------------------------

_last_result: dict[str, Any] = {
    "scanned_at": None,
    "found": False,
    "uid": None,
    "patient": None,
}
_cache_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Mobile browser HTML page — returned by GET /
# ---------------------------------------------------------------------------

_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NFC Relay Monitor</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #f0f9ff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 16px 48px;
    }}
    h1 {{ font-size: 20px; font-weight: 800; color: #0369a1; }}
    .subtitle {{ font-size: 13px; color: #64748b; margin-top: 2px; }}
    .card {{
      width: 100%; max-width: 440px;
      background: #fff;
      border-radius: 20px;
      border: 2px dashed #93c5fd;
      padding: 40px 24px;
      text-align: center;
      margin-top: 24px;
    }}
    .card.found {{
      border: 2px solid #86efac;
      background: #f0fdf4;
      text-align: left;
    }}
    .waiting-icon {{
      font-size: 48px;
      margin-bottom: 16px;
      animation: pulse 2s ease-in-out infinite;
    }}
    @keyframes pulse {{
      0%, 100% {{ opacity: 1; transform: scale(1); }}
      50%       {{ opacity: 0.5; transform: scale(1.1); }}
    }}
    .patient-name {{
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
    }}
    .patient-code {{
      font-size: 14px;
      font-weight: 600;
      color: #0d9488;
      margin-bottom: 16px;
    }}
    .detail-table {{ width: 100%; border-collapse: collapse; }}
    .detail-table td {{
      padding: 10px 0;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: top;
    }}
    .detail-table td:first-child {{
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      width: 44%;
    }}
    .detail-table td:last-child {{
      font-size: 15px;
      font-weight: 500;
      color: #1e293b;
    }}
    .badge {{
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 700;
      color: #fff;
      margin-right: 4px;
    }}
    .badge-senior   {{ background: #7c3aed; }}
    .badge-pwd      {{ background: #0369a1; }}
    .badge-pregnant {{ background: #be185d; }}
    .ts {{ margin-top: 12px; font-size: 12px; color: #94a3b8; text-align: center; }}
    .header {{ text-align: center; max-width: 440px; width: 100%; }}
    .poll-note {{ margin-top: 8px; font-size: 11px; color: #94a3b8; }}
    .status-badge {{
      display: inline-block;
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      background: {status_color};
      margin-bottom: 14px;
    }}
  </style>
</head>
<body>
  <div class="header">
    <h1>SmartHealth Hub</h1>
    <p class="subtitle">NFC Wi-Fi Relay Monitor</p>
    <p class="poll-note">Auto-refreshes every 2 seconds</p>
  </div>

  {content}

  <script>
    // Auto-refresh the page every 2 seconds.
    setTimeout(function() {{ location.reload(); }}, 2000);
  </script>
</body>
</html>
"""

_WAITING_CONTENT = """\
<div class="card">
  <div class="waiting-icon">&#x1F4F6;</div>
  <h2 style="font-size:22px;font-weight:700;color:#1e40af;margin-bottom:8px;">
    Waiting for NFC Scan...
  </h2>
  <p style="font-size:15px;color:#64748b;line-height:1.5;">
    Hold an NFC health card against your phone's NFC sensor.<br>
    Patient details will appear here.
  </p>
</div>
<div style="margin-top:16px;padding:16px;background:#f8fafc;border-radius:12px;font-size:13px;color:#64748b;max-width:440px;width:100%;">
  <strong style="color:#0369a1;">Testing tip:</strong><br>
  Set NFC Tools Task URL to:<br>
  <code style="background:#e0f2fe;padding:2px 6px;border-radius:4px;">http://192.168.100.6:9000/view/HC-2026-XXXXX</code><br>
  Replace <code>HC-2026-XXXXX</code> with the health card code. No UID linking needed.
</div>
"""


def _build_patient_content(data: dict[str, Any]) -> str:
    patient = data.get("patient") or {}
    if not patient:
        return _WAITING_CONTENT

    name = patient.get("full_name", "Unknown")
    code = patient.get("patient_code", "")
    dob = patient.get("date_of_birth", "—")
    sex = patient.get("sex", "—").capitalize()
    blood = patient.get("blood_type", "—")
    allergies = patient.get("allergies", "None on record")
    ec_name = patient.get("emergency_contact_name") or "None on record"
    ec_num = patient.get("emergency_contact_number") or ""
    if ec_num:
        ec_name = f"{ec_name} · {ec_num}"
    card_status = patient.get("card_status", "unknown")
    is_senior = patient.get("is_senior", False)
    is_pwd = patient.get("is_pwd", False)
    is_pregnant = patient.get("is_pregnant", False)
    scanned_at = data.get("scanned_at") or ""

    status_color = "#16a34a" if card_status == "active" else "#f59e0b"
    status_label = card_status.capitalize()

    badges = ""
    if is_senior:
        badges += '<span class="badge badge-senior">Senior</span>'
    if is_pwd:
        badges += '<span class="badge badge-pwd">PWD</span>'
    if is_pregnant:
        badges += '<span class="badge badge-pregnant">Pregnant</span>'

    ts_str = ""
    if scanned_at:
        try:
            dt = datetime.fromisoformat(scanned_at.replace("Z", "+00:00"))
            ts_str = dt.strftime("%I:%M:%S %p")
        except ValueError:
            ts_str = scanned_at

    return f"""\
<div class="card found">
  <div style="text-align:center;">
    <span class="status-badge" style="background:{status_color};">Card {status_label}</span>
  </div>
  <div class="patient-name">{name}</div>
  <div class="patient-code">{code}</div>
  {f'<div style="margin-bottom:14px;">{badges}</div>' if badges else ""}
  <table class="detail-table">
    <tr><td>Date of Birth</td><td>{dob}</td></tr>
    <tr><td>Sex</td><td>{sex}</td></tr>
    <tr><td>Blood Type</td><td>{blood}</td></tr>
    <tr><td>Allergies</td><td>{allergies}</td></tr>
    <tr><td>Emergency</td><td>{ec_name}</td></tr>
  </table>
  {f'<p class="ts">Scanned at {ts_str}</p>' if ts_str else ""}
</div>
"""


def _do_scan(uid: str) -> dict[str, Any]:
    """Forward UID to FastAPI and update the local cache. Returns the result dict."""
    try:
        import requests  # noqa: PLC0415

        resp = requests.post(FASTAPI_SCAN_UID_URL, json={"uid": uid}, timeout=10)
        result: dict[str, Any] = resp.json()
        with _cache_lock:
            _last_result.update(
                scanned_at=datetime.utcnow().isoformat() + "Z",
                found=result.get("found", False),
                uid=uid,
                patient=result.get("patient"),
            )
        uid_prefix = uid[:8]
        if result.get("found") and result.get("patient"):
            p = result["patient"]
            log_scan(uid_prefix, p.get("full_name"), p.get("card_status", "unknown"))
        else:
            log_scan(uid_prefix, None, "not found")
        return result
    except Exception as exc:  # noqa: BLE001
        log_error(f"FastAPI unreachable: {exc}")
        return {"found": False, "error": str(exc)}


def _do_view(identifier: str) -> dict[str, Any]:
    """
    Call FastAPI GET /api/v1/health-cards/view/{identifier} and update local cache.

    The identifier may be a health card code (HC-2026-00004) or a raw NFC UID
    (C9:49:3B:07).  Uses GET — no request body.  Returns the result dict from
    FastAPI, shaped like ViewByIdentifierResponse.
    """
    try:
        import requests  # noqa: PLC0415
        from urllib.parse import quote  # noqa: PLC0415

        encoded = quote(identifier, safe="")
        url = f"{FASTAPI_VIEW_URL}/{encoded}"
        resp = requests.get(url, timeout=10)
        result: dict[str, Any] = resp.json()
        with _cache_lock:
            _last_result.update(
                scanned_at=datetime.utcnow().isoformat() + "Z",
                found=result.get("found", False),
                uid=identifier,
                patient=result.get("patient"),
            )
        uid_prefix = identifier[:8]
        if result.get("found") and result.get("patient"):
            p = result["patient"]
            log_scan(uid_prefix, p.get("full_name"), p.get("card_status", "unknown"))
        else:
            log_scan(uid_prefix, None, "not found")
        return result
    except Exception as exc:  # noqa: BLE001
        log_error(f"FastAPI unreachable during view: {exc}")
        return {"found": False, "error": str(exc)}


def _build_html_from_result(result: dict[str, Any]) -> str:
    """Build a full HTML page directly from a scan result (used by GET /scan)."""
    if result.get("found") and result.get("patient"):
        data = {
            "found": True,
            "scanned_at": _last_result.get("scanned_at"),
            "patient": result["patient"],
        }
        content = _build_patient_content(data)
    elif result.get("error"):
        content = _build_error_html(f"Backend error: {result['error']}")
        return content
    else:
        content = """\
<div class="card">
  <div class="waiting-icon">&#x26A0;&#xFE0F;</div>
  <h2 style="font-size:20px;font-weight:700;color:#b45309;margin-bottom:8px;">
    Tag Not Registered
  </h2>
  <p style="font-size:15px;color:#64748b;line-height:1.5;">
    This NFC tag is not linked to any patient.<br>
    Use the setup guide to register it first.
  </p>
</div>"""
    return _HTML_TEMPLATE.format(content=content, status_color="#16a34a")


def _build_error_html(msg: str) -> str:
    content = f"""\
<div class="card">
  <div class="waiting-icon">&#x274C;</div>
  <h2 style="font-size:20px;font-weight:700;color:#dc2626;margin-bottom:8px;">Error</h2>
  <p style="font-size:15px;color:#64748b;">{msg}</p>
</div>"""
    return _HTML_TEMPLATE.format(content=content, status_color="#dc2626")


def _build_html() -> str:
    with _cache_lock:
        data = dict(_last_result)

    if not data.get("found") or not data.get("patient"):
        content = _WAITING_CONTENT
    else:
        content = _build_patient_content(data)

    return _HTML_TEMPLATE.format(content=content, status_color="#16a34a")


# ---------------------------------------------------------------------------
# HTTP request handler
# ---------------------------------------------------------------------------


class RelayHandler(BaseHTTPRequestHandler):
    """Handle incoming HTTP requests from the Android app and the browser."""

    # Silence the default per-request access log (we print our own).
    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        pass

    def _send_json(self, status: int, body: dict[str, Any]) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def _send_html(self, status: int, html: str) -> None:
        payload = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802
        from urllib.parse import urlparse, parse_qs

        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if path == "/status":
            self._send_json(200, {"ok": True, "relay": "up", "server": f"NFC relay :{RELAY_PORT}"})
        elif path in ("/", "/nfc-monitor"):
            self._send_html(200, _build_html())
        elif path == "/scan":
            # GET /scan?uid=HEX — query string (may be stripped by some NFC apps).
            uid_list = params.get("uid", [])
            if not uid_list or not uid_list[0].strip():
                self._send_html(400, _build_error_html("Missing ?uid= parameter"))
                return
            uid = uid_list[0].strip()
            result = _do_scan(uid)
            self._send_html(200, _build_html_from_result(result))
        elif path.startswith("/scan/"):
            # GET /scan/C9:49:3B:07 — path segment (more reliable with NFC Tools).
            from urllib.parse import unquote
            uid = unquote(path[len("/scan/"):]).strip()
            if not uid:
                self._send_html(400, _build_error_html("Missing UID in path"))
                return
            result = _do_scan(uid)
            self._send_html(200, _build_html_from_result(result))
        elif path.startswith("/view/"):
            # GET /view/HC-2026-00004 or /view/C9:49:3B:07
            # NFC Tools Task URL testing: tap school ID → browser opens this URL.
            # The patient is identified by the card code in the URL, not the UID.
            from urllib.parse import unquote  # noqa: PLC0415
            identifier = unquote(path[len("/view/"):]).strip()
            if not identifier:
                self._send_html(400, _build_error_html("Missing identifier in path"))
                return
            log_info(f"View by identifier: {identifier[:8]}{'...' if len(identifier) > 8 else ''}")
            result = _do_view(identifier)
            self._send_html(200, _build_html_from_result(result))
        else:
            self._send_json(404, {"error": "Not found"})

    def do_OPTIONS(self) -> None:  # noqa: N802
        # CORS pre-flight for browser-based testing.
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/nfc-uid":
            self._send_json(404, {"error": "Not found"})
            return

        # Read request body.
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length)

        try:
            body: dict[str, Any] = json.loads(raw_body)
        except json.JSONDecodeError:
            log_error("Invalid JSON in POST /nfc-uid body")
            self._send_json(400, {"error": "Invalid JSON"})
            return

        uid: str = str(body.get("uid", "")).strip()
        if not uid:
            self._send_json(400, {"error": "Missing 'uid' field"})
            return

        uid_prefix = uid[:8]
        log_info(f"Received UID: {uid_prefix}{'...' if len(uid) > 8 else ''}")

        result = _do_scan(uid)
        status = 200 if result.get("found") else (502 if result.get("error") else 404)
        self._send_json(status, result)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    # Check that requests is available.
    try:
        import requests  # noqa: F401, PLC0415
    except ImportError:
        print(
            f"{_RED}[ERROR]{_RESET} 'requests' is not installed.\n"
            "Run: pip install requests\n"
        )
        sys.exit(1)

    server = HTTPServer((RELAY_HOST, RELAY_PORT), RelayHandler)

    print(f"\n{_BOLD}{_CYAN}  SmartHealth Hub — NFC Wi-Fi Relay Server{_RESET}")
    print(f"  {'─' * 50}")
    print(f"  Relay server     : http://0.0.0.0:{RELAY_PORT}")
    print(f"  Monitor page     : http://192.168.100.6:{RELAY_PORT}/")
    print(f"  Health check     : http://192.168.100.6:{RELAY_PORT}/status")
    print(f"  NFC endpoint     : POST http://192.168.100.6:{RELAY_PORT}/nfc-uid")
    print(f"  View by card/UID : GET  http://192.168.100.6:{RELAY_PORT}/view/{{HC-XXXX or UID}}")
    print(f"  FastAPI scan     : {FASTAPI_SCAN_UID_URL}")
    print(f"  FastAPI view     : {FASTAPI_VIEW_URL}/{{identifier}}")
    print(f"  {'─' * 50}")
    print(f"  {_DIM}Press Ctrl-C to stop{_RESET}\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\n{_YELLOW}[RELAY]{_RESET} Shutting down relay server.")
        server.shutdown()


if __name__ == "__main__":
    main()
