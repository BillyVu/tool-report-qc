import zipfile
import sys
import re

z = zipfile.ZipFile(sys.argv[1])
xml = z.read('word/document.xml').decode('utf-8')

tables = re.findall(r'<w:tbl[^>]*>.*?</w:tbl>', xml, re.DOTALL)
print(f'Total tables found: {len(tables)}')

for i, tbl in enumerate(tables):
    print(f'=== TABLE {i} ===')
    rows = re.findall(r'<w:tr[^>]*>.*?</w:tr>', tbl, re.DOTALL)
    for r_idx, r in enumerate(rows[:5]):
        cells = [re.sub(r'<[^>]+>', '', tc).strip() for tc in re.findall(r'<w:tc[^>]*>.*?</w:tc>', r, re.DOTALL)]
        print(f'  Row {r_idx}: {cells}')
    print()
