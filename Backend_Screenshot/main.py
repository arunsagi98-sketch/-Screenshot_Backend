import asyncio
import sys
import os
from typing import List, Union, Optional
from fastapi import FastAPI, UploadFile, File, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, RedirectResponse, JSONResponse
from services.browser import open_website
from services.db_service import get_all_results, delete_screenshot_result
from services.pdf_exporter import generate_pdf_report
import shutil

# Windows ProactorEventLoop Fix (avoid deprecated set_event_loop_policy on Python 3.14+).
if sys.platform == "win32" and sys.version_info < (3, 14):
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

app = FastAPI()

# Browsers reject allow_origins=["*"] together with allow_credentials=True.
# Public API + file:// or cross-origin clients must use credentials=False with "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_BACKEND_ROOT = os.path.dirname(os.path.abspath(__file__))
_FRONTEND_DIR = os.path.normpath(os.path.join(_BACKEND_ROOT, "..", "Frontend_Screenshot"))

for folder in ["screenshots", "../input_images", "ppt_assets"]:
    if not os.path.exists(folder):
        os.makedirs(folder)

app.mount("/screenshots", StaticFiles(directory="screenshots"), name="screenshots")

@app.on_event("startup")
async def startup_event():
    # Run safe ALTER TABLE queries on startup to add new columns if not present
    from sqlalchemy import text
    from database.db import engine
    with engine.connect() as connection:
        try:
            # PostgreSQL syntax: ADD COLUMN IF NOT EXISTS
            connection.execute(text("ALTER TABLE screenshot_results ADD COLUMN IF NOT EXISTS matched_creative_name VARCHAR;"))
            connection.execute(text("ALTER TABLE screenshot_results ADD COLUMN IF NOT EXISTS matched_creative_size VARCHAR;"))
            connection.execute(text("ALTER TABLE screenshot_results ADD COLUMN IF NOT EXISTS device VARCHAR DEFAULT 'Desktop';"))
            connection.commit()
            print("[STARTUP] Database migrations applied successfully.")
        except Exception as e:
            print(f"[STARTUP ERROR] Database migration failed: {e}")

@app.get("/health")
def health():
    return {"status": "backend_online"}


@app.get("/")
def home():
    """Serve UI from /ui when frontend folder is present; JSON health otherwise."""
    if os.path.isdir(_FRONTEND_DIR) and os.path.isfile(os.path.join(_FRONTEND_DIR, "index.html")):
        return RedirectResponse(url="/ui/")
    return {"status": "backend_online"}

@app.get("/results")
async def get_results():
    results = await asyncio.to_thread(get_all_results)
    return results

@app.delete("/results/{result_id}")
async def delete_result(result_id: int):
    success = await asyncio.to_thread(delete_screenshot_result, result_id)
    if success:
        return {"status": "success", "message": f"Deleted result {result_id}"}
    return {"status": "error", "message": "Result not found or could not be deleted"}

@app.post("/results/export-pdf")
async def export_pdf(data: dict):
    raw_ids = data.get("ids", [])
    try:
        ids = [int(i) for i in raw_ids]
    except (TypeError, ValueError):
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": "Invalid or non-numeric ids"},
        )
    if not ids:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": "No IDs provided"},
        )
    try:
        pdf_buffer = await asyncio.to_thread(generate_pdf_report, ids)
    except Exception as e:
        print(f"[EXPORT-PDF ERROR] {e}")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": f"PDF generation failed: {e!s}"},
        )
    if not pdf_buffer:
        return JSONResponse(
            status_code=404,
            content={"status": "error", "message": "No records found for provided IDs"},
        )
    pdf_buffer.seek(0)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=screenshot_report.pdf"},
    )


