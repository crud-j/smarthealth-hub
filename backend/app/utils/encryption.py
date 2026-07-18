"""
Application-layer AES-256-GCM encryption utilities.

Encrypts/decrypts sensitive PHI fields before they are persisted to the database:
  - medical_history.notes
  - visits.diagnosis
  - visits.treatment_notes

Key management
--------------
The encryption key is read from ``settings.ENCRYPTION_KEY``, which must be a
base64-encoded 32-byte (256-bit) value in the environment.

Generate a production key:
    python -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"

Security properties
-------------------
- Algorithm:  AES-256-GCM (authenticated encryption — provides both confidentiality
              and integrity; unauthenticated tampering is detected and rejected).
- Nonce:      12-byte random nonce generated per encryption call (GCM standard).
- Ciphertext format: base64(nonce || ciphertext_and_tag)
              where the GCM authentication tag is appended to the ciphertext by
              the ``cryptography`` library (16 bytes, built into the 'combined' mode).
- Graceful degradation: if the ``cryptography`` package is not installed, or if
              ``ENCRYPTION_KEY`` is empty, functions fall back to identity (plaintext)
              with a WARNING log.  This ensures the clinical workflow is never blocked
              by an encryption configuration problem — but operators MUST fix the key
              in production.

Dependencies
------------
``cryptography`` (already in requirements.txt).  If it is missing at runtime the
module emits a WARNING and operates in passthrough mode.
"""

from __future__ import annotations

import base64
import os
from typing import TYPE_CHECKING

from app.core.logging import get_logger

if TYPE_CHECKING:
    pass

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Try to import the cryptography library
# ---------------------------------------------------------------------------

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # type: ignore[import]

    _CRYPTO_AVAILABLE = True
except ImportError:  # pragma: no cover
    _CRYPTO_AVAILABLE = False
    logger.warning(
        "cryptography package not installed — PHI field encryption is DISABLED. "
        "Install it with: pip install cryptography"
    )

# GCM standard nonce length in bytes
_NONCE_BYTES = 12


# ---------------------------------------------------------------------------
# Key loading
# ---------------------------------------------------------------------------


def _get_key() -> bytes | None:
    """
    Decode and return the 32-byte AES key from settings.

    Returns ``None`` (and logs a warning) if the key is missing, empty, or
    cannot be base64-decoded — callers fall back to plaintext in this case.
    """
    # Import inside function to prevent circular imports at module load time.
    from app.core.config import settings  # noqa: PLC0415

    raw: str = settings.ENCRYPTION_KEY
    if not raw or raw.strip() == "":
        logger.warning(
            "ENCRYPTION_KEY is not set — PHI fields will be stored as plaintext. "
            "Set a base64-encoded 32-byte key in your .env for production use."
        )
        return None

    try:
        key_bytes = base64.b64decode(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "ENCRYPTION_KEY is not valid base64 — PHI fields will be stored as "
            "plaintext. Error: %s",
            exc,
        )
        return None

    if len(key_bytes) != 32:
        logger.warning(
            "ENCRYPTION_KEY decoded to %d bytes but AES-256 requires exactly 32 bytes "
            "— PHI fields will be stored as plaintext.",
            len(key_bytes),
        )
        return None

    return key_bytes


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def encrypt_text(plaintext: str) -> str:
    """
    Encrypt a plaintext string with AES-256-GCM.

    Returns a base64-encoded string of the form:
        base64(nonce[12] || ciphertext_and_gcm_tag)

    Graceful degradation
    --------------------
    - If the ``cryptography`` package is not installed → returns plaintext with WARNING.
    - If ``ENCRYPTION_KEY`` is not configured → returns plaintext with WARNING.
    - If encryption itself fails unexpectedly → returns plaintext with ERROR log.

    Args:
        plaintext: The UTF-8 text to encrypt.

    Returns:
        A base64-encoded ciphertext string, or the original plaintext if
        encryption is unavailable (with a log warning).
    """
    if not _CRYPTO_AVAILABLE:
        return plaintext  # already warned at import time

    key = _get_key()
    if key is None:
        return plaintext  # key warning already emitted by _get_key()

    try:
        nonce = os.urandom(_NONCE_BYTES)
        aesgcm = AESGCM(key)
        # AESGCM.encrypt returns ciphertext + 16-byte GCM tag concatenated
        ciphertext_and_tag = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
        combined = nonce + ciphertext_and_tag
        return base64.b64encode(combined).decode("ascii")
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Unexpected error during PHI field encryption — storing as plaintext. "
            "Error: %s",
            exc,
        )
        return plaintext


def decrypt_text(ciphertext: str) -> str:
    """
    Decrypt a base64-encoded AES-256-GCM ciphertext string.

    Expects the format produced by ``encrypt_text``:
        base64(nonce[12] || ciphertext_and_gcm_tag)

    Graceful degradation
    --------------------
    - If the ``cryptography`` package is not installed → returns raw value with WARNING.
    - If ``ENCRYPTION_KEY`` is not configured → returns raw value with WARNING.
    - If the input does not look like it was encrypted (e.g. plaintext stored before
      encryption was enabled) → returns the raw value with a DEBUG log.
    - If authentication tag verification fails → returns raw value with ERROR log
      (tampered ciphertext is rejected but does not crash the request).

    Args:
        ciphertext: A base64-encoded ciphertext string as produced by ``encrypt_text``.

    Returns:
        The decrypted plaintext string, or the original ``ciphertext`` argument
        unchanged if decryption is unavailable or fails.
    """
    if not _CRYPTO_AVAILABLE:
        return ciphertext  # already warned at import time

    key = _get_key()
    if key is None:
        return ciphertext  # key warning already emitted by _get_key()

    try:
        combined = base64.b64decode(ciphertext)
    except Exception:  # noqa: BLE001
        # Not base64 → probably plaintext stored before encryption was configured.
        logger.debug(
            "decrypt_text received a value that is not base64 — returning as-is "
            "(likely stored as plaintext before encryption was enabled)."
        )
        return ciphertext

    # Minimum viable length: 12-byte nonce + 16-byte GCM tag = 28 bytes
    if len(combined) < _NONCE_BYTES + 16:
        logger.debug(
            "decrypt_text received base64 data too short to be a valid ciphertext "
            "(%d bytes) — returning as-is.",
            len(combined),
        )
        return ciphertext

    try:
        nonce = combined[:_NONCE_BYTES]
        ciphertext_and_tag = combined[_NONCE_BYTES:]
        aesgcm = AESGCM(key)
        plaintext_bytes = aesgcm.decrypt(nonce, ciphertext_and_tag, None)
        return plaintext_bytes.decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "PHI field decryption failed — returning raw stored value. "
            "Possible causes: wrong key, truncated data, or tampered ciphertext. "
            "Error: %s",
            exc,
        )
        return ciphertext
