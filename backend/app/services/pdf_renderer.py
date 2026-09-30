"""
PDF renderer service — uses WeasyPrint + Jinja2 to produce health card PDFs.

Renders card_front.html and card_back.html as a single 2-page PDF at
CR80 card dimensions (85.6mm × 54mm) using the card_styles.css stylesheet.

Strategy: Both face templates are rendered to HTML strings by Jinja2, then
combined into a single ``<html>…</html>`` document before being passed to
WeasyPrint.  A single WeasyPrint render call is used — this guarantees correct
``@page`` rule application and avoids the page-merge complexity of stitching
two separate WeasyPrint documents together.

The back face template contains ``.card-back { page-break-before: always; }``
which causes WeasyPrint to emit the back face on page 2 within this single
render pass.

WeasyPrint renders synchronously (blocking I/O).  The FastAPI endpoint
must call render_health_card_pdf() via ``asyncio.to_thread()`` to avoid
blocking the async event loop.

Template variables injected:
  patient  — dict with: first_name, last_name, middle_name, patient_code,
                        sex, age, birth_date_display, mobile_number,
                        philhealth_no, philhealth_member_type,
                        address, blood_type, allergies,
                        last_bp, last_weight, last_height, last_temp,
                        medical_notes, barangay_name
  card     — dict with: card_number, card_version, issued_at (formatted string)
  qr_code  — base64 data URI string (front face only)

SDP Reference: Section 8.4 (WeasyPrint Rendering)
"""

from __future__ import annotations

import pathlib
from datetime import date

from jinja2 import Environment, FileSystemLoader, select_autoescape

# ---------------------------------------------------------------------------
# Jinja2 environment — health card templates
# ---------------------------------------------------------------------------

_TEMPLATE_DIR = pathlib.Path(__file__).parent.parent / "templates" / "health_card"

_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(["html"]),
)

# HTML structural markers used when stitching front + back into one document.
_FRONT_CLOSE_TAGS = "</body></html>"
_BACK_OPEN_RE_START = "<html"
_BACK_BODY_OPEN = "<body>"


def _extract_body_content(html: str) -> str:
    """
    Extract the content between <body> and </body> from a rendered HTML string.

    This is used to combine the front and back face templates into a single
    HTML document.  Relies on the Jinja2 templates emitting a clean
    ``<body>\\n<div …>…</div>\\n</body>`` structure with no attributes on
    the <body> tag (both templates use plain ``<body>``).
    """
    body_start = html.find("<body>")
    body_end = html.rfind("</body>")
    if body_start == -1 or body_end == -1:
        # Fallback: return the full string if markers not found.
        return html
    # Return only the content *inside* <body>…</body>, preserving whitespace.
    return html[body_start + len("<body>") : body_end]


# ---------------------------------------------------------------------------
# Public renderer
# ---------------------------------------------------------------------------


