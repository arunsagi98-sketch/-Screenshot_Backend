import os
from services.db_service import get_all_results

# Check where screenshots should be stored
screenshots_dir = "screenshots"
print(f"Checking screenshots directory: {os.path.abspath(screenshots_dir)}")
print(f"Directory exists: {os.path.exists(screenshots_dir)}")

if os.path.exists(screenshots_dir):
    files = os.listdir(screenshots_dir)
    print(f"Number of files in screenshots dir: {len(files)}")
    if files:
        print(f"First 5 files: {files[:5]}")

# Check database results
print("\n=== Database Check ===")
results = get_all_results()
print(f"Total results in DB: {len(results)}")

# Check first 10 results for path validity
print("\nChecking first 10 results:")
for i, r in enumerate(results[:10]):
    url = r['url']
    db_path = r['screenshot_path']
    status = r['status']
    
    # Determine actual file path
    if db_path and not os.path.isabs(db_path):
        actual_path = os.path.join(os.getcwd(), db_path)
    else:
        actual_path = db_path
    
    file_exists = os.path.exists(actual_path) if actual_path else False
    
    print(f"{i+1}. {url}")
    print(f"   Status: {status}")
    print(f"   DB path: {db_path}")
    print(f"   Actual path: {actual_path}")
    print(f"   File exists: {file_exists}")
    if not file_exists and db_path:
        print(f"   *** MISSING FILE ***")
    print()