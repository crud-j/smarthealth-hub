"""
User (staff account) business logic.

All DB queries and domain rules for staff account management live here.
Route handlers in app/api/v1/endpoints/users.py call these functions and
return Pydantic schemas — no DB logic goes in the route layer.

SDP Reference: Section 6.9 — Users & Audit API
"""

from __future__ import annotations

import logging
import secrets
import uuid

import sqlalchemy as sa
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.models.user import Role, User
from app.schemas.user import UserCreate, UserUpdate
from app.services.audit_service import write_audit_log

logger = logging.getLogger(__name__)


async def list_users(
    db: AsyncSession,
    *,
    role: str | None = None,
    is_active: bool | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[User], int]:
    """
    Return a paginated list of staff users with optional filters.

    Args:
        db:        Active async database session.
        role:      Filter by role name (e.g. "bhw", "physician").
        is_active: Filter by active status.  None means return all.
        page:      1-based page number.
        page_size: Records per page — capped at 100.

    Returns:
        A tuple of (user_list, total_count).
    """
    page_size = min(page_size, 100)
    offset = (page - 1) * page_size

    stmt = (
        sa.select(User)
        .options(selectinload(User.role))
        .order_by(User.created_at.desc())
    )
    count_stmt = sa.select(sa.func.count()).select_from(User)

    if role is not None:
        stmt = stmt.join(Role, User.role_id == Role.id).where(Role.name == role)
        count_stmt = count_stmt.join(Role, User.role_id == Role.id).where(
            Role.name == role
        )

    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
        count_stmt = count_stmt.where(User.is_active == is_active)

    total_result = await db.execute(count_stmt)
    total: int = total_result.scalar_one()

    paginated_stmt = stmt.offset(offset).limit(page_size)
    result = await db.execute(paginated_stmt)
    users = list(result.scalars().all())

    return users, total


async def get_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    """
    Fetch a single staff user by ID.

    Raises:
        NotFoundError: If no user with the given ID exists.
    """
    result = await db.execute(
        sa.select(User)
        .where(User.id == user_id)
        .options(selectinload(User.role))
    )
    user: User | None = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError("User not found.")
    return user


async def get_me(db: AsyncSession, user_id: uuid.UUID) -> User:
    """
    Fetch the calling user's own profile.

    Functionally identical to get_user — kept as a separate function so
    route docstrings can distinguish self-service vs admin reads.

    Raises:
        NotFoundError: If the user record is missing (shouldn't happen for
                       an authenticated user — treat as a data integrity issue).
    """
    return await get_user(db, user_id)


async def list_roles(db: AsyncSession, *, exclude_admin: bool = True) -> list[Role]:
    """
    Return all roles, optionally excluding the admin role.

    Used by the frontend roles dropdown in Create/Edit User modals.

    Args:
        db:            Active async database session.
        exclude_admin: When True (default), admin role is omitted so the UI
                       cannot promote a user to Admin via the self-service form.
                       Admin accounts are created only via the seed script.
    """
    stmt = sa.select(Role).order_by(Role.name)
    if exclude_admin:
        stmt = stmt.where(Role.name != "admin")
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_user(
    db: AsyncSession,
    data: UserCreate,
    created_by: uuid.UUID,
) -> tuple[User, str]:
    """
    Create a new staff user account.

    Steps:
    1. Verify the role_id exists.
    2. Check email uniqueness.
    3. Check mobile number uniqueness.
    4. Generate a 16-character temporary password.
    5. Hash the password with Argon2id.
    6. Create the User row with mfa_enabled=True.
    7. Write a CREATE audit log entry.

    Args:
        db:         Active async database session.
        data:       Validated UserCreate schema.
        created_by: UUID of the Admin who is creating the account.

    Returns:
        A tuple of (User ORM object, plaintext_temp_password).
        The caller must log the temp password to the server console
        (never return it in API responses).

    Raises:
        NotFoundError:  If data.role_id does not refer to an existing role.
        ConflictError:  If the email or mobile number is already in use.

    TODO (Phase 6 — SMS integration):
        After creating the user, send the temporary password via Semaphore SMS
        so the new staff member receives their credentials on their mobile:
            await sms_service.send(
                to=user.mobile_number,
                message=f"Your SmartHealth Hub temp password: {temp_pw}. "
                        f"Please log in and change it immediately."
            )
    """
    # 1. Verify role_id
    role_result = await db.execute(
        sa.select(Role).where(Role.id == data.role_id)
    )
    role: Role | None = role_result.scalar_one_or_none()
    if role is None:
        raise NotFoundError(f"Role with id '{data.role_id}' not found.")

    # 2. Check email uniqueness
    email_result = await db.execute(
        sa.select(User.id).where(User.email == str(data.email))
    )
    if email_result.scalar_one_or_none() is not None:
        raise ConflictError(f"A user with email '{data.email}' already exists.")

    # 3. Check mobile uniqueness
    mobile_result = await db.execute(
        sa.select(User.id).where(User.mobile_number == data.mobile_number)
    )
    if mobile_result.scalar_one_or_none() is not None:
        raise ConflictError(
            f"A user with mobile number '{data.mobile_number}' already exists."
        )

    # 4. Generate temporary password (16-char URL-safe random string)
    temp_pw = secrets.token_urlsafe(12)[:16]

    # 5. Hash password
    pw_hash = hash_password(temp_pw)

    # 6. Create User row
    user = User(
        id=uuid.uuid4(),
        full_name=data.full_name,
        email=str(data.email),
        mobile_number=data.mobile_number,
        password_hash=pw_hash,
        role_id=data.role_id,
        is_active=True,
        mfa_enabled=True,
    )
    db.add(user)
    try:
        await db.flush()  # get user.id without committing
    except IntegrityError as exc:
        await db.rollback()
        constraint_msg = str(exc.orig).lower()
        if "mobile_number" in constraint_msg:
            raise HTTPException(
                status_code=409,
                detail="Mobile number already registered to another account.",
            )
        if "email" in constraint_msg:
            raise HTTPException(
                status_code=409,
                detail="Email address already registered.",
            )
        raise  # re-raise unexpected integrity errors

    # Reload with role relationship for response serialisation
    await db.refresh(user, attribute_names=["role"])

    # 7. Audit log
    await write_audit_log(
        db=db,
        action="CREATE",
        entity_type="user",
        entity_id=user.id,
        user_id=created_by,
        metadata={"email": str(data.email), "role": role.name},
    )

    await db.commit()
    await db.refresh(user, attribute_names=["role"])

    # 8. Enqueue welcome SMS with temporary password — fire-and-forget.
    #    SMS failure must never block account creation.
    try:
        from app.workers.sms_tasks import send_sms_task  # noqa: PLC0415
        send_sms_task.delay(
            mobile_number=user.mobile_number,
            message=(
                f"Welcome to SmartHealth Hub. Your temporary password is: {temp_pw}. "
                f"Please log in and change your password immediately."
            ),
        )
    except Exception:
        logger.warning(
            "create_user: failed to enqueue welcome SMS for user %s — account created anyway.",
            user.id,
            exc_info=True,
        )

    return user, temp_pw


