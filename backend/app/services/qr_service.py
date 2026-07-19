"""
QR code generation and verification service.

Payload schema (NEVER include PHI):
  URL: {QR_BASE_URL}/verify?pid={patient_id}&v={card_version}&sig={hmac_hex}
  QR_BASE_URL is read from settings (set to LAN IP in dev, public domain in prod).

Signature: HMAC-SHA256(f"{patient_id}:{card_version}", QR_HMAC_SECRET)

The signed URL is what gets encoded into the QR image.  The server
verifies by recomputing HMAC and comparing with constant-time comparison
to prevent timing-based attacks.

Security invariant: patient_id and card_version are the ONLY fields in the
payload.  Name, DOB, diagnoses, or any other PHI must never appear here.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import io


def _get_secret() -> bytes:
    """Retrieve the HMAC secret from settings at call time (avoids circular imports)."""
    from app.core.config import settings  # noqa: PLC0415

    return settings.QR_HMAC_SECRET.encode("utf-8")


def _compute_hmac(patient_id: str, card_version: int) -> str:
    """
    Compute HMAC-SHA256 hex digest of the canonical payload string.

    Canonical form: "{patient_id}:{card_version}"
    e.g. "3f4a9c2e-...:1"
    """
    message = f"{patient_id}:{card_version}".encode("utf-8")
    return hmac.new(_get_secret(), message, hashlib.sha256).hexdigest()


def build_qr_url(patient_id: str, card_version: int) -> str:
    """
    Build the HMAC-signed verification URL that is encoded into the QR image.

    URL format:
        {QR_BASE_URL}/verify?pid={patient_id}&v={card_version}&sig={hmac_hex}

    QR_BASE_URL is read from settings so it can be set to the machine's LAN IP
    during development (e.g. http://192.168.1.100:3000) or the public domain
    in production — ensuring mobile phones on the same network can reach it.

    Args:
        patient_id:   UUID string of the patient (no PHI).
        card_version: Integer card version counter.

    Returns:
        The signed URL string (plain text, NOT the QR image).
    """
    from app.core.config import settings as _settings  # noqa: PLC0415

    sig = _compute_hmac(patient_id, card_version)
    base = _settings.QR_BASE_URL.rstrip("/")
    return f"{base}/verify?pid={patient_id}&v={card_version}&sig={sig}"


def encode_qr_payload(patient_id: str, card_version: int) -> tuple[str, str]:
    """
    Generate a signed QR payload URL and its corresponding PNG data URI.

    Steps:
    1. Compute HMAC-SHA256 of "{patient_id}:{card_version}".
    2. Build verification URL containing only patient_id, card_version, and sig.
    3. Render the URL as a QR code PNG (300px, box-size=10, border=1).
    4. Encode the PNG as a base64 data URI.

    Args:
        patient_id:   UUID string — the ONLY patient identifier in the payload.
        card_version: Card version integer.

    Returns:
        Tuple of (signed_url_string, base64_png_data_uri).

    Security invariant: The URL contains NO PHI other than the opaque patient UUID.
    """
    import qrcode  # noqa: PLC0415 — optional dep, import at call time

    signed_url = build_qr_url(patient_id, card_version)

    # Generate QR image using qrcode library with PIL backend.
    qr = qrcode.QRCode(
        version=None,  # auto-size
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=1,
    )
    qr.add_data(signed_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    # Serialize to PNG bytes.
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    png_bytes = buffer.read()

    b64 = base64.b64encode(png_bytes).decode("ascii")
    data_uri = f"data:image/png;base64,{b64}"

    return signed_url, data_uri


def verify_qr_payload(pid: str, v: int, sig: str) -> bool:
    """
    Verify the HMAC signature on a scanned QR payload.

    Recomputes the expected HMAC for the given pid + v pair and performs
    a constant-time comparison to prevent timing-based oracle attacks.

    Args:
        pid: Patient UUID string parsed from the scanned URL.
        v:   Card version integer parsed from the scanned URL.
        sig: HMAC hex string parsed from the scanned URL.

    Returns:
        True only if the signature is valid.  False for any tampered input.
    """
    expected = _compute_hmac(pid, v)
    try:
        return hmac.compare_digest(
            expected.encode("ascii"), sig.encode("ascii")
        )
    except (ValueError, TypeError):
        # compare_digest raises ValueError on mismatched types; treat as invalid.
        return False


def hash_qr_url(signed_url: str) -> str:
    """
    Compute a SHA-256 hex digest of the signed URL for storage in
    health_cards.qr_payload_hash.

    The hash is stored (not the URL itself) so a compromised DB row
    cannot be trivially replayed without knowing the HMAC secret.

    Args:
        signed_url: The full signed URL string returned by build_qr_url().

    Returns:
        SHA-256 hex digest string (64 hex characters).
    """
    return hashlib.sha256(signed_url.encode("utf-8")).hexdigest()
