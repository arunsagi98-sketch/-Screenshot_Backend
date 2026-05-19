from pptx import Presentation

def inspect_layouts(filepath):
    prs = Presentation(filepath)
    print(f"Number of slide layouts: {len(prs.slide_layouts)}")
    for i, layout in enumerate(prs.slide_layouts):
        print(f"Layout {i}: {layout.name}")
        for shape in layout.placeholders:
            print(f"  - Placeholder: {shape.name} (type: {shape.placeholder_format.type})")

if __name__ == "__main__":
    inspect_layouts("PDF_format/PDF_format.pptx")
