from database.db import SessionLocal
from models.screenshot import ScreenshotResult

def save_screenshot_result(
    website: str, 
    image_path: str, 
    status: str, 
    ads_found: int = 0, 
    matches_found: int = 0,
    matched_creative_name: str = None,
    matched_creative_size: str = None,
    device: str = "Desktop"
):
    """Saves the result of a screenshot process to the database."""
    db = SessionLocal()
    try:
        new_result = ScreenshotResult(
            url=website,
            screenshot_path=image_path,
            status=status,
            ads_found=ads_found,
            matches_found=matches_found,
            matched_creative_name=matched_creative_name,
            matched_creative_size=matched_creative_size,
            device=device
        )
        db.add(new_result)
        db.commit()
        db.refresh(new_result)
        return new_result
    except Exception as e:
        db.rollback()
        print(f"[DB ERROR] {e}")
        raise e
    finally:
        db.close()

def get_all_results():
    """Fetches all history from the database, ordered by latest first."""
    db = SessionLocal()
    try:
        # Order by id descending to guarantee the absolute newest insertions are always at the top
        results = db.query(ScreenshotResult).order_by(ScreenshotResult.id.desc()).all()
        # Convert SQLAlchemy objects to dictionaries for JSON response
        return [
            {
                "id": r.id,
                "url": r.url,
                "screenshot_path": r.screenshot_path,
                "status": r.status,
                "ads_found": r.ads_found,
                "matches_found": r.matches_found,
                "matched_creative_name": r.matched_creative_name,
                "matched_creative_size": r.matched_creative_size,
                "device": r.device,
                "created_at": r.created_at.isoformat()
            }
            for r in results
        ]
    finally:
        db.close()

def delete_screenshot_result(result_id: int):
    """Deletes a result from the database by ID."""
    db = SessionLocal()
    try:
        result = db.query(ScreenshotResult).filter(ScreenshotResult.id == result_id).first()
        if result:
            db.delete(result)
            db.commit()
            return True
        return False
    except Exception as e:
        db.rollback()
        print(f"[DB ERROR] Deletion failed: {e}")
        return False
    finally:
        db.close()
