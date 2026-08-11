import zipfile
import sys
import re

z = zipfile.ZipFile(sys.argv[1])
xml = z.read('word/document.xml').decode('utf-8')

tables = re.findall(r'<w:tbl[^>]*>.*?</w:tbl>', xml, re.DOTALL)

for i in [8, 9, 10]:
    if i < len(tables):
        print(f'=== TABLE {i} ===')
        rows = re.findall(r'<w:tr[^>]*>.*?</w:tr>', tables[i], re.DOTALL)
        for r_idx, r in enumerate(rows):
            print(f'-- Row {r_idx} --')
            cells = re.findall(r'<w:tc[^>]*>.*?</w:tc>', r, re.DOTALL)
            for c_idx, tc in enumerate(cells):
                tc_text = re.sub(r'<[^>]+>', '', tc).strip()
                has_vmerge = 'vMerge' in tc
                print(f'  Cell {c_idx}: vMerge={has_vmerge}, text="{tc_text}"')
        print()
