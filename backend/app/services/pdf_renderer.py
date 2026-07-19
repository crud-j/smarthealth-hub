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

from jinja2 import Environment, FileSystemLoader, select_autoescape


# ---------------------------------------------------------------------------
# Jinja2 environment
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
    return html[body_start + len("<body>"):body_end]


# ---------------------------------------------------------------------------
# Public renderer
# ---------------------------------------------------------------------------


def render_health_card_pdf(
    patient: dict[str, object],
    card: dict[str, object],
    qr_data_uri: str,
) -> bytes:
    """
    Render the health card front + back into a single 2-page PDF.

    This function is synchronous (WeasyPrint does not support async I/O).
    Call it from an async endpoint like this::

        pdf_bytes = await asyncio.to_thread(
            render_health_card_pdf, patient_dict, card_dict, qr_data_uri
        )

    Args:
        patient:     Dict of patient display fields.
                     Front-face required keys:
                       first_name, last_name, middle_name, patient_code,
                       sex, age, birth_date_display, mobile_number,
                       philhealth_no, philhealth_member_type.
                     Back-face required keys:
                       address, blood_type, allergies,
                       last_bp, last_weight, last_height, last_temp,
                       medical_notes, barangay_name.
        card:        Dict of card metadata fields.
                     Required keys: card_number, card_version, issued_at.
        qr_data_uri: base64 PNG data URI from qr_service.encode_qr_payload().
                     Included in the front face only.

    Returns:
        Raw PDF bytes ready for streaming to the client.

    Security invariant: qr_data_uri encodes ONLY the HMAC-signed URL
    (patient_id + card_version + sig).  No PHI travels through the QR image.
    """
    # Deferred import: WeasyPrint has a heavyweight import cost and triggers
    # Cairo/Pango library loading.  Importing here keeps startup time low and
    # avoids issues on machines where WeasyPrint is not installed (e.g. dev
    # environments using the mock renderer).
    from weasyprint import HTML  # noqa: PLC0415

    template_ctx = {
        "patient": patient,
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
    head_block = front_html[head_start:head_end] if head_start != -1 else (
        "<head><meta charset=\"UTF-8\" />"
        "<link rel=\"stylesheet\" href=\"card_styles.css\" /></head>"
    )

    # Assemble the combined single-document HTML.
    # The back face's .card-back class carries ``page-break-before: always``
    # in card_styles.css, which instructs WeasyPrint to start it on page 2.
    combined_html = (
        "<!DOCTYPE html>\n"
        "<html lang=\"en\">\n"
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
