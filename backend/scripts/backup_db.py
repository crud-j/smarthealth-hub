#!/usr/bin/env python3
"""
PostgreSQL backup script for SmartHealth Hub.

Reads DATABASE_URL from the environment (or backend/.env), calls pg_dump to
create a compressed custom-format backup, and prunes old backups.

Usage
-----
    python scripts/backup_db.py                     # default output dir
    python scripts/backup_db.py --output /backups/  # custom output directory
    python scripts/backup_db.py --keep 14           # keep last N backups (default 7)
    python scripts/backup_db.py --dry-run           # show what would happen, do nothing

Exit codes
----------
    0  — success
    1  — failure (pg_dump error, missing binary, bad DATABASE_URL, etc.)

The script is safe to run as a cron job:
    0 2 * * *  cd /app && python scripts/backup_db.py --keep 7 >> /var/log/backup.log 2>&1
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse, unquote

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Locate the backend directory so defaults resolve regardless of cwd.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_OUTPUT_DIR = _BACKEND_DIR / "backups"
_BACKUP_SUFFIX = ".dump"                 # pg_dump custom format
_BACKUP_GLOB = "smarthealth_backup_*.dump"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_dotenv(env_path: Path) -> None:
    """Minimal .env loader — sets os.environ from KEY=VALUE lines."""
    if not env_path.exists():
        return
    with open(env_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def _parse_database_url(url: str) -> dict[str, str]:
    """
    Parse a DATABASE_URL (including postgresql+asyncpg:// variants) into
    individual components required by pg_dump / psql.

    Returns a dict with keys: host, port, user, password, dbname.
    """
    # Normalise asyncpg driver variant so urlparse handles it.
    normalised = re.sub(r"^postgresql\+asyncpg://", "postgresql://", url)
    parsed = urlparse(normalised)

    if parsed.scheme not in ("postgresql", "postgres"):
        raise ValueError(
            f"Unsupported DATABASE_URL scheme '{parsed.scheme}'. "
            "Expected 'postgresql' or 'postgresql+asyncpg'."
        )

    host = parsed.hostname or "localhost"
    port = str(parsed.port or 5432)
    user = unquote(parsed.username or "")
    password = unquote(parsed.password or "")
    # Strip leading slash from path to get db name.
    dbname = parsed.path.lstrip("/")

    if not dbname:
        raise ValueError("DATABASE_URL does not contain a database name.")

    return {"host": host, "port": port, "user": user, "password": password, "dbname": dbname}


def _find_pg_dump() -> str:
    """Return the path to pg_dump, or raise RuntimeError with install hints."""
    import shutil
    path = shutil.which("pg_dump")
    if path:
        return path
    raise RuntimeError(
        "pg_dump not found on PATH.\n"
        "Install PostgreSQL client tools:\n"
        "  Debian/Ubuntu:  sudo apt-get install postgresql-client\n"
        "  macOS (Homebrew): brew install libpq && brew link --force libpq\n"
        "  Windows:        Install PostgreSQL from https://www.postgresql.org/download/windows/\n"
        "  Docker:         docker run --rm -v $(pwd)/backups:/backups postgres:16-alpine pg_dump ...\n"
    )


def _human_size(n_bytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n_bytes < 1024:
            return f"{n_bytes:.1f} {unit}"
        n_bytes //= 1024
    return f"{n_bytes:.1f} TB"


def _remove_old_backups(output_dir: Path, keep_days: int, dry_run: bool) -> int:
    """
    Delete backup files older than *keep_days* days from *output_dir*.
    Returns the count of removed files.
    """
    cutoff = datetime.now() - timedelta(days=keep_days)
    removed = 0
    for backup_file in sorted(output_dir.glob(_BACKUP_GLOB)):
        mtime = datetime.fromtimestamp(backup_file.stat().st_mtime)
        if mtime < cutoff:
            if dry_run:
                print(f"  [dry-run] Would remove: {backup_file.name}  (mtime {mtime:%Y-%m-%d %H:%M:%S})")
            else:
                backup_file.unlink()
                print(f"  Removed old backup: {backup_file.name}  (mtime {mtime:%Y-%m-%d %H:%M:%S})")
            removed += 1
    return removed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a pg_dump backup of the SmartHealth Hub database.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=_DEFAULT_OUTPUT_DIR,
        help="Directory to write backup files into (default: backend/backups/)",
    )
    parser.add_argument(
        "--keep", "-k",
        type=int,
        default=7,
        metavar="DAYS",
        help="Delete backup files older than N days (default: 7). Pass 0 to disable pruning.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would happen without actually running pg_dump or deleting files.",
    )
    args = parser.parse_args()

    # Load .env so DATABASE_URL is available even when not exported in the shell.
    _load_dotenv(_BACKEND_DIR / ".env")

    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        print(
            "ERROR: DATABASE_URL is not set.\n"
            "  Set it in backend/.env or export it before running this script.",
            file=sys.stderr,
        )
        return 1

    # Parse connection components.
    try:
        conn = _parse_database_url(database_url)
    except ValueError as exc:
        print(f"ERROR: Could not parse DATABASE_URL: {exc}", file=sys.stderr)
        return 1

    # Locate pg_dump binary.
    try:
        pg_dump = _find_pg_dump()
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    # Ensure output directory exists.
    output_dir: Path = args.output.resolve()
    if not args.dry_run:
        output_dir.mkdir(parents=True, exist_ok=True)

    # Build output file name.
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = output_dir / f"smarthealth_backup_{timestamp}{_BACKUP_SUFFIX}"

    print(f"SmartHealth Hub — PostgreSQL Backup")
    print(f"  Database : {conn['dbname']} @ {conn['host']}:{conn['port']}")
    print(f"  Output   : {backup_file}")
    print(f"  Keep     : {args.keep} days")
    if args.dry_run:
        print("  [DRY RUN] No files will be created or deleted.")
    print()

    # Run pg_dump.
    # -Fc = custom (compressed) format, readable by pg_restore.
    # Password is passed via the PGPASSWORD environment variable — never as a
    # CLI argument (which would be visible in `ps` output).
    pg_env = {**os.environ, "PGPASSWORD": conn["password"]}
    cmd = [
        pg_dump,
        "-Fc",
        "-h", conn["host"],
        "-p", conn["port"],
        "-U", conn["user"],
        "-d", conn["dbname"],
        "-f", str(backup_file),
    ]

    if args.dry_run:
        print(f"[dry-run] Would run: {' '.join(cmd)}")
        print()
    else:
        start = time.perf_counter()
        print(f"Running pg_dump...")
        try:
            result = subprocess.run(
                cmd,
                env=pg_env,
                capture_output=True,
                text=True,
            )
        except FileNotFoundError:
            print(f"ERROR: pg_dump binary not found at '{pg_dump}'.", file=sys.stderr)
            return 1

        elapsed = time.perf_counter() - start

        if result.returncode != 0:
            print(f"ERROR: pg_dump failed (exit {result.returncode}):", file=sys.stderr)
            if result.stderr:
                print(result.stderr, file=sys.stderr)
            # Clean up empty/partial file if it was created.
            if backup_file.exists() and backup_file.stat().st_size == 0:
                backup_file.unlink()
            return 1

        file_size = backup_file.stat().st_size
        print(f"Backup complete.")
        print(f"  File     : {backup_file}")
        print(f"  Size     : {_human_size(file_size)}")
        print(f"  Duration : {elapsed:.1f}s")
        print()

    # Prune old backups.
    if args.keep > 0:
        print(f"Pruning backups older than {args.keep} days from {output_dir}...")
        removed = _remove_old_backups(output_dir, keep_days=args.keep, dry_run=args.dry_run)
        if removed:
            print(f"  Removed {removed} old backup(s).")
        else:
            print(f"  No old backups to remove.")
    else:
        print("Pruning disabled (--keep 0).")

    print()
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
