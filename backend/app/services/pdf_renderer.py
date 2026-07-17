"""
PDF renderer service — uses WeasyPrint + Jinja2 to produce health card PDFs.

Templates: app/templates/health_card/card_front.html + card_back.html + card_styles.css

Full implementation: Phase 3 (Health Cards).
"""

# TODO (Phase 3): Implement render_health_card_pdf(context: dict) -> bytes
#   using WeasyPrint.HTML(string=rendered_html).write_pdf()
