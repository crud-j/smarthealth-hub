"""
scripts/purge_stored_card_pdfs.py: one-off removal of old stored card PDFs.

The Celery worker used to write every generated card to
``MEDIA_DIR/health_cards/<card_id>.pdf`` (name, birth date, phone, address,
allergies, emergency contact).  Nothing serves them any more, so they are
deleted.  The script must touch only ``*.pdf`` directly inside
``health_cards/`` and must change nothing without ``--apply``.

No database needed.
"""

from __future__ import annotations

import importlib.util
import pathlib
import sys
from types import ModuleType

import pytest

_SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "purge_stored_card_pdfs.py"


def _load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("purge_stored_card_pdfs", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


purge_script = _load_script()


@pytest.fixture
def media_dir(tmp_path: pathlib.Path) -> pathlib.Path:
    cards = tmp_path / "health_cards"
    cards.mkdir()
    (cards / "a.pdf").write_bytes(b"%PDF-1 a")
    (cards / "b.pdf").write_bytes(b"%PDF-1 bb")
    (cards / "notes.txt").write_text("keep me")
    (cards / "sub").mkdir()
    (cards / "sub" / "c.pdf").write_bytes(b"%PDF-1 nested")
    photos = tmp_path / "patient_photos"
    photos.mkdir()
    (photos / "p.jpg").write_bytes(b"jpg")
    (tmp_path / "loose.pdf").write_bytes(b"%PDF-1 outside")
    return tmp_path


def test_dry_run_changes_nothing(media_dir: pathlib.Path) -> None:
    result = purge_script.purge(media_dir, apply=False)

    assert result.count == 2
    assert result.bytes == len(b"%PDF-1 a") + len(b"%PDF-1 bb")
    assert (media_dir / "health_cards" / "a.pdf").exists()
    assert (media_dir / "health_cards" / "b.pdf").exists()


def test_apply_deletes_only_card_pdfs(media_dir: pathlib.Path) -> None:
    result = purge_script.purge(media_dir, apply=True)

    assert result.count == 2
    assert not (media_dir / "health_cards" / "a.pdf").exists()
    assert not (media_dir / "health_cards" / "b.pdf").exists()
    # Everything else is left alone.
    assert (media_dir / "health_cards" / "notes.txt").exists()
    assert (media_dir / "health_cards" / "sub" / "c.pdf").exists()
    assert (media_dir / "patient_photos" / "p.jpg").exists()
    assert (media_dir / "loose.pdf").exists()


def test_apply_twice_is_harmless(media_dir: pathlib.Path) -> None:
    purge_script.purge(media_dir, apply=True)

    assert purge_script.purge(media_dir, apply=True).count == 0


def test_missing_folder_is_not_an_error(tmp_path: pathlib.Path) -> None:
    result = purge_script.purge(tmp_path, apply=True)

    assert result.count == 0
    assert result.bytes == 0