@app.post("/upload-creatives")
async def upload_creatives(files: List[UploadFile] = File(...)):
    saved_files = []
    for file in files:
        file_path = os.path.join("../input_images", file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_files.append(file.filename)
    return {"status": "success", "uploaded": saved_files}

# --- IMPROVED ROBUST PROCESS ENDPOINT ---
@app.post("/process")
async def process_urls(data: dict):
    raw_urls = data.get("urls", [])
    url_list = []

    # 1. Handle if 'urls' is already a list
    if isinstance(raw_urls, list):
        url_list = [str(u).strip() for u in raw_urls if u]
    
    # 2. Handle if 'urls' is a string (comma or newline separated)
    elif isinstance(raw_urls, str):
        # Split by comma OR newline
        import re
        url_list = [u.strip() for u in re.split(r'[,\n\s]+', raw_urls) if u.strip()]

    print(f"[API] Received request for {len(url_list)} URLs")
    
    if not url_list:
        return {"status": "error", "message": "No valid URLs found in request"}
    
    # Run the automation
    result = await open_website(urls=url_list)
    return result

@app.get("/test")
async def test(urls: str = None):
    url_list = None
    if urls:
        import re
        url_list = [u.strip() for u in re.split(r'[,\n\s]+', urls) if u.strip()]
    return await open_website(urls=url_list)

@app.get("/get-image-base64")
async def get_image_base64(path: str):
    import base64
    
    # Sanitize path to prevent directory traversal
    clean_path = os.path.basename(path)
    search_paths = [
        os.path.join("screenshots", clean_path),
        os.path.join("ppt_assets", clean_path),
        os.path.join("extracted_ppt_media", clean_path),
    ]
    full_path = None
    for candidate in search_paths:
        if candidate and os.path.isfile(candidate):
            full_path = candidate
            break

    if full_path:
        with open(full_path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8")
            ext = clean_path.split(".")[-1].lower()
            mime_type = f"image/{ext}" if ext in ["png", "jpeg", "jpg", "webp"] else "image/jpeg"
            return {"dataUrl": f"data:{mime_type};base64,{encoded}"}
    return {"error": "Image not found"}


def _hex_clean(h: str, default: str) -> str:
    v = (h or "").strip().lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    if len(v) != 6:
        return default
    try:
        int(v, 16)
        return v.upper()
    except ValueError:
        return default


def _blend_hex_rgb(a: str, b: str, ratio: float) -> str:
    """a,b: RRGGBB without #. ratio 0..1 toward b."""
    a, b = _hex_clean(a, "FFFFFF"), _hex_clean(b, "000000")
    ar, ag, ab = int(a[0:2], 16), int(a[2:4], 16), int(a[4:6], 16)
    br, bg, bb = int(b[0:2], 16), int(b[2:4], 16), int(b[4:6], 16)
    r = int(round(ar + (br - ar) * ratio))
    g = int(round(ag + (bg - ag) * ratio))
    bl = int(round(ab + (bb - ab) * ratio))
    return f"{r:02X}{g:02X}{bl:02X}"


@app.get("/ppt-export-assets")
def ppt_export_assets():
    """
    One call for PPT export: extracted template images + theme hex for the frontend.
    Lets PptxGenJS show real cover/gradient when template .pptx or ppt_assets exist.
    """
    import base64
    from services.ppt_style_extractor import get_ppt_file_path, extract_ppt_assets, get_ppt_styles

    def _file_to_data_url(rel_or_abs: str) -> Optional[str]:
        if not rel_or_abs:
            return None
        p = rel_or_abs if os.path.isabs(rel_or_abs) else rel_or_abs
        if not os.path.isfile(p):
            return None
        ext = p.rsplit(".", 1)[-1].lower()
        mime = "image/png" if ext == "png" else "image/jpeg"
        with open(p, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        return f"data:{mime};base64,{b64}"

    accent_d = "6366F1"
    theme = {
        "accent": accent_d,
        "background": "F8FAFC",
        "title": "1E293B",
        "text": "334155",
        "gradientTop": "EEF2FF",
        "gradientBottom": "C7D2FE",
    }

    cover = None
    logo = None
    gradient_file = None
    text_fill = None

    ppt_path = get_ppt_file_path()
    styles = get_ppt_styles() if ppt_path else None
    if styles:
        accent = _hex_clean(styles.get("accent_color"), accent_d)
        theme["accent"] = accent
        theme["title"] = _hex_clean(styles.get("title_color"), theme["title"])
        theme["text"] = _hex_clean(styles.get("text_color"), theme["text"])
        theme["background"] = _hex_clean(styles.get("background_color"), theme["background"])
        theme["gradientTop"] = _blend_hex_rgb("FFFFFF", accent, 0.12)
        theme["gradientBottom"] = _blend_hex_rgb(theme["background"], accent, 0.28)

    if ppt_path:
        assets = extract_ppt_assets()
        if assets:
            bg = assets.get("background")
            if bg and os.path.isfile(bg):
                cover = _file_to_data_url(bg)
            lg = assets.get("logo")
            if lg and os.path.isfile(lg):
                logo = _file_to_data_url(lg)

    if not cover:
        p = os.path.join("ppt_assets", "cover_bg.jpg")
        if os.path.isfile(p):
            cover = _file_to_data_url(p)
    gf = os.path.join("ppt_assets", "gradient_bg.jpg")
    if os.path.isfile(gf):
        gradient_file = _file_to_data_url(gf)
    if not logo:
        p = os.path.join("ppt_assets", "billiontags_logo.png")
        if os.path.isfile(p):
            logo = _file_to_data_url(p)
    tf = os.path.join("ppt_assets", "text_fill.png")
    if os.path.isfile(tf):
        text_fill = _file_to_data_url(tf)

    return {
        "theme": theme,
        "cover": cover,
        "logo": logo,
        "gradient": gradient_file,
        "textFill": text_fill,
    }
if os.path.isdir(_FRONTEND_DIR) and os.path.isfile(os.path.join(_FRONTEND_DIR, "index.html")):
    app.mount("/ui", StaticFiles(directory=_FRONTEND_DIR, html=True), name="ui")
    print(f"[STARTUP] UI: http://127.0.0.1:8000/ui/ (sibling folder: {_FRONTEND_DIR})")