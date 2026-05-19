import zipfile
import re

def find_text_colors(filepath):
    with zipfile.ZipFile(filepath, 'r') as z:
        if 'ppt/slides/slide1.xml' in z.namelist():
            xml = z.read('ppt/slides/slide1.xml').decode('utf-8')
            # Extract paragraphs and runs to see if there's explicit text coloring
            # Look for <a:t>...</a:t> and surrounding color
            import xml.etree.ElementTree as ET
            root = ET.fromstring(xml)
            for elem in root.iter():
                if '}rPr' in elem.tag:
                    for child in elem:
                        if '}solidFill' in child.tag:
                            for c in child:
                                print("Text Color found:", c.tag, c.attrib)
        print("Checking Slide Master 1 for text color:")
        if 'ppt/slideMasters/slideMaster1.xml' in z.namelist():
            xml = z.read('ppt/slideMasters/slideMaster1.xml').decode('utf-8')
            root = ET.fromstring(xml)
            for elem in root.iter():
                if '}rPr' in elem.tag:
                    for child in elem:
                        if '}solidFill' in child.tag:
                            for c in child:
                                print("Master Text Color:", c.tag, c.attrib)

if __name__ == "__main__":
    find_text_colors("PDF_format/PDF_format.zip")
