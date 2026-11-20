#!/usr/bin/env python3
"""
Delete the health card PDFs the Celery worker used to store on disk.

Until 2026-11-20 every "Generate" wrote ``MEDIA_DIR/health_cards/<card_id>.pdf``
(name, birth date, phone, address, allergies, emergency contact).  Nothing has
served those files since the public /media mount was removed; card PDFs are
rendered on demand by the logged-in ``GET /api/v1/health-cards/{id}/pdf``.
The files only kept patient data on disk and in every daily media backup.

Only ``*.pdf`` files directly inside ``MEDIA_DIR/health_cards/`` are touched.
Without ``--apply`` nothing is deleted: the script only reports what it would do.
Running it again is harmless.

Usage (on the server, from /opt/smarthealth-hub)
-----
    docker compose -f docker-compose.server.yml --env-file .env.server \
        exec backend python scripts/purge_stored_card_pdfs.py            # dry run
    docker compose -f docker-compose.server.yml --env-file .env.server \
        exec backend python scripts/purge_stored_card_pdfs.py --apply    # delete

MEDIA_DIR comes from the environment (``/app/media`` in the container) or
``--media-dir``.  Older backups keep their copies until the backup retention
(BACKUP_KEEP_DAYS, default 14) removes them.
"""

from __future__ import annotations

import argparse
import os
import pathlib
import sys
from dataclasses import dataclass

_DEFAULT_MEDIA_DIR = pathlib.Path(__file__).resolve().parents[1] / "media"


@dataclass(frozen=True)
class PurgeResult:
    count: int
    bytes: int


def stored_card_pdfs(media_dir: pathlib.Path) -> list[pathlib.Path]:
    """The stored card PDFs: ``*.pdf`` files directly inside ``health_cards/``."""
    folder = media_dir / "health_cards"
    if not folder.is_dir():
        return []
    return sorted(p for p in folder.glob("*.pdf") if p.is_file() and not p.is_symlink())


def purge(media_dir: pathlib.Path, *, apply: bool) -> PurgeResult:
    """Delete (``apply=True``) or just count the stored card PDFs."""
    files = stored_card_pdfs(media_dir)
    total = 0
    for path in files:
        total += path.stat().st_size
        if apply:
            path.unlink()
    return PurgeResult(count=len(files), bytes=total)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0] if __doc__ else None)
    parser.add_argument(
        "--media-dir",
        type=pathlib.Path,
        default=pathlib.Path(os.environ.get("MEDIA_DIR", _DEFAULT_MEDIA_DIR)),
        help="media folder (default: $MEDIA_DIR or backend/media)",
    )
    parser.add_argument("--apply", action="store_true", help="really delete the files")
    args = parser.parse_args(argv)

    folder = args.media_dir / "health_cards"
    result = purge(args.media_dir, apply=args.apply)
    size_kb = result.bytes / 1024
    if args.apply:
        print(f"Deleted {result.count} stored card PDF(s), {size_kb:.0f} KB, from {folder}")
    else:
        print(f"Dry run: {result.count} stored card PDF(s), {size_kb:.0f} KB, in {folder}")
        if result.count:
            print("Nothing deleted. Run again with --apply to delete them.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