def render_health_card_pdf(
    patient: dict[str, object],
    card: dict[str, object],
    qr_data_uri: str,
    photo_data_uri: str | None = None,
) -> bytes:
    """
    Render the health card front + back into a single 2-page PDF.

    This function is synchronous (WeasyPrint does not support async I/O).
    Call it from an async endpoint like this::

        pdf_bytes = await asyncio.to_thread(
            render_health_card_pdf, patient_dict, card_dict, qr_data_uri,
            photo_data_uri=photo_uri,
        )

    Args:
        patient:        Dict of patient display fields.
                        Front-face required keys:
                          first_name, last_name, middle_name, patient_code,
                          sex, age, birth_date_display, mobile_number,
                          philhealth_no, philhealth_member_type.
                        Back-face required keys:
                          address, blood_type, allergies,
                          last_bp, last_weight, last_height, last_temp,
                          medical_notes, barangay_name.
                        Photo key (injected automatically if not already set):
                          photo_data_uri — base64 JPEG data URI, or a
                          placeholder SVG data URI if no photo exists.
        card:           Dict of card metadata fields.
                        Required keys: card_number, card_version, issued_at.
        qr_data_uri:    base64 PNG data URI from qr_service.encode_qr_payload().
                        Included in the front face only.
        photo_data_uri: Optional base64 JPEG (or SVG placeholder) data URI for
                        the patient's profile photo.  If None, the renderer
                        calls ``patient_photo_service.get_photo_data_uri()``
                        using the ``patient_orm`` key in the patient dict (if
                        available) — otherwise the placeholder SVG is used.
                        Passing the data URI directly is preferred so the
                        caller controls when disk I/O happens.

    Returns:
        Raw PDF bytes ready for streaming to the client.

    Security invariant: qr_data_uri encodes ONLY the HMAC-signed URL
    (patient_id + card_version + sig).  No PHI travels through the QR image.
    The photo is embedded as a base64 data URI in the PDF, which is acceptable
    because the PDF is never stored server-side — it is streamed directly to
    an authenticated client and printed.
    """
    # Deferred import: WeasyPrint has a heavyweight import cost and triggers
    # Cairo/Pango library loading.  Importing here keeps startup time low and
    # avoids issues on machines where WeasyPrint is not installed (e.g. dev
    # environments using the mock renderer).
    from weasyprint import HTML  # noqa: PLC0415

    # Resolve the patient photo data URI.
    # Priority: caller-supplied photo_data_uri > patient dict's photo_data_uri
    # key > placeholder SVG (from patient_photo_service).
    resolved_photo: str
    if photo_data_uri is not None:
        resolved_photo = photo_data_uri
    elif isinstance(patient.get("photo_data_uri"), str) and patient["photo_data_uri"]:
        resolved_photo = str(patient["photo_data_uri"])
    else:
        # Attempt to resolve from ORM object if the caller provided one.
        patient_orm = patient.get("_patient_orm")
        if patient_orm is not None:
            from app.services.patient_photo_service import get_photo_data_uri  # noqa: PLC0415

            resolved_photo = get_photo_data_uri(patient_orm)
        else:
            from app.services.patient_photo_service import _PLACEHOLDER_DATA_URI  # noqa: PLC0415

            resolved_photo = _PLACEHOLDER_DATA_URI

    # Inject photo into the patient context dict (copy to avoid mutating caller's dict).
    patient_with_photo = {**patient, "photo_data_uri": resolved_photo}

    template_ctx = {
        "patient": patient_with_photo,
        "card": card,
        "qr_code": qr_data_uri,
    }

    # Render each face template to a full HTML string via Jinja2.
    front_html = _jinja_env.get_template("card_front.html").render(**template_ctx)
    back_html = _jinja_env.get_template("card_back.html").render(**template_ctx)

    # Extract the <body> content from each rendered template.
    front_body = _extract_body_content(front_html)
    back_body = _extract_body_content(back_html)

    # Extract the <head> block from the front template to reuse in the
    # combined document (stylesheet link, charset meta, title).
    head_start = front_html.find("<head>")
    head_end = front_html.find("</head>") + len("</head>")
    head_block = (
        front_html[head_start:head_end]
        if head_start != -1
        else (
            '<head><meta charset="UTF-8" /><link rel="stylesheet" href="card_styles.css" /></head>'
        )
    )

    # Assemble the combined single-document HTML.
    # The back face's .card-back class carries ``page-break-before: always``
    # in card_styles.css, which instructs WeasyPrint to start it on page 2.
    combined_html = (
        "<!DOCTYPE html>\n"
        '<html lang="en">\n'
        f"{head_block}\n"
        "<body>\n"
        f"{front_body}\n"
        f"{back_body}\n"
        "</body>\n"
        "</html>"
    )

    # base_url must be an absolute URI pointing at the templates directory so
    # WeasyPrint can resolve the relative ``href="card_styles.css"`` link.
    # Using .as_uri() + trailing slash is the correct form on both Windows and
    # Linux (avoids the common Windows bug where a bare path string fails to
    # resolve relative resources).
    base_url = _TEMPLATE_DIR.as_uri() + "/"

    pdf_bytes: bytes = HTML(string=combined_html, base_url=base_url).write_pdf()
    return pdf_bytes


# ---------------------------------------------------------------------------
# Batch renderer — N cards → 2N-page PDF
# ---------------------------------------------------------------------------


