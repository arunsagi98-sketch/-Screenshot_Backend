import asyncio
import sys
import os
from typing import List, Union
from fastapi import FastAPI, UploadFile, File, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from services.browser import open_website
from services.db_service import get_all_results, delete_screenshot_result
import shutil

# Windows ProactorEventLoop Fix
if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for folder in ["screenshots", "../input_images"]:
    if not os.path.exists(folder):
        os.makedirs(folder)

app.mount("/screenshots", StaticFiles(directory="screenshots"), name="screenshots")

@app.get("/")
def home():
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
    import os
    import base64
    
    # Sanitize path to prevent directory traversal
    clean_path = os.path.basename(path)
    full_path = os.path.join("screenshots", clean_path)
    
    if os.path.exists(full_path):
        with open(full_path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8")
            ext = clean_path.split('.')[-1].lower()
            mime_type = f"image/{ext}" if ext in ["png", "jpeg", "jpg", "webp"] else "image/jpeg"
            return {"dataUrl": f"data:{mime_type};base64,{encoded}"}
    return {"error": "Image not found"}