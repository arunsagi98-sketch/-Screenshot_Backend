import asyncio
import sys
import uvicorn

if __name__ == "__main__":
    # Proactor is required on older Python for Playwright subprocesses on Windows.
    # From Python 3.14 onward, overriding the asyncio policy is deprecated; use the default.
    if sys.platform == "win32" and sys.version_info < (3, 14):
        try:
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        except Exception:
            pass
    
    # Disable reload=True on Windows to prevent loop conflicts
    uvicorn.run(
        "main:app", 
        host="127.0.0.1", 
        port=8000, 
        reload=False
    )
