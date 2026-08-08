#!/usr/bin/env python3
"""
PostgreSQL restore script for SmartHealth Hub.

Drops the target database, re-creates it, then restores from a pg_dump
custom-format backup (.dump) created by backup_db.py.

Usage
-----
    python scripts/restore_db.py <backup_file.dump>
    python scripts/restore_db.py <backup_file.dump> --force   # skip hostname safety check

Safety rules
------------
  1. The script always asks for explicit confirmation before proceeding.
  2. It refuses to run against a host that looks like a production server
     (hostname contains "prod", "production", or is not localhost / 127.0.0.1
     / common Docker names) unless --force is passed.
  3. Password is passed via PGPASSWORD — never as a CLI argument.

Exit codes
----------
    0  — success
    1  — failure or cancelled by user
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse, unquote

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_BACKEND_DIR = Path(__file__).resolve().parent.parent

# Hostnames considered "safe" for a destructive restore without --force.
_SAFE_HOSTNAMES = frozenset({
    "localhost", "127.0.0.1", "::1",
    "db",           # Docker Compose service name
    "postgres",     # alternative Docker service name
    "database",
})

# Patterns that suggest a production host — refuse unless --force is given.
_PROD_PATTERNS = re.compile(r"prod|production", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Helpers (shared with backup_db.py — keep in sync)
# ---------------------------------------------------------------------------


def _load_dotenv(env_path: Path) -> None:
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
    dbname = parsed.path.lstrip("/")
    if not dbname:
        raise ValueError("DATABASE_URL does not contain a database name.")
    return {"host": host, "port": port, "user": user, "password": password, "dbname": dbname}


def _find_binary(name: str) -> str:
    import shutil
    path = shutil.which(name)
    if path:
        return path
    raise RuntimeError(
        f"'{name}' not found on PATH.\n"
        "Install PostgreSQL client tools:\n"
        "  Debian/Ubuntu:  sudo apt-get install postgresql-client\n"
        "  macOS (Homebrew): brew install libpq && brew link --force libpq\n"
        "  Windows:        Install PostgreSQL from https://www.postgresql.org/download/windows/\n"
    )


def _run(cmd: list[str], pg_env: dict[str, str], label: str) -> None:
    """Run a command, print stderr on failure, and raise SystemExit on non-zero exit."""
    result = subprocess.run(cmd, env=pg_env, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"\nERROR: {label} failed (exit {result.returncode}):", file=sys.stderr)
        if result.stderr:
            print(result.stderr, file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Safety check
# ---------------------------------------------------------------------------


def _check_production_host(host: str, force: bool) -> None:
    """Abort if the host looks like a production server and --force is not set."""
    is_safe_name = host.lower() in _SAFE_HOSTNAMES
    looks_like_prod = bool(_PROD_PATTERNS.search(host))

    if looks_like_prod:
        if not force:
            print(
                f"\nSAFETY: The database host '{host}' looks like a production server.\n"
                "        This script will DROP and RECREATE the database — ALL DATA WILL BE LOST.\n"
                "        If you are sure, re-run with --force to override this check.\n",
                file=sys.stderr,
            )
            sys.exit(1)
        else:
            print(
                f"WARNING: --force passed — proceeding against potentially-production host '{host}'.",
                file=sys.stderr,
            )

    if not is_safe_name and not force:
        print(
            f"\nSAFETY: The database host '{host}' is not a recognised local/Docker hostname.\n"
            "        This script will DROP and RECREATE the database — ALL DATA WILL BE LOST.\n"
            "        If you are sure, re-run with --force to override this check.\n",
            file=sys.stderr,
        )
        sys.exit(1)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Restore a SmartHealth Hub PostgreSQL backup (created by backup_db.py).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "backup_file",
        type=Path,
        help="Path to the .dump backup file to restore.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help=(
            "Skip the production-hostname safety check. Use with extreme caution. "
            "The database WILL be dropped and recreated."
        ),
    )
    args = parser.parse_args()

    backup_file: Path = args.backup_file.resolve()
    if not backup_file.exists():
        print(f"ERROR: Backup file not found: {backup_file}", file=sys.stderr)
        return 1

    if not backup_file.suffix == ".dump" and not backup_file.name.endswith(".sql.gz"):
        print(
            f"WARNING: Backup file '{backup_file.name}' does not have a .dump extension.\n"
            "         Proceeding anyway — make sure it was created with pg_dump -Fc.",
            file=sys.stderr,
        )

    # Load .env.
    _load_dotenv(_BACKEND_DIR / ".env")

    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        print(
            "ERROR: DATABASE_URL is not set.\n"
            "  Set it in backend/.env or export it before running this script.",
            file=sys.stderr,
        )
        return 1

    try:
        conn = _parse_database_url(database_url)
    except ValueError as exc:
        print(f"ERROR: Could not parse DATABASE_URL: {exc}", file=sys.stderr)
        return 1

    # Safety: refuse production hosts unless --force.
    _check_production_host(conn["host"], force=args.force)

    # Locate binaries.
    try:
        psql = _find_binary("psql")
        pg_restore = _find_binary("pg_restore")
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    # Show plan and ask for confirmation.
    print()
    print("=" * 60)
    print("  SmartHealth Hub — Database Restore")
    print("=" * 60)
    print(f"  Backup file : {backup_file}")
    print(f"  Target DB   : {conn['dbname']} @ {conn['host']}:{conn['port']}")
    print(f"  DB user     : {conn['user']}")
    print()
    print("  WARNING: This will PERMANENTLY DELETE all data in the")
    print(f"  '{conn['dbname']}' database and restore from the backup.")
    print("=" * 60)
    print()

    answer = input("  Type 'yes' to continue, anything else to cancel: ").strip()
    if answer != "yes":
        print("Cancelled.")
        return 1

    pg_env = {**os.environ, "PGPASSWORD": conn["password"]}

    # We need to connect to the postgres maintenance database (not the target DB)
    # to run DROP/CREATE DATABASE.
    maintenance_db_args = [
        "-h", conn["host"],
        "-p", conn["port"],
        "-U", conn["user"],
        "-d", "postgres",
    ]

    # 1. Terminate existing connections to the target database so DROP succeeds.
    print(f"\nTerminating active connections to '{conn['dbname']}'...")
    _run(
        [
            psql,
            *maintenance_db_args,
            "-c",
            (
                f"SELECT pg_terminate_backend(pid) "
                f"FROM pg_stat_activity "
                f"WHERE datname = '{conn['dbname']}' AND pid <> pg_backend_pid();"
            ),
        ],
        pg_env,
        "pg_terminate_backend",
    )

    # 2. Drop the database.
    print(f"Dropping database '{conn['dbname']}'...")
    _run(
        [psql, *maintenance_db_args, "-c", f"DROP DATABASE IF EXISTS \"{conn['dbname']}\";"],
        pg_env,
        "DROP DATABASE",
    )

    # 3. Re-create the database owned by the application user.
    print(f"Creating database '{conn['dbname']}'...")
    _run(
        [
            psql,
            *maintenance_db_args,
            "-c",
            f"CREATE DATABASE \"{conn['dbname']}\" OWNER \"{conn['user']}\";",
        ],
        pg_env,
        "CREATE DATABASE",
    )

    # 4. Restore from backup.
    print(f"Restoring from '{backup_file.name}'...")
    _run(
        [
            pg_restore,
            "-h", conn["host"],
            "-p", conn["port"],
            "-U", conn["user"],
            "-d", conn["dbname"],
            "--no-owner",          # don't restore ownership (may differ between environments)
            "--no-privileges",     # don't restore GRANT/REVOKE
            "--jobs", "2",         # parallel restore for speed
            str(backup_file),
        ],
        pg_env,
        "pg_restore",
    )

    print()
    print("Restore complete.")
    print(f"  Database '{conn['dbname']}' has been restored from '{backup_file.name}'.")
    print()
    print("Next steps:")
    print("  1. Run Alembic migrations to apply any pending schema changes:")
    print("       cd backend && alembic upgrade head")
    print("  2. Restart the backend service.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
