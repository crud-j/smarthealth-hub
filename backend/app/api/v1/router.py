"""
API v1 root router — aggregates all endpoint sub-routers.

Import and include this in app/main.py once endpoint stubs are fleshed out:

    from app.api.v1.router import api_router
    app.include_router(api_router, prefix="/api/v1")
"""

from fastapi import APIRouter

api_router = APIRouter()

# TODO (Phase 1): Uncomment each include as the endpoint module is implemented.
# from app.api.v1.endpoints import auth, mfa, users
# from app.api.v1.endpoints import patients, medical_history, immunizations
# from app.api.v1.endpoints import appointments, health_cards
# from app.api.v1.endpoints import analytics, sms, audit
#
# api_router.include_router(auth.router,           prefix="/auth",           tags=["auth"])
# api_router.include_router(mfa.router,            prefix="/auth",           tags=["mfa"])
# api_router.include_router(users.router,          prefix="/users",          tags=["users"])
# api_router.include_router(patients.router,       prefix="/patients",       tags=["patients"])
# api_router.include_router(medical_history.router,prefix="/medical-history",tags=["medical-history"])
# api_router.include_router(immunizations.router,  prefix="/immunizations",  tags=["immunizations"])
# api_router.include_router(appointments.router,   prefix="/appointments",   tags=["appointments"])
# api_router.include_router(health_cards.router,   prefix="/health-cards",   tags=["health-cards"])
# api_router.include_router(analytics.router,      prefix="/analytics",      tags=["analytics"])
# api_router.include_router(sms.router,            prefix="/sms",            tags=["sms"])
# api_router.include_router(audit.router,          prefix="/audit",          tags=["audit"])
