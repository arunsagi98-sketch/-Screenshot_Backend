import asyncio
import sys
import random
import traceback
import os
from urllib.parse import urlparse
from playwright.async_api import async_playwright
from services.ad_detector import detect_ad_slots
from services.image_utils import get_local_creatives, find_best_match
from services.db_service import save_screenshot_result

# Windows ProactorEventLoop is required for Playwright subprocesses
if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

POPUP_TEXTS = [
    # Your originals (minus "Allow" — handle separately)
    "Not Now", "No Thanks", "Close", "Dismiss",
    "Skip", "Maybe Later", "Continue Without Supporting",
    "Cancel",
    # Additions
    "Got It", "OK", "Okay", "Done",
    "Accept", "Reject All", "Decline",
    "Later", "Remind Me Later",
    "No", "I Agree", "Agree",
    "Don't Show Again", "Don't Ask Again",
    "×", "✕", "✖",
]

async def close_popups(page):
    """Try to close common popups by clicking known button texts."""
    for text in POPUP_TEXTS:
        try:
            locator = page.locator(f"text='{text}'").first
            if await locator.is_visible(timeout=300):
                await locator.click(timeout=1000)
                print(f"[INFO] Closed popup: {text}")
                await page.wait_for_timeout(400)
        except Exception:
            pass

async def remove_overlays(page):
    """Remove overlay/modal elements via JavaScript."""
    try:
        await page.evaluate(
            """() => {
                const selectors = [
                    '.modal', '.popup', '.overlay',
                    '.newsletter', '.subscribe', '.cookie',
                    '[id*="popup"]', '[class*="popup"]',
                    '[class*="overlay"]', '[class*="modal"]'
                ];
                selectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => el.remove());
                });
                document.body.style.overflow = 'auto';
            }"""
        )
    except Exception:
        pass

async def apply_creative_overlay(page, ad_slot, creative):
    """
    Core Overlay Engine: Injects the creative to perfectly mask the ad.
    Uses aspect-ratio preservation (no stretching) and maximum z-index.
    """
    try:
        await page.evaluate(f"""
            () => {{
                // 1. Target and hide the original ad
                const selector = "{ad_slot['selector']}";
                const originalAds = document.querySelectorAll(selector);
                
                originalAds.forEach(el => {{
                    const r = el.getBoundingClientRect();
                    const x = Math.round(r.left + window.scrollX);
                    const y = Math.round(r.top + window.scrollY);
                    
                    if (Math.abs(x - {ad_slot['x']}) < 15 && Math.abs(y - {ad_slot['y']}) < 15) {{
                        el.style.visibility = 'hidden';
                        el.style.opacity = '0';
                        el.style.pointerEvents = 'none';
                    }}
                }});

                // 2. Inject the custom overlay
                const div = document.createElement('div');
                div.className = 'automation-overlay';
                div.style.position = 'absolute';
                div.style.left = '{ad_slot['x']}px';
                div.style.top = '{ad_slot['y']}px';
                div.style.width = '{ad_slot['width']}px';
                div.style.height = '{ad_slot['height']}px';
                div.style.zIndex = '2147483647';
                div.style.backgroundColor = '#ffffff'; // Fallback solid background
                div.style.backgroundImage = 'url("{creative['base64']}")';
                
                // NO STRETCHING: use contain to keep aspect ratio
                div.style.backgroundSize = 'contain'; 
                div.style.backgroundRepeat = 'no-repeat';
                div.style.backgroundPosition = 'center';
                
                div.style.pointerEvents = 'none';
                div.style.boxShadow = 'inset 0 0 1px rgba(0,0,0,0.2)'; // Subtle border for realism
                
                document.body.appendChild(div);
            }}
        """)
        print(f"[ENGINE] Masked {ad_slot['width']}x{ad_slot['height']} slot with {creative['name']}")
    except Exception as e:
        print(f"[ENGINE ERROR] Overlay failed: {e}")