def _build_card_html_pages(
    patient: dict[str, object],
    card: dict[str, object],
    qr_data_uri: str,
    photo_data_uri: str | None,
    *,
    is_first_card: bool,
) -> tuple[str, str]:
    """
    Render front and back HTML body fragments for a single card.

    Returns (front_body_html, back_body_html) — the content inside <body>
    tags only, ready to be stitched into a combined multi-card document.

    photo_data_uri is resolved using the same priority logic as
    ``render_health_card_pdf``.  Calling code must have already resolved
    any async I/O (e.g. reading from disk) before calling this function.
    """
    # Resolve photo — mirrors the single-card renderer exactly.
    resolved_photo: str
    if photo_data_uri is not None:
        resolved_photo = photo_data_uri
    elif isinstance(patient.get("photo_data_uri"), str) and patient["photo_data_uri"]:
        resolved_photo = str(patient["photo_data_uri"])
    else:
        patient_orm = patient.get("_patient_orm")
        if patient_orm is not None:
            from app.services.patient_photo_service import get_photo_data_uri  # noqa: PLC0415

            resolved_photo = get_photo_data_uri(patient_orm)
        else:
            from app.services.patient_photo_service import _PLACEHOLDER_DATA_URI  # noqa: PLC0415

            resolved_photo = _PLACEHOLDER_DATA_URI

    patient_with_photo = {**patient, "photo_data_uri": resolved_photo}

    template_ctx = {
        "patient": patient_with_photo,
        "card": card,
        "qr_code": qr_data_uri,
    }

    front_html = _jinja_env.get_template("card_front.html").render(**template_ctx)
    back_html = _jinja_env.get_template("card_back.html").render(**template_ctx)

    front_body = _extract_body_content(front_html)
    back_body = _extract_body_content(back_html)

    # For cards after the first one, inject a page-break wrapper around the
    # front face so WeasyPrint starts it on a new page.  The back face already
    # carries ``.card-back { page-break-before: always; }`` in the stylesheet.
    if not is_first_card:
        front_body = f'<div style="page-break-before: always;">{front_body}</div>'

    return front_body, back_body


def render_batch_health_card_pdf(
    cards: list[tuple[dict[str, object], dict[str, object], str, str | None]],
) -> bytes:
    """
    Render multiple health cards as a single multi-page PDF.

    Each card occupies 2 pages (front + back).  Cards are rendered in the
    order supplied.  An empty ``cards`` list returns an empty PDF.

    Args:
        cards: List of ``(patient_dict, card_dict, qr_data_uri, photo_data_uri)``
               tuples.  Each element has the same semantics as the positional
               arguments to ``render_health_card_pdf``.

               Security invariant: ``qr_data_uri`` must encode ONLY the
               HMAC-signed URL (patient_id + card_version + sig).  No PHI
               should be present in the QR image; the caller is responsible
               for enforcing this constraint.

    Returns:
        Raw PDF bytes.  For N cards the PDF contains 2N pages.

    This function is synchronous (WeasyPrint does not support async I/O).
    Call it from an async endpoint via::

        pdf_bytes = await asyncio.to_thread(render_batch_health_card_pdf, cards)
    """
    from weasyprint import HTML  # noqa: PLC0415

    if not cards:
        # Return a minimal blank PDF rather than crashing WeasyPrint with
        # an empty body — callers should validate min_length=1 before here.
        return HTML(string="<!DOCTYPE html><html><body></body></html>").write_pdf()

    # Extract the <head> block from the very first card's front template so
    # the combined document retains the correct stylesheet link and charset.
    first_patient, first_card, first_qr, first_photo = cards[0]
    # Resolve photo for first card to get the head block.
    _first_resolved_photo: str
    if first_photo is not None:
        _first_resolved_photo = first_photo
    elif isinstance(first_patient.get("photo_data_uri"), str) and first_patient["photo_data_uri"]:
        _first_resolved_photo = str(first_patient["photo_data_uri"])
    else:
        from app.services.patient_photo_service import _PLACEHOLDER_DATA_URI  # noqa: PLC0415

        _first_resolved_photo = _PLACEHOLDER_DATA_URI

    _first_ctx = {
        "patient": {**first_patient, "photo_data_uri": _first_resolved_photo},
        "card": first_card,
        "qr_code": first_qr,
    }
    _first_front_html = _jinja_env.get_template("card_front.html").render(**_first_ctx)

    head_start = _first_front_html.find("<head>")
    head_end = _first_front_html.find("</head>") + len("</head>")
    head_block = (
        _first_front_html[head_start:head_end]
        if head_start != -1
        else (
            '<head><meta charset="UTF-8" /><link rel="stylesheet" href="card_styles.css" /></head>'
        )
    )

    # Build the combined body by concatenating all card front+back fragments.
    body_fragments: list[str] = []
    for idx, (patient, card, qr_data_uri, photo_data_uri) in enumerate(cards):
        front_body, back_body = _build_card_html_pages(
            patient,
            card,
            qr_data_uri,
            photo_data_uri,
            is_first_card=(idx == 0),
        )
        body_fragments.append(front_body)
        body_fragments.append(back_body)

    combined_html = (
        "<!DOCTYPE html>\n"
        '<html lang="en">\n'
        f"{head_block}\n"
        "<body>\n" + "\n".join(body_fragments) + "\n</body>\n</html>"
    )

    base_url = _TEMPLATE_DIR.as_uri() + "/"
    pdf_bytes: bytes = HTML(string=combined_html, base_url=base_url).write_pdf()
    return pdf_bytes


