import zipfile, re
xml = zipfile.ZipFile('PDF_format/PDF_format.zip').read('ppt/slideLayouts/slideLayout1.xml').decode('utf-8')
shapes = re.findall(r'<p:spPr>.*?<a:off x="(\d+)" y="(\d+)"/>.*?<a:ext cx="(\d+)" cy="(\d+)"/>.*?</p:spPr>', xml)
print("Slide Layout 1 Shapes:", shapes)

# also check slide layout 2 for mobile
xml2 = zipfile.ZipFile('PDF_format/PDF_format.zip').read('ppt/slideLayouts/slideLayout2.xml').decode('utf-8')
shapes2 = re.findall(r'<p:spPr>.*?<a:off x="(\d+)" y="(\d+)"/>.*?<a:ext cx="(\d+)" cy="(\d+)"/>.*?</p:spPr>', xml2)
print("Slide Layout 2 Shapes:", shapes2)
