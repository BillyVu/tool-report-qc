import zipfile
import sys
import re
import os

filepath = sys.argv[1]
print(f'File: {filepath}')
print(f'Size: {os.path.getsize(filepath)} bytes')

z = zipfile.ZipFile(filepath)
print(f'\nFiles in ZIP: {len(z.namelist())}')

# List all files
for name in sorted(z.namelist()):
    info = z.getinfo(name)
    print(f'  {name} ({info.file_size} bytes)')

# Read document.xml
xml = z.read('word/document.xml').decode('utf-8')

# Find all tables
tables = re.findall(r'<w:tbl[^>]*>.*?</w:tbl>', xml, re.DOTALL)
print(f'\nTotal tables: {len(tables)}')

for i, tbl in enumerate(tables):
    rows = re.findall(r'<w:tr[^>]*>.*?</w:tr>', tbl, re.DOTALL)
    print(f'\n=== TABLE {i} ({len(rows)} rows) ===')
    for r_idx, r in enumerate(rows[:8]):
        cells = [re.sub(r'<[^>]+>', '', tc).strip() for tc in re.findall(r'<w:tc[^>]*>.*?</w:tc>', r, re.DOTALL)]
        print(f'  Row {r_idx}: {cells}')
    if len(rows) > 8:
        print(f'  ... ({len(rows) - 8} more rows)')

# Check for images
image_files = [n for n in z.namelist() if n.startswith('word/media/')]
print(f'\nImages: {len(image_files)}')
for img in image_files[:20]:
    info = z.getinfo(img)
    print(f'  {img} ({info.file_size} bytes)')

# Check headers
for hdr in ['word/header1.xml', 'word/header2.xml', 'word/footer1.xml']:
    if hdr in z.namelist():
        hxml = z.read(hdr).decode('utf-8')
        htext = re.sub(r'<[^>]+>', ' ', hxml).strip()
        print(f'\n{hdr}: {htext[:200]}')