async def process_single_url(context, url, creatives):
    """Processes a single URL and saves results to DB."""
    page = await context.new_page()
    domain = urlparse(url).netloc.replace('.', '_')
    screenshot_path = f"screenshots/{domain}.png"
    
    if not os.path.exists("screenshots"):
        os.makedirs("screenshots")

    try:
        print(f"\n[SCAN] {url}")
        await page.goto(url, wait_until="domcontentloaded", timeout=45000)
        await page.wait_for_load_state("load")
        await page.wait_for_timeout(2000)
        
        await close_popups(page)

        # Human-like scrolling to trigger lazy-loaded images and ads
        current_position = 0
        max_scrolls = 15
        scrolls = 0
        
        while scrolls < max_scrolls:
            scroll_step = random.randint(600, 1000)
            current_position += scroll_step
            await page.evaluate(f"window.scrollTo(0, {current_position})")
            await page.wait_for_timeout(random.randint(400, 800))
            
            new_height = await page.evaluate("document.body.scrollHeight")
            if current_position >= new_height:
                break
            scrolls += 1

        # Give the page a moment to finish loading any lazy assets
        try:
            await page.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            pass
            
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(2000)
        await remove_overlays(page)
        
        # Detection & Overlay
        ad_slots = await detect_ad_slots(page)
        matches_count = 0
        
        if ad_slots and creatives:
            for slot in ad_slots:
                best_creative = find_best_match(slot, creatives, tolerance=35)
                if best_creative:
                    await apply_creative_overlay(page, slot, best_creative)
                    matches_count += 1
                    
                    # Remove the creative from the pool so it isn't reused on other sites
                    creatives.remove(best_creative)
                    
                    # Scroll the masked ad into the center of the viewport
                    scroll_y = max(0, slot['y'] - 150)
                    await page.evaluate(f"window.scrollTo(0, {scroll_y})")
                    
                    # Only apply 1 creative per website
                    break

        if matches_count > 0:
            await page.wait_for_timeout(1000)
            
            # --- INJECT MOCK ADDRESS BAR ---
            await page.evaluate(f"""
                () => {{
                    const bar = document.createElement('div');
                    bar.id = 'mock-address-bar';
                    bar.style.position = 'fixed';
                    bar.style.top = '0';
                    bar.style.left = '0';
                    bar.style.width = '100%';
                    bar.style.height = '48px';
                    bar.style.backgroundColor = '#F3F3F3';
                    bar.style.borderBottom = '1px solid #CCCCCC';
                    bar.style.zIndex = '2147483647';
                    bar.style.display = 'flex';
                    bar.style.alignItems = 'center';
                    bar.style.padding = '0 12px';
                    bar.style.boxSizing = 'border-box';
                    bar.style.fontFamily = 'Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, sans-serif';
                    
                    const nav = document.createElement('div');
                    nav.style.display = 'flex';
                    nav.style.gap = '15px';
                    nav.style.marginRight = '15px';
                    nav.style.color = '#5D5D5D';
                    nav.style.fontSize = '18px';
                    nav.innerHTML = '&#8592; &nbsp;&#8594; &nbsp;&#10227;'; 
                    
                    const urlContainer = document.createElement('div');
                    urlContainer.style.flex = '1';
                    urlContainer.style.backgroundColor = '#FFFFFF';
                    urlContainer.style.borderRadius = '24px';
                    urlContainer.style.height = '32px';
                    urlContainer.style.display = 'flex';
                    urlContainer.style.alignItems = 'center';
                    urlContainer.style.padding = '0 12px';
                    urlContainer.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                    urlContainer.style.border = '1px solid #E5E5E5';
                    
                    urlContainer.innerHTML = '<span style="font-size:12px; margin-right:8px; color:#5D5D5D;">&#128274;</span>' + 
                                             '<span style="color:#1A1A1A; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{url}</span>';
                    
                    bar.appendChild(nav);
                    bar.appendChild(urlContainer);
                    
                    document.body.appendChild(bar);
                }}
            """)
            await page.wait_for_timeout(500)
            
            # Capture viewport screenshot instead of full-page
            await page.screenshot(path=screenshot_path)
            final_image_path = screenshot_path
            print(f"[SUCCESS] Took viewport screenshot with address bar for {url}")
        else:
            final_image_path = ""
            print(f"[SKIP] No matches found for {url}, skipping screenshot.")
        
        # Save to DB
        await asyncio.to_thread(
            save_screenshot_result,
            website=url,
            image_path=final_image_path,
            status="success",
            ads_found=len(ad_slots) if ad_slots else 0,
            matches_found=matches_count
        )
        
        return {"url": url, "status": "success", "matches": matches_count}

    except Exception as e:
        print(f"[SCAN FAILED] {url}: {e}")
        await asyncio.to_thread(save_screenshot_result, website=url, image_path="", status="failed")
        return {"url": url, "status": "failed"}
    finally:
        await page.close()

async def open_website(urls=None):
    """Orchestrator for batch processing."""
    if not urls:
        urls = [
            "https://sports.ndtv.com/", 
            "https://thesportstak.com/",
            "https://www.espncricinfo.com/",
            "https://www.cricbuzz.com/",
            "https://www.mykhel.com/"
        ]

    pw = None
    browser = None
    context = None
    results = []

    try:
        pw = await async_playwright().start()
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,  # Added for High-DPI/Retina quality screenshots
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        )

        creatives = get_local_creatives()

        for url in urls:
            if not creatives:
                print("[INFO] All creatives successfully placed. Stopping batch early.")
                break
                
            res = await process_single_url(context, url, creatives)
            results.append(res)

        return {"done": True, "results": results}

    except Exception as e:
        traceback.print_exc()
        return {"done": False, "error": str(e)}

    finally:
        if context: await context.close()
        if browser: await browser.close()
        if pw: await pw.stop()