# ---------------------------------------------------------------------------
# Patient field summary renderer — A4 single-page PDF
# ---------------------------------------------------------------------------

_SUMMARY_TEMPLATE_DIR = pathlib.Path(__file__).parent.parent / "templates" / "patient_summary"

_summary_jinja_env = Environment(
    loader=FileSystemLoader(str(_SUMMARY_TEMPLATE_DIR)),
    autoescape=select_autoescape(["html"]),
)


def render_patient_summary_pdf(
    patient: dict[str, object],
    latest_vitals: dict[str, object] | None,
    upcoming_immunizations: list[dict[str, object]],
) -> bytes:
    """
    Render a one-page A4 patient field summary PDF for BHW field use.

    This function is synchronous (WeasyPrint does not support async I/O).
    Call it from an async endpoint like this::

        pdf_bytes = await asyncio.to_thread(
            render_patient_summary_pdf, patient_dict, vitals_dict, immunizations_list
        )

    Security invariants:
    - ``patient`` must NOT contain diagnosis, treatment_notes, or
      medical_history.notes.  The caller (endpoint) enforces this by
      building the dict only from Patient ORM columns and non-encrypted visit
      fields (blood_pressure, weight_kg, height_cm, temperature, visit_date).
    - A VIEW_PHI audit log row is written by the caller before streaming the
      response.  This function performs no audit logging.

    Args:
        patient:                Dict of patient demographics and flag fields.
                                Required keys: patient_code, first_name, last_name,
                                middle_name, sex, age, birth_date_display, address,
                                mobile_number, philhealth_no, philhealth_member_type,
                                is_pwd, is_senior, is_pregnant, blood_type.
        latest_vitals:          Dict with keys blood_pressure, weight_kg, height_cm,
                                temperature, visit_date (formatted string); or None
                                if no visit records exist for this patient.
        upcoming_immunizations: List of dicts, each with keys vaccine_name,
                                next_due_date (formatted string), status.
                                Maximum 5 items, ordered by next_due_date ascending.

    Returns:
        Raw PDF bytes ready for streaming to the client.
    """
    from weasyprint import HTML  # noqa: PLC0415

    today_str = date.today().strftime("%B %d, %Y")

    template = _summary_jinja_env.get_template("summary.html")
    rendered_html = template.render(
        patient=patient,
        latest_vitals=latest_vitals,
        upcoming_immunizations=upcoming_immunizations,
        today_date=today_str,
    )

    # base_url must point at the summary templates directory so WeasyPrint
    # resolves the relative href="summary_styles.css" link correctly.
    base_url = _SUMMARY_TEMPLATE_DIR.as_uri() + "/"

    pdf_bytes: bytes = HTML(string=rendered_html, base_url=base_url).write_pdf()
    return pdf_bytes
