import os
import io
import threading
from PIL import Image as PILImage
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Spacer, Image as RLImage, PageBreak, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

from services.ppt_style_extractor import extract_ppt_assets, extract_campaign_details, get_ppt_styles
from database.db import SessionLocal
from models.screenshot import ScreenshotResult


# ---------------------------------------------------------------------------
# Font registration
# ---------------------------------------------------------------------------

def register_fonts():
    """Register Segoe UI (Bold + Regular) or fall back to Helvetica."""
    candidates = [
        ("C:\\Windows\\Fonts\\segoeui.ttf",  "C:\\Windows\\Fonts\\segoeuib.ttf"),
        ("C:\\Windows\\Fonts\\SegoeUI.ttf",  "C:\\Windows\\Fonts\\SegoeUIBold.ttf"),
        ("C:\\Windows\\Fonts\\arial.ttf",    "C:\\Windows\\Fonts\\arialbd.ttf"),
        ("C:\\Windows\\Fonts\\Arial.ttf",    "C:\\Windows\\Fonts\\ArialBD.ttf"),
        # Linux / macOS paths
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for reg_path, bold_path in candidates:
        if os.path.exists(reg_path):
            try:
                pdfmetrics.registerFont(TTFont("BrandFont", reg_path))
                bp = bold_path if os.path.exists(bold_path) else reg_path
                pdfmetrics.registerFont(TTFont("BrandFont-Bold", bp))
                print(f"[PDF-FONT] Registered fonts from {reg_path}")
                return "BrandFont"
            except Exception as e:
                print(f"[PDF-FONT ERROR] {e}")
    return "Helvetica"


REGISTERED_FONT = register_fonts()
_pdf_tls = threading.local()

# ---------------------------------------------------------------------------
# PPT-sourced theme
# ---------------------------------------------------------------------------

# Colors extracted from the PPT_Format.pptx:
#   • Theme dk1 (body text)  : #44546A  (dark blue-grey)
#   • Theme accent1          : #5B9BD5  (soft blue)
#   • Theme accent2          : #ED7D31  (orange — used as secondary accent)
#   • Cover bg               : image2.jpg  (vibrant rainbow gradient)
#   • Inner slide bg         : image2.jpg  (same, via slideLayout1)
#   • Slide master bg        : image1.jpg  (pastel watercolor — fallback)
#   • Font                   : Segoe UI Bold / Regular
#   • Label size             : 18 pt (sz=1800 in XML)
#   • Title size             : 30 pt (sz=3000 in XML)

PPT_THEME = {
    "font_name":        "Segoe UI",
    "title_size":       30,
    "label_size":       18,
    "title_bold":       True,
    "label_bold":       True,
    # Dark blue-grey — readable on both light and gradient backgrounds
    "title_color":      "FFFFFF",   # white — on colourful cover bg
    "label_color":      "1C1C2E",   # very dark navy for inner slides (on pastel bg)
    "value_color":      "3A3A5C",   # slightly lighter navy
    # Background tints for inner slides (pastel watercolour palette from image1.jpg)
    "inner_bg_top":     "D8E8FF",   # soft periwinkle
    "inner_bg_bottom":  "F5D0E8",   # soft rose
    # Accent from PPT theme accent1
    "accent_color":     "5B9BD5",   # soft blue
    "footer_color":     "44546A",   # dk1
    "card_border":      "C8D8EE",   # light blue-grey
}


def _build_pdf_theme():
    """Merge PPT_THEME with any live PPT file styles and store in TLS."""
    live = get_ppt_styles() or {}

    theme = dict(PPT_THEME)
    # Allow live PPT to override accent / background only
    for key in ("accent_color", "background_color"):
        if live.get(key):
            raw = live[key].lstrip("#")
            if len(raw) == 6:
                theme[key] = raw.upper()

    _pdf_tls.theme = theme
    return theme


def _theme():
    t = getattr(_pdf_tls, "theme", None)
    return t if t is not None else _build_pdf_theme()


# ---------------------------------------------------------------------------
# Background helpers
# ---------------------------------------------------------------------------

def _gradient_image_reader(width, height, top_hex, bottom_hex):
    """Vertical RGB gradient → ImageReader."""
    def _rgb(h):
        h = h.upper().lstrip("#")
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

    tt, bb = _rgb(top_hex), _rgb(bottom_hex)
    img = PILImage.new("RGB", (width, height))
    px = img.load()
    ymax = max(height - 1, 1)
    for y in range(height):
        f = y / ymax
        row = tuple(int(tt[c] + (bb[c] - tt[c]) * f) for c in range(3))
        for x in range(width):
            px[x, y] = row
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


def _ppt_image_reader(path, width, height):
    """Stretch a PPT media image to fill width×height → ImageReader."""
    img = PILImage.open(path).convert("RGB").resize((width, height), PILImage.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


# ---------------------------------------------------------------------------
# Page callbacks
# ---------------------------------------------------------------------------

def draw_cover_background(canvas, doc):
    """
    Cover slide (page 1).

    Layout (mirrors PPT_Format slide 1):
      • Full-bleed vibrant rainbow gradient background  (image2.jpg)
      • Semi-transparent white card centred vertically
      • Campaign title (Segoe UI Bold 30pt, white)
      • Start / End / Format metadata (18pt)
      • Billiontags logo bottom-centre                  (image3.png)
    """
    canvas.saveState()

    assets  = extract_ppt_assets()
    details = extract_campaign_details()
    theme   = _theme()

    W, H = 960, 540

    # ── 1. Full-bleed background ─────────────────────────────────────────────
    bg_path = assets.get("background") if assets else None
    if bg_path and os.path.isfile(bg_path):
        bg_reader = _ppt_image_reader(bg_path, W, H)
        canvas.drawImage(bg_reader, 0, 0, width=W, height=H)
    else:
        # Fallback: vibrant gradient matching PPT palette
        grd = _gradient_image_reader(W, H, "B12FB5", "0595A0")
        canvas.drawImage(grd, 0, 0, width=W, height=H)

    # ── 2. Decorative swirl image (top-right, semi-transparent crop) ─────────


    # ── 3. Frosted-glass card (white + slight transparency illusion) ──────────
    card_x, card_y, card_w, card_h = 80, 175, 720, 240
    canvas.setFillColor(HexColor("#FFFFFF"))
    canvas.setFillAlpha(0.88)
    canvas.setStrokeColor(HexColor("#FFFFFF"))
    canvas.setLineWidth(0)
    canvas.roundRect(card_x, card_y, card_w, card_h, radius=16, fill=1, stroke=0)
    canvas.setFillAlpha(1.0)

    # ── 4. Text on card ───────────────────────────────────────────────────────
    font_bold = f"{REGISTERED_FONT}-Bold" if REGISTERED_FONT != "Helvetica" else "Helvetica-Bold"
    font_reg  = REGISTERED_FONT

    title       = details.get("title",      "Campaign Report")
    start_date  = details.get("start_date", "09th Apr 2026")
    end_date    = details.get("end_date",   "22nd Apr 2026")
    fmt         = details.get("format",     "Banner")

    # Title — dark navy so it pops on the white card
    title_color  = "#1C1C2E"
    label_color  = "#44546A"
    value_color  = "#1C1C2E"
    accent_color = f"#{theme['accent_color']}"

    # Split title if long
    t1, t2 = title, ""
    if len(title) > 38:
        idx = title.rfind(" ", 0, 38)
        if idx != -1:
            t1, t2 = title[:idx], title[idx:].strip()

    canvas.setFont(font_bold, 22)
    canvas.setFillColor(HexColor(title_color))
    if t2:
        canvas.drawString(card_x + 28, card_y + card_h - 46, t1)
        canvas.drawString(card_x + 28, card_y + card_h - 72, t2)
        meta_y = card_y + card_h - 104
    else:
        canvas.drawString(card_x + 28, card_y + card_h - 52, t1)
        meta_y = card_y + card_h - 88

    # Thin accent rule under title
    canvas.setStrokeColor(HexColor(accent_color))
    canvas.setLineWidth(2)
    canvas.line(card_x + 28, meta_y + 6, card_x + card_w - 28, meta_y + 6)

    # Metadata rows
    col_labels = ["Start Date:", "End Date:", "Format:"]
    col_values = [start_date, end_date, fmt]
    row_y = meta_y - 18
    for lbl, val in zip(col_labels, col_values):
        canvas.setFont(font_bold, 13)
        canvas.setFillColor(HexColor(label_color))
        canvas.drawString(card_x + 28, row_y, lbl)
        canvas.setFont(font_reg, 13)
        canvas.setFillColor(HexColor(value_color))
        canvas.drawString(card_x + 130, row_y, val)
        row_y -= 22

    # ── 5. Billiontags logo (bottom-centre) ───────────────────────────────────
    logo_path = assets.get("logo") if assets else None
    if not logo_path:
        logo_path = os.path.join("extracted_ppt_media", "image3.png")
    if logo_path and os.path.isfile(logo_path):
        logo_w, logo_h = 140, 52
        canvas.drawImage(logo_path,
                         (W - logo_w) / 2, 18,
                         width=logo_w, height=logo_h,
                         mask="auto")

    canvas.restoreState()


def draw_mockup_footer(canvas, doc):
    """
    Inner slides (pages 2+).

    Background: pastel watercolour gradient (mirrors image1.jpg palette).
    Footer:     thin accent rule + campaign title left / slide number right.
    """
    canvas.saveState()

    theme = _theme()
    W, H  = 960, 540

    # ── Background: pastel gradient (soft periwinkle → soft rose, like image1.jpg) ──
    assets = extract_ppt_assets()
    master_bg = assets.get("master_bg") if assets else None
    if not master_bg:
        master_bg = os.path.join("extracted_ppt_media", "image1.jpg")

    if master_bg and os.path.isfile(master_bg):
        bg_reader = _ppt_image_reader(master_bg, W, H)
        canvas.drawImage(bg_reader, 0, 0, width=W, height=H)
    else:
        grd = _gradient_image_reader(W, H,
                                     theme["inner_bg_top"],
                                     theme["inner_bg_bottom"])
        canvas.drawImage(grd, 0, 0, width=W, height=H)

    # ── Footer rule + text ────────────────────────────────────────────────────
    accent = f"#{theme['accent_color']}"
    footer = f"#{theme['footer_color']}"

    canvas.setStrokeColor(HexColor(accent))
    canvas.setLineWidth(1.5)
    canvas.line(40, 52, W - 40, 52)

    font_reg = REGISTERED_FONT
    details  = extract_campaign_details()
    title    = details.get("title", "Campaign Report")

    canvas.setFont(font_reg, 10)
    canvas.setFillColor(HexColor(footer))
    canvas.drawString(40, 32, f"{title} — Report")
    canvas.drawRightString(W - 40, 32, f"Slide {canvas.getPageNumber()}")

    canvas.restoreState()


# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------

def generate_pdf_report(screenshot_ids):
    """
    Generate a landscape PDF report for the given screenshot IDs.
    Returns a BytesIO buffer, or None if no screenshots found.

    Slide format: 16 × 9  (960 × 540 pt — mirrors PPT_Format dimensions).
    """
    db = SessionLocal()
    try:
        results = (
            db.query(ScreenshotResult)
            .filter(ScreenshotResult.id.in_(screenshot_ids))
            .order_by(ScreenshotResult.id.asc())
            .all()
        )
        if not results:
            return None

        _build_pdf_theme()
        theme = _theme()

        accent_pdf      = HexColor(f"#{theme['accent_color']}")
        card_border_pdf = HexColor(f"#{theme['card_border']}")

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=(960, 540),
            leftMargin=40,
            rightMargin=40,
            topMargin=40,
            bottomMargin=70,          # room for footer
        )

        # ── Paragraph styles (Segoe UI, matches PPT sz=1800 = 18pt) ──────────
        font_bold = f"{REGISTERED_FONT}-Bold" if REGISTERED_FONT != "Helvetica" else "Helvetica-Bold"
        font_reg  = REGISTERED_FONT

        label_style = ParagraphStyle(
            "Label",
            fontName=font_bold,
            fontSize=15,
            textColor=HexColor(f"#{theme['label_color']}"),
            leading=20,
        )
        value_style = ParagraphStyle(
            "Value",
            fontName=font_reg,
            fontSize=15,
            textColor=HexColor(f"#{theme['value_color']}"),
            leading=20,
        )

        story = []

        # ── Page 1: cover ────────────────────────────────────────────────────
        story.append(Spacer(1, 400))
        story.append(PageBreak())

        # ── Pages 2+: one screenshot per slide ───────────────────────────────
        for result in results:
            domain = (
                result.url
                .replace("https://", "").replace("http://", "")
                .replace("www.", "").split("/")[0]
            )

            site_cell   = Paragraph(f"<b>Site:</b> {domain}",                           label_style)
            size_cell   = Paragraph(f"<b>Ad Size:</b> {result.matched_creative_size or 'Dynamic'}", label_style)
            device_cell = Paragraph(f"<b>Device:</b> {result.device or 'Desktop'}",     label_style)

            # Three-column header — matches PPT placeholder layout
            header = Table(
                [[site_cell, size_cell, device_cell]],
                colWidths=[300, 310, 270],
            )
            header.setStyle(TableStyle([
                ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING",   (0, 0), (-1, -1), 0),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
                ("TOPPADDING",    (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]))
            story.append(header)
            story.append(Spacer(1, 8))

            # Accent divider
            divider = Table([[""]], colWidths=[880], rowHeights=[2])
            divider.setStyle(TableStyle([
                ("LINEBELOW",     (0, 0), (-1, -1), 1.5, accent_pdf),
                ("TOPPADDING",    (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]))
            story.append(divider)
            story.append(Spacer(1, 16))

            # Screenshot image
            if result.screenshot_path and os.path.exists(result.screenshot_path):
                try:
                    with PILImage.open(result.screenshot_path) as img:
                        img_w, img_h = img.size
                    aspect  = img_w / img_h
                    max_w, max_h = 860, 340
                    sw = min(max_w, max_h * aspect)
                    sh = sw / aspect
                    if sh > max_h:
                        sh, sw = max_h, max_h * aspect
                except Exception:
                    sw, sh = 600, 337

                img_flowable = RLImage(result.screenshot_path, width=sw, height=sh)
                frame = Table(
                    [[img_flowable]],
                    colWidths=[sw + 8],
                    rowHeights=[sh + 8],
                )
                frame.setStyle(TableStyle([
                    ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
                    ("BOX",           (0, 0), (-1, -1), 1, card_border_pdf),
                    ("BACKGROUND",    (0, 0), (-1, -1), HexColor("#FFFFFF")),
                    ("LEFTPADDING",   (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
                    ("TOPPADDING",    (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.append(frame)
            else:
                missing = Paragraph(
                    f"<font color='red'>Screenshot not found: {result.screenshot_path}</font>",
                    value_style,
                )
                story.append(missing)

            story.append(PageBreak())

        # Remove trailing PageBreak to avoid blank last page
        if story and isinstance(story[-1], PageBreak):
            story.pop()

        doc.build(
            story,
            onFirstPage=draw_cover_background,
            onLaterPages=draw_mockup_footer,
        )
        buffer.seek(0)
        return buffer

    finally:
        if hasattr(_pdf_tls, "theme"):
            delattr(_pdf_tls, "theme")
        db.close()