"""
Database seeder — populates initial roles and the default admin user.

Usage:
  cd backend
  python ../scripts/seed_db.py

Full implementation: Phase 1 (Foundation).
"""

# TODO (Phase 1): Implement seeding logic:
#
#   1. Connect using settings.DATABASE_URL (async SQLAlchemy session)
#   2. Create default admin user:
#        username: admin
#        email: admin@bhc.local
#        role: admin
#        password: prompted at runtime (never hardcoded)
#        mobile_number: prompted at runtime
#   3. Idempotent — skip if records already exist (check by username)
#   4. Print confirmation of seeded records
#
# Example skeleton:
#
# import asyncio
# from app.core.config import settings
# from app.db.session import AsyncSessionLocal
# from app.models.user import User
# from app.core.security import hash_password
#
# async def seed() -> None:
#     async with AsyncSessionLocal() as session:
#         existing = await session.execute(select(User).where(User.username == "admin"))
#         if existing.scalar_one_or_none():
#             print("Admin user already exists. Skipping.")
#             return
#         admin = User(username="admin", role="admin", ...)
#         session.add(admin)
#         await session.commit()
#         print("Admin user created.")
#
# if __name__ == "__main__":
#     asyncio.run(seed())
