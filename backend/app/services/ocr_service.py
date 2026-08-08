"""
OCR service — extracts demographics from government ID images.

Provider abstraction:
  OcrProvider  — Protocol (interface) defining extract(image_bytes) -> OcrResult
  TesseractOcrProvider — Default offline implementation using pytesseract + Pillow
  AzureDocumentIntelligenceProvider — Optional cloud implementation (OCR_PROVIDER=azure)

OcrResult dataclass:
  given_names: str | None
  middle_name: str | None
  family_name: str | None
  date_of_birth: str | None     — normalized to ISO 8601 YYYY-MM-DD
  sex: str | None               — normalized to "male" or "female"
  address_line: str | None
  philhealth_number: str | None
  blood_type: str | None
  confidence: dict[str, float]  — per-field confidence, 0.0–1.0
  raw_text: str                 — full OCR output for debugging

Usage::
    from app.services.ocr_service import get_ocr_provider
    provider = get_ocr_provider()
    result = provider.extract(image_bytes)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Protocol

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Confidence threshold below which a field is considered "low confidence"
LOW_CONFIDENCE_THRESHOLD = 0.75


# ---------------------------------------------------------------------------
# OcrResult dataclass
# ---------------------------------------------------------------------------


@dataclass
class OcrResult:
    """Structured result from any OCR provider."""

    given_names: str | None = None
    middle_name: str | None = None
    family_name: str | None = None
    date_of_birth: str | None = None    # ISO 8601 YYYY-MM-DD or None
    sex: str | None = None              # "male" | "female" | None
    address_line: str | None = None
    philhealth_number: str | None = None
    blood_type: str | None = None
    confidence: dict[str, float] = field(default_factory=dict)
    raw_text: str = ""


# ---------------------------------------------------------------------------
# OcrProvider Protocol
# ---------------------------------------------------------------------------


class OcrProvider(Protocol):
    """Abstract interface for OCR providers."""

    def extract(self, image_bytes: bytes) -> OcrResult:
        """Extract structured data from an image. Synchronous."""
        ...


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------


_DATE_PATTERNS = [
    # MM/DD/YYYY — lookahead instead of \b so "01/06/1990MALE" still matches after sex-strip
    re.compile(r"\b(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})(?=[^/\d]|$)"),
    # MM/DD/YYYY fallback with strict word boundary
    re.compile(r"\b(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})\b"),
    # YYYY-MM-DD (ISO)
    re.compile(r"\b(\d{4})[/\-\.](\d{1,2})[/\-\.](\d{1,2})\b"),
    # Month name patterns: "01 JAN 1990", "01 JANUARY 1990", "January 1, 1990"
    # Also handles OCR variants: "DECEMBER 11.2003" or "DECEMBER 11 2003"
    re.compile(
        r"\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[,.\s]+(\d{4})(?=[^/\d]|$)",
        re.IGNORECASE,
    ),
    # "MONTH DD YYYY" — month name first
    re.compile(
        r"\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+(\d{1,2})[,.\s]+(\d{4})(?=[^/\d]|$)",
        re.IGNORECASE,
    ),
]

# All-caps lines that are definitely NOT part of a patient name on any PH government ID.
_NON_NAME_CAPS = re.compile(
    r"^(?:PHILHEALTH|MALE|FEMALE|ADDRESS|BLOOD|TYPE|REPUBLIC|PHILIPPINES|"
    r"MEMBER|NAME|DATE|BIRTH|SEX|CRN|UNIVERSAL|HEALTH|CARE|MMDDYYYY|"
    r"SENIOR|CITIZEN|PERSONS|DISABILITY|BENEFICIARY|INDIGENT|SPONSORED)$",
    re.IGNORECASE,
)

_MONTH_MAP = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}

_BLOOD_TYPE_RE = re.compile(
    r"\b(A|B|AB|O)\s*([+-])(?=\s|$|[,;.\n])",
    re.IGNORECASE,
)

_PHILHEALTH_RE = re.compile(
    r"(?:PHILHEALTH\s*(?:NO|NUMBER|#|ID)?\.?\s*[:\-]?\s*|CRN\s*[:\-]?\s*)?"
    r"(\d{2})[- ]?(\d{3})[- ]?(\d{3})[- ]?(\d{3})[- ]?(\d{1})",
    re.IGNORECASE,
)
_PHILHEALTH_BARE_RE = re.compile(r"\b(\d{2})(\d{9})(\d{1})\b")

_SEX_MAP = {
    "male": "male",
    "lalaki": "male",
    "female": "female",
    "babae": "female",
}


def _clean_ocr_text(text: str) -> str:
    """
    Remove lines that are mostly noise and collapse garbage around real words.
    Critical for photos of PhilHealth cards taken through plastic on patterned surfaces.
    """
    lines = []
    for line in text.splitlines():
        alnum = sum(c.isalnum() for c in line)
        if alnum < 4:
            continue
        if alnum / max(len(line), 1) < 0.25:
            continue
        lines.append(line)
    cleaned = "\n".join(lines)
    # Collapse runs of non-alphanumeric noise (keep spaces, commas, dashes, periods)
    cleaned = re.sub(r"[^\w\s,.\-/]+", " ", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned


def _normalize_date(text: str) -> str | None:
    """Try to extract and normalize a date from OCR text to YYYY-MM-DD."""
    # Strip sex indicators fused to the date (e.g. "01/06/1990MALE" → "01/06/1990")
    text = re.sub(r"(?<=[0-9])\s*(?:MALE|FEMALE|M|F)\b", "", text, flags=re.IGNORECASE)
    for pattern in _DATE_PATTERNS:
        match = pattern.search(text)
        if match:
            groups = match.groups()
            try:
                from dateutil.parser import parse as dateutil_parse  # noqa: PLC0415

                if len(groups) == 3:
                    raw_date = " ".join(str(g) for g in groups)
                    dt = dateutil_parse(raw_date, dayfirst=False)
                    if 1900 <= dt.year <= 2020:
                        return dt.strftime("%Y-%m-%d")
            except Exception:  # noqa: BLE001
                continue
    return None


def _normalize_sex(text: str) -> str | None:
    """Map raw OCR sex/gender string to 'male' or 'female'."""
    sex_label_match = re.search(
        r"SEX\s*[:\|]?\s*([MF])\b",
        text,
        re.IGNORECASE,
    )
    if sex_label_match:
        letter = sex_label_match.group(1).upper()
        return "male" if letter == "M" else "female"

    gender_label_match = re.search(
        r"GENDER\s*[:\|]?\s*([MF])\b",
        text,
        re.IGNORECASE,
    )
    if gender_label_match:
        letter = gender_label_match.group(1).upper()
        return "male" if letter == "M" else "female"

    for keyword, normalized in _SEX_MAP.items():
        if re.search(rf"\b{re.escape(keyword)}\b", text, re.IGNORECASE):
            return normalized

    return None


def _extract_blood_type(text: str) -> str | None:
    """Extract blood type from OCR text."""
    label_match = re.search(
        r"BLOOD\s*TYPE\s*[:\|]?\s*([ABO]{1,2})\s*([+-])",
        text,
        re.IGNORECASE,
    )
    if label_match:
        return (label_match.group(1) + label_match.group(2)).upper()

    match = _BLOOD_TYPE_RE.search(text)
    if match:
        return (match.group(1) + match.group(2)).upper()

    return None


def _extract_philhealth(text: str) -> str | None:
    """Extract PhilHealth number from OCR text."""
    match = _PHILHEALTH_RE.search(text)
    if match:
        g = match.groups()
        digits = [x for x in g if x and x.isdigit()]
        if len(digits) >= 5:
            part1 = digits[0]
            part2 = "".join(digits[1:4])
            part3 = digits[4]
            if len(part1) == 2 and len(part2) == 9 and len(part3) == 1:
                return f"{part1}-{part2}-{part3}"

    bare_match = _PHILHEALTH_BARE_RE.search(text)
    if bare_match:
        return f"{bare_match.group(1)}-{bare_match.group(2)}-{bare_match.group(3)}"

    return None


def _extract_name_from_member_name_block(raw_text: str) -> tuple[str | None, str | None, str | None]:
    """Parse the 'MEMBER NAME' block found on some PhilHealth cards."""
    pattern = re.compile(
        r"MEMBER\s*NAME\s*[:\|]?\s*\n?\s*([A-Z][A-Z\s,'.'-]{2,80})",
        re.IGNORECASE,
    )
    match = pattern.search(raw_text)
    if not match:
        return None, None, None

    name_line = match.group(1).strip()
    return _parse_name_line(name_line)


def _parse_name_line(name_line: str) -> tuple[str | None, str | None, str | None]:
    """
    Parse a "SURNAME, FIRSTNAME MIDDLENAME" or "SURNAME, FIRSTNAME M.I." name line
    into (family_name, given_names, middle_name).

    Filipino convention on PhilHealth cards:
      SURNAME, FIRSTNAME MOTHERSMAIDENNAME
    → first token after comma = given name
    → remaining tokens = middle name
    """
    name_line = re.sub(r"[^A-Za-z\s,.'/-]", " ", name_line).strip()
    name_line = re.sub(r"\s{2,}", " ", name_line)

    family_name: str | None = None
    given_names: str | None = None
    middle_name: str | None = None

    if "," in name_line:
        parts = name_line.split(",", 1)
        family_name = parts[0].strip().title()
        given_part = parts[1].strip() if len(parts) > 1 else ""

        given_words = given_part.split()
        if given_words:
            given_names = given_words[0].title()
            if len(given_words) > 1:
                middle_name = " ".join(given_words[1:]).title()
    else:
        words = name_line.split()
        if len(words) >= 2:
            given_names = words[0].title()
            family_name = words[-1].title()
            if len(words) == 3:
                middle_name = words[1].title()

    return family_name, given_names, middle_name


def _extract_address(raw_text: str) -> str | None:
    """Extract address from PhilHealth / PhilID OCR text."""
    pattern = re.compile(
        r"(?:ADDRESS|TIRAHAN)\s*[:\|]?\s*\n?(.+?)(?:\n\s*(?:PHILHEALTH|DATE\s*OF|BIRTH|SEX|BLOOD|CRN|$)|\Z)",
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(raw_text)
    if match:
        addr = match.group(1).strip()
        addr = re.sub(r"\s*\n\s*", ", ", addr)
        addr = re.sub(r"\s{2,}", " ", addr)
        if len(addr) >= 10:
            return addr[:200]

    return None


# ---------------------------------------------------------------------------
# Image pre-processing helper
# ---------------------------------------------------------------------------


def _preprocess_for_ocr(image: "PIL.Image.Image") -> "PIL.Image.Image":  # type: ignore[name-defined]
    """
    Apply pre-processing steps to improve Tesseract accuracy on ID card photos.

    Steps:
      1. Convert to RGB / grayscale
      2. Central crop to remove surrounding lace / fabric texture
      3. Upscale to ≥ 2200 px on longest edge
      4. Aggressive unsharp + contrast
      5. Autocontrast
      6. Light median denoise
    """
    from PIL import Image, ImageFilter, ImageOps, ImageEnhance  # noqa: PLC0415

    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    gray = image.convert("L")

    # Central crop — removes most of the lace/tablecloth that bleeds through plastic
    w, h = gray.size
    left   = int(w * 0.06)
    right  = int(w * 0.94)
    top    = int(h * 0.12)
    bottom = int(h * 0.88)
    if right > left and bottom > top:
        gray = gray.crop((left, top, right, bottom))

    # Upscale — higher target helps with the soft green gradient on PhilHealth cards
    TARGET_MIN_DIM = 2200
    w, h = gray.size
    longest = max(w, h)
    if longest < TARGET_MIN_DIM:
        scale = TARGET_MIN_DIM / longest
        new_w = int(round(w * scale))
        new_h = int(round(h * scale))
        gray = gray.resize((new_w, new_h), Image.LANCZOS)

    # Sharpen
    gray = gray.filter(ImageFilter.UnsharpMask(radius=1.5, percent=180, threshold=3))

    # Contrast
    gray = ImageEnhance.Contrast(gray).enhance(2.2)

    # Auto-level
    gray = ImageOps.autocontrast(gray, cutoff=1)

    # Light denoise
    gray = gray.filter(ImageFilter.MedianFilter(size=3))

    return gray


# ---------------------------------------------------------------------------
# TesseractOcrProvider (default)
# ---------------------------------------------------------------------------


class TesseractOcrProvider:
    """
    Offline OCR provider using pytesseract and Pillow.

    Key improvements for modern PhilHealth cards:
      - Stronger preprocessing (crop + higher resolution + denoise)
      - Aggressive OCR text cleaning before regex extraction
      - Tolerant name matching that works even when name is surrounded by noise
      - Filipino name parsing (SURNAME, FIRSTNAME MIDDLENAME)
      - Multiple fallbacks for unlabeled fields
    """

    def extract(self, image_bytes: bytes) -> OcrResult:
        try:
            import pytesseract  # noqa: PLC0415
            from PIL import Image  # noqa: PLC0415
            import io  # noqa: PLC0415
        except ImportError as exc:
            raise ImportError(
                "pytesseract and Pillow are required for OCR. "
                "Install them: pip install pytesseract Pillow. "
                "Also install the Tesseract binary (see README)."
            ) from exc

        try:
            raw_image = Image.open(io.BytesIO(image_bytes))
        except Exception as exc:
            logger.warning("TesseractOcrProvider: failed to open image", extra={"error": str(exc)})
            return OcrResult(raw_text="[image open failed]")

        try:
            processed = _preprocess_for_ocr(raw_image)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "TesseractOcrProvider: pre-processing failed, using raw image",
                extra={"error": str(exc)},
            )
            processed = raw_image

        custom_config_psm6 = r"--oem 3 --psm 6"
        custom_config_psm11 = r"--oem 3 --psm 11"

        raw_text_psm6: str = ""
        raw_text_psm11: str = ""

        for lang_spec in ("eng+fil", "eng"):
            try:
                raw_text_psm6 = pytesseract.image_to_string(
                    processed, lang=lang_spec, config=custom_config_psm6
                )
                break
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "TesseractOcrProvider: PSM6 pass failed",
                    extra={"lang": lang_spec, "error": str(exc)},
                )

        for lang_spec in ("eng+fil", "eng"):
            try:
                raw_text_psm11 = pytesseract.image_to_string(
                    processed, lang=lang_spec, config=custom_config_psm11
                )
                break
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "TesseractOcrProvider: PSM11 pass failed",
                    extra={"lang": lang_spec, "error": str(exc)},
                )

        raw_text = raw_text_psm6
        if raw_text_psm11 and raw_text_psm11 != raw_text_psm6:
            raw_text = raw_text_psm6 + "\n[PSM11]\n" + raw_text_psm11

        if not raw_text.strip():
            logger.warning("TesseractOcrProvider: no text extracted from image")
            return OcrResult(raw_text="[no text found]")

        # ---- Critical: clean the noisy OCR text before any field extraction ----
        raw_text = _clean_ocr_text(raw_text)
        raw_text_psm6 = _clean_ocr_text(raw_text_psm6)

        # Per-word confidence
        mean_conf: float = 0.5
        try:
            import pandas as pd  # noqa: PLC0415
            _conf_lang = "eng+fil" if raw_text_psm6 else "eng"
            data = pytesseract.image_to_data(
                processed, lang=_conf_lang,
                config=custom_config_psm6,
                output_type=pytesseract.Output.DATAFRAME,
            )
            valid_words = data[(data["conf"] > 0) & (data["text"].str.strip() != "")]
            if not valid_words.empty:
                mean_conf = float(valid_words["conf"].mean()) / 100.0
        except Exception:  # noqa: BLE001
            mean_conf = 0.5

        logger.info(
            "TesseractOcrProvider: extraction complete",
            extra={
                "raw_text_length": len(raw_text),
                "mean_confidence": round(mean_conf, 2),
                "psm6_length": len(raw_text_psm6),
                "psm11_length": len(raw_text_psm11),
            },
        )

        result = OcrResult(raw_text=raw_text)

        # ------------------------------------------------------------------
        # Name extraction
        # ------------------------------------------------------------------
        family_name, given_names, middle_name = _extract_name_from_member_name_block(raw_text)
        name_confidence = mean_conf if (family_name or given_names) else 0.0

        if not family_name and not given_names:
            # SURNAME / LAST NAME / GIVEN NAME labels (other ID types)
            surname_match = re.search(
                r"(?:SURNAME|LAST\s*NAME|APELLIDO)\s*[:\|]?\s*\n?\s*([A-Z][A-Z\s,'-]{1,40})",
                raw_text, re.IGNORECASE
            )
            if surname_match:
                family_name = surname_match.group(1).strip().split("\n")[0].strip().title()

            given_match = re.search(
                r"(?:GIVEN\s*NAME|FIRST\s*NAME|PANGALAN)\s*[:\|]?\s*\n?\s*([A-Z][A-Z\s,'-]{1,60})",
                raw_text, re.IGNORECASE
            )
            if given_match:
                given_names = given_match.group(1).strip().split("\n")[0].strip().title()

            middle_match = re.search(
                r"(?:MIDDLE\s*NAME|GITNANG\s*PANGALAN)\s*[:\|]?\s*\n?\s*([A-Z][A-Z\s.'-]{1,40})",
                raw_text, re.IGNORECASE
            )
            if middle_match:
                middle_name = middle_match.group(1).strip().split("\n")[0].strip().title()

            name_confidence = mean_conf if (family_name or given_names) else 0.0

        if not family_name and not given_names:
            # Broad tolerant search for "SURNAME, FIRSTNAME MIDDLENAME"
            # Works even when the name is surrounded by OCR garbage
            name_match = re.search(
                r"\b([A-Z]{2,}(?:\s+[A-Z]{2,})?)\s*,\s*([A-Z]{2,}(?:\s+[A-Z]{2,}){0,3})\b",
                raw_text,
                re.IGNORECASE,
            )
            if name_match:
                candidate = f"{name_match.group(1)}, {name_match.group(2)}"
                if not _NON_NAME_CAPS.match(name_match.group(1)):
                    family_name, given_names, middle_name = _parse_name_line(candidate)
                    name_confidence = mean_conf * 0.75

        if not family_name and not given_names:
            # Name immediately after PhilHealth number (tolerant of noise between them)
            ph_name_match = re.search(
                r"(?:0\d|07)[\d\s\-]{8,18}\d\s*[^\nA-Z]{0,40}"
                r"([A-Z][A-Z\s,'./-]{4,80})",
                raw_text,
                re.IGNORECASE,
            )
            if ph_name_match:
                family_name, given_names, middle_name = _parse_name_line(
                    ph_name_match.group(1).strip()
                )
                name_confidence = mean_conf * 0.8

        if not family_name and not given_names:
            # Name immediately before the PhilHealth number
            ph_name_before_match = re.search(
                r"([A-Z][A-Z\s,'./-]{4,80})\s*\n\s*"
                r"\d{2}[- ]?\d{2,3}[- ]?\d{3}[- ]?\d{3}[- ]?\d",
                raw_text,
                re.IGNORECASE,
            )
            if ph_name_before_match:
                candidate = ph_name_before_match.group(1).strip()
                if not _NON_NAME_CAPS.match(candidate):
                    family_name, given_names, middle_name = _parse_name_line(candidate)
                    name_confidence = mean_conf * 0.8

        if not family_name and not given_names:
            # Final fallback: all-caps lines
            caps_lines = re.findall(
                r"^([A-Z]{2,}(?:[\s,'-]+[A-Z]{2,})*)\s*$",
                raw_text_psm6,
                re.MULTILINE,
            )
            caps_lines = [ln for ln in caps_lines if not _NON_NAME_CAPS.match(ln)]
            if caps_lines:
                first_line = caps_lines[0]
                if "," in first_line:
                    family_name, given_names, middle_name = _parse_name_line(first_line)
                else:
                    family_name = first_line.title()
                if len(caps_lines) > 1 and not given_names:
                    given_names = caps_lines[1].title()
                name_confidence = mean_conf * 0.6

        result.family_name = family_name
        result.given_names = given_names
        result.middle_name = middle_name
        result.confidence["family_name"] = name_confidence if family_name else 0.0
        result.confidence["given_names"] = name_confidence if given_names else 0.0
        result.confidence["middle_name"] = name_confidence * 0.9 if middle_name else 0.0

        # ------------------------------------------------------------------
        # Date of birth
        # ------------------------------------------------------------------
        dob: str | None = None
        dob_from_label = False
        dob_label_match = re.search(
            r"(?:DATE\s*OF\s*BIRTH|BIRTHDATE|DOB|PETSA\s*NG\s*KAPANGANAKAN)\s*[:\|]?\s*\n?\s*([\d/\-\.A-Za-z\s,]{5,30})",
            raw_text, re.IGNORECASE
        )
        if dob_label_match:
            dob_candidate = dob_label_match.group(1).strip().split("\n")[0].strip()
            dob = _normalize_date(dob_candidate)
            if not dob:
                dob = _normalize_date(
                    dob_candidate + " " + raw_text[dob_label_match.start():dob_label_match.start() + 60]
                )
            if dob:
                dob_from_label = True

        if not dob:
            dob = _normalize_date(raw_text)

        result.date_of_birth = dob
        result.confidence["date_of_birth"] = (
            (mean_conf if dob_from_label else mean_conf * 0.7) if dob else 0.0
        )

        # ------------------------------------------------------------------
        # Sex
        # ------------------------------------------------------------------
        sex = _normalize_sex(raw_text)
        result.sex = sex
        result.confidence["sex"] = mean_conf if sex else 0.0

        # ------------------------------------------------------------------
        # Address
        # ------------------------------------------------------------------
        addr = _extract_address(raw_text)
        if not addr:
            # PhilHealth 2019+: address follows the DOB + sex line
            addr_anchor = re.search(
                r"\d{4}\s*[-–]\s*(?:MALE|FEMALE)\s*\n"
                r"((?:(?!\n\s*\n).){10,300})",
                raw_text,
                re.IGNORECASE | re.DOTALL,
            )
            if not addr_anchor:
                addr_anchor = re.search(
                    r"(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Za-z]*"
                    r"[^A-Z\n]{1,30}\s*(?:MALE|FEMALE)\s*\n"
                    r"((?:(?!\n\s*\n).){10,300})",
                    raw_text,
                    re.IGNORECASE | re.DOTALL,
                )
            if addr_anchor:
                raw_addr = addr_anchor.group(1).strip()
                raw_addr = re.sub(r"\s*\n\s*", ", ", raw_addr)
                raw_addr = re.sub(r"\s{2,}", " ", raw_addr)
                if len(raw_addr) >= 10:
                    addr = raw_addr[:200]
        result.address_line = addr
        result.confidence["address_line"] = mean_conf * 0.8 if addr else 0.0

        # ------------------------------------------------------------------
        # PhilHealth number
        # ------------------------------------------------------------------
        ph_no = _extract_philhealth(raw_text)
        result.philhealth_number = ph_no
        result.confidence["philhealth_number"] = mean_conf if ph_no else 0.0

        # ------------------------------------------------------------------
        # Blood type
        # ------------------------------------------------------------------
        bt = _extract_blood_type(raw_text)
        result.blood_type = bt
        result.confidence["blood_type"] = mean_conf if bt else 0.0

        return result


# ---------------------------------------------------------------------------
# AzureDocumentIntelligenceProvider (optional)
# ---------------------------------------------------------------------------


class AzureDocumentIntelligenceProvider:
    """
    Cloud OCR provider using Azure Document Intelligence prebuilt-idDocument model.
    Enabled when OCR_PROVIDER=azure in .env.
    """

    def extract(self, image_bytes: bytes) -> OcrResult:
        try:
            from azure.ai.documentintelligence import DocumentIntelligenceClient  # noqa: PLC0415
            from azure.core.credentials import AzureKeyCredential  # noqa: PLC0415
            import io  # noqa: PLC0415
        except ImportError as exc:
            raise ImportError(
                "azure-ai-documentintelligence is required for Azure OCR. "
                "Install it: pip install azure-ai-documentintelligence"
            ) from exc

        client = DocumentIntelligenceClient(
            endpoint=settings.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
            credential=AzureKeyCredential(settings.AZURE_DOCUMENT_INTELLIGENCE_KEY),
        )

        poller = client.begin_analyze_document(
            "prebuilt-idDocument",
            analyze_request={"urlSource": None},
            content_type="application/octet-stream",
            body=io.BytesIO(image_bytes),
        )
        result_raw = poller.result()

        ocr_result = OcrResult()

        if not result_raw.documents:
            logger.warning("AzureDocumentIntelligenceProvider: no documents returned")
            return ocr_result

        doc = result_raw.documents[0]
        fields = doc.fields or {}

        def _get(field_name: str) -> tuple[str | None, float]:
            f = fields.get(field_name)
            if f is None:
                return None, 0.0
            return f.content, f.confidence or 0.0

        first_name, conf_fn = _get("FirstName")
        last_name, conf_ln = _get("LastName")
        dob_raw, conf_dob = _get("DateOfBirth")
        sex_raw, conf_sex = _get("Sex")
        addr_raw, conf_addr = _get("Address")

        ocr_result.given_names = first_name
        ocr_result.family_name = last_name
        ocr_result.confidence["given_names"] = conf_fn
        ocr_result.confidence["family_name"] = conf_ln

        if dob_raw:
            dob_normalized = _normalize_date(dob_raw) or dob_raw
            ocr_result.date_of_birth = dob_normalized
        ocr_result.confidence["date_of_birth"] = conf_dob

        if sex_raw:
            ocr_result.sex = _normalize_sex(sex_raw)
        ocr_result.confidence["sex"] = conf_sex

        ocr_result.address_line = addr_raw
        ocr_result.confidence["address_line"] = conf_addr

        return ocr_result


# ---------------------------------------------------------------------------
# Provider factory
# ---------------------------------------------------------------------------


def get_ocr_provider() -> OcrProvider:
    """
    Return the configured OCR provider based on settings.OCR_PROVIDER.
    """
    if settings.OCR_PROVIDER == "azure":
        logger.info("OCR provider: Azure Document Intelligence")
        return AzureDocumentIntelligenceProvider()
    logger.info("OCR provider: Tesseract (offline)")
    return TesseractOcrProvider()