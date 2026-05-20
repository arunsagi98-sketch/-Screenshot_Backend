Place optional template images here (or rely on your .pptx under PPT_Format/).

The UI calls GET /ppt-export-assets — it returns:
  • cover + logo extracted from the template .pptx (when found)
  • theme hex (accent, gradients) from the deck’s clrScheme
  • any files you add below (override / supplement)

Optional filenames:
  cover_bg.jpg
  gradient_bg.jpg
  billiontags_logo.png
  text_fill.png

Also available: GET /get-image-base64?path=<filename> from screenshots/, ppt_assets/, or extracted_ppt_media/.
