"""
update_admin_email.py — Update the admin user's email address in the database.

Run from the backend/ directory:
    python scripts/update_admin_email.py

This script is idempotent — safe to run multiple times.
"""

import asyncio
import sys
from pathlib import Path

# Make sure app/ is importable from scripts/
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload
from app.db.session import AsyncSessionLocal
from app.models.user import User

NEW_EMAIL = "unknownusers8273827@gmail.com"


async def main() -> None:
    async with AsyncSessionLocal() as db:
        # Load all users with their role, then filter to admin in Python
        result = await db.execute(
            select(User).options(selectinload(User.role))
        )
        all_users = result.scalars().all()

        # Target the admin role user
        users = [u for u in all_users if u.role and u.role.name == "admin"]

        if not users:
            # Fallback: update any user whose email looks like the old placeholder
            users = [
                u for u in all_users
                if "smarthealthhub" in u.email or u.email.startswith("admin@")
            ]

        if not users:
            print("No admin user found. All current emails:")
            for u in all_users:
                print(f"  {u.email}  role={getattr(u.role, 'name', '?')}")
            return

        for user in users:
            old_email = user.email
            user.email = NEW_EMAIL
            print(f"Updated: {old_email!r} -> {NEW_EMAIL!r}  (id={user.id})")

        await db.commit()
        print("Done. Log in with:", NEW_EMAIL)


if __name__ == "__main__":
    asyncio.run(main())
