"""
_unsplash_seed_photos.py — Unsplash photo fetcher for seed scripts.

Downloads portrait photos for seeded patients and saves them as JPEGs to
settings.MEDIA_DIR/patient_photos/{patient_id}.jpg.

Used ONLY by seed scripts — never imported by the application at runtime.
Gracefully no-ops (prints a warning) when UNSPLASH_ACCESS_KEY is not set.

Unsplash API guidelines complied with:
  - Each download triggers the required GET /photos/:id/download call
    (tracks the download for photographer attribution as required).
  - Photos are used only within this closed dev/demo system (not redistributed).
"""

from __future__ import annotations

import asyncio
import pathlib
import uuid
from io import BytesIO
from typing import Any

import httpx
from PIL import Image

# Import settings lazily inside the function so that the module can be imported
# even if the calling script has not yet set up sys.path — the function itself
# will always be called after the path is ready.


# Unsplash random photo endpoint
_UNSPLASH_RANDOM_URL = "https://api.unsplash.com/photos/random"
_MAX_BATCH = 30  # Unsplash hard limit for count= parameter


async def _fetch_photos_batch(
    client: httpx.AsyncClient,
    query: str,
    count: int,
    access_key: str,
) -> list[dict[str, Any]]:
    """
    Fetch up to `count` random squarish portrait photos from Unsplash.
    Returns the list of photo objects from the API response.
    Returns [] on any error (rate limit, network, etc.).
    """
    try:
        resp = await client.get(
            _UNSPLASH_RANDOM_URL,
            params={
                "query": query,
                "count": count,
                "orientation": "squarish",
                "client_id": access_key,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        # The /photos/random endpoint returns a list when count > 1,
        # but a single object when count == 1.
        if isinstance(data, dict):
            return [data]
        return data
    except Exception as exc:
        print(f"  [photos] Warning: Unsplash API error fetching '{query}': {exc}")
        return []


async def _track_and_download(
    client: httpx.AsyncClient,
    photo: dict[str, Any],
    access_key: str,
) -> bytes | None:
    """
    Fire the attribution download-tracking call and download the image bytes
    concurrently. Returns raw image bytes or None on failure.
    """
    download_location: str = photo.get("links", {}).get("download_location", "")
    image_url: str = photo.get("urls", {}).get("small", "")

    if not image_url:
        return None

    async def _track() -> None:
        if not download_location:
            return
        try:
            await client.get(
                download_location,
                params={"client_id": access_key},
                timeout=15,
            )
        except Exception:
            pass  # tracking failure is non-fatal

    async def _download() -> bytes | None:
        try:
            resp = await client.get(image_url, timeout=30)
            resp.raise_for_status()
            return resp.content
        except Exception as exc:
            print(f"  [photos] Warning: could not download image from {image_url}: {exc}")
            return None

    results = await asyncio.gather(_track(), _download())
    return results[1]  # type: ignore[return-value]


def _save_as_jpeg(raw: bytes, dest: pathlib.Path) -> bool:
    """
    Convert raw image bytes to JPEG and write to dest.
    Returns True on success, False on failure.
    """
    try:
        with Image.open(BytesIO(raw)) as img:
            rgb = img.convert("RGB")
            buf = BytesIO()
            rgb.save(buf, "JPEG", quality=85)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(buf.getvalue())
        return True
    except Exception as exc:
        print(f"  [photos] Warning: could not save JPEG to {dest}: {exc}")
        return False


async def download_patient_photos(
    patients: list[tuple[uuid.UUID, str]],
    media_dir: pathlib.Path,
) -> dict[uuid.UUID, str]:
    """
    Fetch and save Unsplash portrait photos for a list of patients.

    Parameters
    ----------
    patients:
        List of (patient_id, sex) tuples. sex must be "male" or "female".
    media_dir:
        Absolute path to the media directory (settings.MEDIA_DIR).

    Returns
    -------
    dict mapping patient_id -> relative photo_path string
    (e.g. "patient_photos/<uuid>.jpg") for patients that got a photo.
    Patients whose photo download fails are omitted from the result.

    Skips everything and returns {} if UNSPLASH_ACCESS_KEY is not set.
    """
    import os  # noqa: PLC0415

    access_key = os.getenv("UNSPLASH_ACCESS_KEY", "")
    if not access_key:
        print(
            "  [photos] UNSPLASH_ACCESS_KEY is not set — skipping photo download. "
            "Patients will show a placeholder silhouette."
        )
        return {}

    total = len(patients)
    if total == 0:
        return {}

    # Split by sex for appropriate query strings.
    males: list[tuple[uuid.UUID, str]] = [(pid, sex) for pid, sex in patients if sex == "male"]
    females: list[tuple[uuid.UUID, str]] = [(pid, sex) for pid, sex in patients if sex != "male"]

    photo_map: dict[uuid.UUID, str] = {}

    async with httpx.AsyncClient() as client:
        # Process each sex group in batches of _MAX_BATCH.
        for group, query in [(males, "man portrait face"), (females, "woman portrait face")]:
            if not group:
                continue

            # Fetch all needed photos — Unsplash returns at most _MAX_BATCH per call.
            all_photos: list[dict[str, Any]] = []
            remaining = len(group)
            while remaining > 0:
                batch_size = min(remaining, _MAX_BATCH)
                batch = await _fetch_photos_batch(client, query, batch_size, access_key)
                all_photos.extend(batch)
                remaining -= batch_size
                if len(batch) < batch_size:
                    # API returned fewer than requested — quota/rate limit hit.
                    print(
                        f"  [photos] Unsplash returned {len(batch)} of {batch_size} "
                        f"requested photos for '{query}' — continuing with what we have."
                    )
                    break

            # Assign photos to patients (zip stops at the shorter list).
            for (patient_id, sex), photo in zip(group, all_photos):
                raw = await _track_and_download(client, photo, access_key)
                if raw is None:
                    continue

                dest = media_dir / "patient_photos" / f"{patient_id}.jpg"
                if _save_as_jpeg(raw, dest):
                    relative_path = f"patient_photos/{patient_id}.jpg"
                    photo_map[patient_id] = relative_path
                    print(f"  [photo] Saved photo for patient {patient_id} ({sex})")

    saved = len(photo_map)
    print(f"  [photos] {saved} of {total} patient photos saved via Unsplash.")
    return photo_map
