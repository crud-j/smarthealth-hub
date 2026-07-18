"""
Shared base schema for all Pydantic v2 models.

Provides a common ``ConfigDict`` configuration:
  - ``from_attributes=True`` — allows building from SQLAlchemy ORM instances.
  - ``populate_by_name=True`` — allows both alias and field name at input time.
  - ``str_strip_whitespace=True`` — trims leading/trailing whitespace from all str fields.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    """Base class for all SmartHealth Hub Pydantic schemas."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        str_strip_whitespace=True,
    )