async def update_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    data: UserUpdate,
    updated_by: uuid.UUID,
) -> User:
    """
    Update a staff user's profile or role.

    Only fields explicitly set in the request body are updated.

    Args:
        db:         Active async database session.
        user_id:    UUID of the user to update.
        data:       Validated UserUpdate schema (partial — None fields skipped).
        updated_by: UUID of the Admin performing the update.

    Returns:
        The updated User ORM object.

    Raises:
        NotFoundError: If user_id does not exist.
        ConflictError: If the new email or mobile number is already in use by
                       a different user.
    """
    user = await get_user(db, user_id)
    fields_changed: list[str] = []

    if data.full_name is not None and data.full_name != user.full_name:
        user.full_name = data.full_name
        fields_changed.append("full_name")

    if data.email is not None and str(data.email) != user.email:
        # Check new email uniqueness
        email_result = await db.execute(
            sa.select(User.id).where(
                User.email == str(data.email), User.id != user_id
            )
        )
        if email_result.scalar_one_or_none() is not None:
            raise ConflictError(f"Email '{data.email}' is already in use.")
        user.email = str(data.email)
        fields_changed.append("email")

    if data.mobile_number is not None and data.mobile_number != user.mobile_number:
        mobile_result = await db.execute(
            sa.select(User.id).where(
                User.mobile_number == data.mobile_number, User.id != user_id
            )
        )
        if mobile_result.scalar_one_or_none() is not None:
            raise ConflictError(
                f"Mobile number '{data.mobile_number}' is already in use."
            )
        user.mobile_number = data.mobile_number
        fields_changed.append("mobile_number")

    if data.role_id is not None and data.role_id != user.role_id:
        role_result = await db.execute(
            sa.select(Role).where(Role.id == data.role_id)
        )
        role: Role | None = role_result.scalar_one_or_none()
        if role is None:
            raise NotFoundError(f"Role with id '{data.role_id}' not found.")
        user.role_id = data.role_id
        fields_changed.append("role_id")

    if data.is_active is not None and data.is_active != user.is_active:
        user.is_active = data.is_active
        fields_changed.append("is_active")

    if fields_changed:
        await write_audit_log(
            db=db,
            action="UPDATE",
            entity_type="user",
            entity_id=user_id,
            user_id=updated_by,
            metadata={"fields_changed": fields_changed},
        )

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        constraint_msg = str(exc.orig).lower()
        if "mobile_number" in constraint_msg:
            raise HTTPException(
                status_code=409,
                detail="Mobile number already registered to another account.",
            )
        if "email" in constraint_msg:
            raise HTTPException(
                status_code=409,
                detail="Email address already registered.",
            )
        raise  # re-raise unexpected integrity errors

    await db.refresh(user, attribute_names=["role"])
    return user


async def deactivate_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    deactivated_by: uuid.UUID,
) -> None:
    """
    Soft-deactivate a staff user.

    Sets is_active=False and clears refresh_token_hash so the user's current
    session is immediately invalidated (they cannot refresh their access token).

    Args:
        db:              Active async database session.
        user_id:         UUID of the user to deactivate.
        deactivated_by:  UUID of the Admin performing the deactivation.

    Raises:
        NotFoundError:  If user_id does not exist.
        ConflictError:  If the user is already deactivated.
    """
    user = await get_user(db, user_id)

    if not user.is_active:
        raise ConflictError("User is already deactivated.")

    user.is_active = False
    user.refresh_token_hash = None  # immediately invalidates outstanding session

    await write_audit_log(
        db=db,
        action="DELETE",
        entity_type="user",
        entity_id=user_id,
        user_id=deactivated_by,
        metadata={"reason": "admin_deactivation"},
    )

    await db.commit()
