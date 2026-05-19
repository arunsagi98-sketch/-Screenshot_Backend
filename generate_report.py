from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.lib.colors import white, black
import os

W, H = 960, 540

def draw_bg(c, path):
    if os.path.exists(path):
        c.drawImage(ImageReader(path), 0, 0, W, H)
    else:
        print(f"Warning: {path} not found")

def draw_logo(c, logo_path):
    lw, lh = 180, 58
    if os.path.exists(logo_path):
        c.drawImage(ImageReader(logo_path), (W-lw)/2, 10, lw, lh, mask='auto')

def draw_pill(c, x, y_top, w, h, label, value):
    """y_top = distance from TOP of page"""
    rl_y = H - y_top - h           # convert to ReportLab bottom-up
    radius = 8.5
    c.setFillColor(white)
    c.roundRect(x, rl_y, w, h, radius, fill=1, stroke=0)
    c.setFillColor(black)
    font_size = 18
    text_rl_y = H - y_top - font_size - ((h - font_size) / 2)
    lw = c.stringWidth(label, "Helvetica-Bold", font_size)
    vw = c.stringWidth(value, "Helvetica", font_size)
    tx = x + (w - lw - vw) / 2
    c.setFont("Helvetica-Bold", font_size);  c.drawString(tx, text_rl_y, label)
    c.setFont("Helvetica", font_size);       c.drawString(tx + lw, text_rl_y, value)

def page_title(c, bg, logo, title, start_date, end_date, fmt):
    draw_bg(c, bg)
    # White card
    card_x, card_y_top, card_w, card_h = 146.6, 96.9, 666.1, 345.8
    card_rl_y = H - card_y_top - card_h
    c.setFillColor(white)
    c.roundRect(card_x, card_rl_y, card_w, card_h, 14.17, fill=1, stroke=0)
    # Title
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 30)
    tw = c.stringWidth(title, "Helvetica-Bold", 30)
    c.drawString(card_x + (card_w - tw)/2, H - 166.3 - 30, title)
    # Info lines
    c.setFont("Helvetica-Bold", 18)
    for text, y_top in [(start_date, 264.2), (end_date, 292.6), (f"Format: {fmt}", 320.9)]:
        tw = c.stringWidth(text, "Helvetica-Bold", 18)
        c.drawString(card_x + (card_w - tw)/2, H - y_top - 18, text)
    draw_logo(c, logo)
    c.showPage()

def page_screenshot(c, bg, site, ad_size, device, screenshot_path):
    draw_bg(c, bg)
    # Pills
    for x, w, label, value in [
        (13.3,  293.4, "Site:",    " " + site),
        (369.4, 249.5, "Ad Size:", " " + ad_size),
        (692.4, 249.5, "Device:",  " " + device),
    ]:
        draw_pill(c, x, 14.3, w, 39.8, label, value)
    # Screenshot
    if os.path.exists(screenshot_path):
        c.drawImage(ImageReader(screenshot_path),
                    114.5, 17.6, 730.2, 456.4,
                    preserveAspectRatio=True, anchor='c')
    else:
        print(f"Warning: {screenshot_path} not found")
    c.showPage()

def page_thankyou(c, bg, logo):
    draw_bg(c, bg)
    cx, cy_top, cw, ch = 240, 162, 480, 205
    c.setFillColor(white)
    c.roundRect(cx, H - cy_top - ch, cw, ch, 14.17, fill=1, stroke=0)
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 52)
    text = "Thank You"
    tw = c.stringWidth(text, "Helvetica-Bold", 52)
    c.drawString((W - tw)/2, H - cy_top - ch/2 - 20, text)
    draw_logo(c, logo)
    c.showPage()

# ── MAIN ────────────────────────────────────────────────────────────────────
output_path = "Campaign_Report_Final.pdf"
c = canvas.Canvas(output_path, pagesize=(W, H))

assets_dir = "assets"
screenshots_dir = os.path.join("Backend_Screenshot", "screenshots")

# Assets
bg_swirl = os.path.join(assets_dir, "swirl_bg.png")
bg_gradient = os.path.join(assets_dir, "gradient_bg.jpg")
logo = os.path.join(assets_dir, "billiontags_logo.png")

# Page 1: Title slide
page_title(c,
    bg         = bg_swirl,
    logo       = logo,
    title      = "Chop Steakhouse FY26 Banner Campaign",
    start_date = "Start Date: 09th Apr 2026",
    end_date   = "End Date: 22nd Apr 2026",
    fmt        = "Banner"
)

# Page 2: www.thecricketmonthly.com
page_screenshot(c, bg_gradient, 
    "www.thecricketmonthly.com", "728x90, 300x250", "Desktop", 
    os.path.join(screenshots_dir, "www_thecricketmonthly_com.png")
)

# Page 3: www.cricketcountry.com
page_screenshot(c, bg_gradient, 
    "www.cricketcountry.com", "728x90, 300x250", "Desktop", 
    os.path.join(screenshots_dir, "www_cricketcountry_com.png")
)

# Total 3 pages (Removed Thank You page as requested)

c.save()
print(f"Done -> {output_path}")

