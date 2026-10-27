// สร้างไฟล์ Word (.docx) จากย่อหน้า (layout.js) ด้วย JSZip — ฟอนต์ TH SarabunPSK 16 pt, A4
import { PAGE } from './layout.js';

const FONT = 'TH SarabunPSK';
const tw = (cm) => Math.round(cm * 567);           // ซม. → twip
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const JC = { left: 'left', center: 'center', justify: 'thaiDistribute' };

function run(r) {
  if (r.tab) return '<w:r><w:tab/></w:r>';
  if (!r.t) return '';
  const sz = (r.sz || 16) * 2;
  const b = r.b ? '<w:b/><w:bCs/>' : '';
  return `<w:r><w:rPr>${b}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(r.t)}</w:t></w:r>`;
}

function para(p) {
  const { left = 0, hanging = 0, firstLine = 0 } = p.ind;
  const ind = `<w:ind w:left="${tw(left)}"${hanging ? ` w:hanging="${tw(hanging)}"` : ''}${firstLine ? ` w:firstLine="${tw(firstLine)}"` : ''}/>`;
  const tabs = p.tabs.length ? `<w:tabs>${p.tabs.map((t) => `<w:tab w:val="left" w:pos="${tw(t)}"/>`).join('')}</w:tabs>` : '';
  const pPr = `<w:pPr>${tabs}<w:spacing w:before="${Math.round((p.before || 0) * 20)}" w:after="0"/>${ind}<w:jc w:val="${JC[p.align] || 'left'}"/></w:pPr>`;
  return `<w:p>${pPr}${p.runs.map(run).join('')}</w:p>`;
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export async function buildDocx(paras) {
  if (!window.JSZip) throw new Error('โหลดตัวสร้างไฟล์ Word ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต');
  const zip = new window.JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/><w:sz w:val="32"/><w:szCs w:val="32"/><w:lang w:val="th-TH" w:eastAsia="en-US" w:bidi="th-TH"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`);
  const sect = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${tw(PAGE.top)}" w:right="${tw(PAGE.right)}" w:bottom="${tw(PAGE.bottom)}" w:left="${tw(PAGE.left)}" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>`;
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${paras.map(para).join('')}${sect}</w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
