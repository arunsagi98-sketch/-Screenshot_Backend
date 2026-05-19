from PIL import Image
import os

media_path = "PDF_format/extracted/ppt/media"
for img_name in sorted(os.listdir(media_path)):
    try:
        with Image.open(os.path.join(media_path, img_name)) as img:
            print(f"{img_name}: {img.size} {img.format} {os.path.getsize(os.path.join(media_path, img_name))} bytes")
    except:
        pass
