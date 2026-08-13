import PizZip from 'pizzip';
import { readFileSync } from 'fs';
import { DOMParser } from '@xmldom/xmldom';

const filepath = process.argv[2] || 'assets/X800_inspection report_100-94-260730_ Bell_840.docx';
const buf = readFileSync(filepath);
const zip = new PizZip(buf);
const docXml = zip.file('word/document.xml')?.asText() || '';
const dom = new DOMParser().parseFromString(docXml, 'application/xml');
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const tables = dom.getElementsByTagNameNS(WORD_NS, 'tbl');

// Full TABLE 3 (AQL/Defects)
console.log('=== TABLE 3 (AQL/Defects) - FULL ===');
const tbl3 = tables.item(3);
const rows3 = tbl3.getElementsByTagNameNS(WORD_NS, 'tr');
for (let r = 0; r < rows3.length; r++) {
  const row = rows3.item(r);
  const cells = row.getElementsByTagNameNS(WORD_NS, 'tc');
  const cellTexts = [];
  for (let c = 0; c < cells.length; c++) {
    cellTexts.push(cells.item(c).textContent?.trim().substring(0, 80) || '');
  }
  console.log(`  Row ${r}: [${cellTexts.map(t => `"${t}"`).join(', ')}]`);
}

// Full TABLE 13 (Steps)
console.log('\n=== TABLE 13 (Inspection Steps) - FULL ===');
const tbl13 = tables.item(13);
const rows13 = tbl13.getElementsByTagNameNS(WORD_NS, 'tr');
for (let r = 0; r < rows13.length; r++) {
  const row = rows13.item(r);
  const cells = row.getElementsByTagNameNS(WORD_NS, 'tc');
  const cellTexts = [];
  for (let c = 0; c < cells.length; c++) {
    cellTexts.push(cells.item(c).textContent?.trim().substring(0, 100) || '');
  }
  console.log(`  Row ${r}: [${cellTexts.map(t => `"${t}"`).join(', ')}]`);
}

// TABLE 10 (Barcode)
console.log('\n=== TABLE 10 (Barcode Check) ===');
const tbl10 = tables.item(10);
const rows10 = tbl10.getElementsByTagNameNS(WORD_NS, 'tr');
for (let r = 0; r < rows10.length; r++) {
  const row = rows10.item(r);
  const cells = row.getElementsByTagNameNS(WORD_NS, 'tc');
  const cellTexts = [];
  for (let c = 0; c < cells.length; c++) {
    cellTexts.push(cells.item(c).textContent?.trim().substring(0, 80) || '');
  }
  console.log(`  Row ${r}: [${cellTexts.map(t => `"${t}"`).join(', ')}]`);
}

// Image targets - check rels to find image paths
const relsXml = zip.file('word/_rels/document.xml.rels')?.asText() || '';
const relsDom = new DOMParser().parseFromString(relsXml, 'application/xml');
const rels = relsDom.getElementsByTagName('Relationship');
const imageRels = [];
for (let i = 0; i < rels.length; i++) {
  const rel = rels.item(i);
  const target = rel?.getAttribute('Target') || '';
  if (target.includes('media/image')) {
    imageRels.push({ id: rel?.getAttribute('Id') || '', target });
  }
}
console.log(`\nImage relationships: ${imageRels.length}`);
imageRels.slice(0, 30).forEach(r => console.log(`  ${r.id} -> ${r.target}`));
