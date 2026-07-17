"""
Application-layer AES-256-GCM encryption utilities.

Used to encrypt/decrypt sensitive PHI fields before persisting to the database:
  - medical_history.notes
  - visits.diagnosis
  - visits.treatment_notes

Key: ENCRYPTION_KEY env var (base64-encoded 32-byte key).
     Generate with: python -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"

Full implementation: Phase 2 (Patient Records).
"""

# TODO (Phase 2): Implement:
#   encrypt(plaintext: str, key: bytes) -> str   — returns base64(nonce + tag + ciphertext)
#   decrypt(ciphertext_b64: str, key: bytes) -> str
#   get_encryption_key() -> bytes   — decodes ENCRYPTION_KEY from settings
#
# Use cryptography.hazmat.primitives.ciphers.aead.AESGCM
