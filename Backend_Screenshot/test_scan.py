import asyncio
from services.browser import open_website

async def main():
    print("Starting single URL scan test...")
    results = await open_website(urls=["https://www.espncricinfo.com/"])
    print("Results:", results)

if __name__ == "__main__":
    # Windows fix
    import sys
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(main())
