// แปลงเอกสาร → รายการย่อหน้า (ใช้ร่วมกันทั้งหน้าตัวอย่าง/พิมพ์ และไฟล์ Word เพื่อให้ตรงกัน)
// ย่อหน้า: { runs:[{t,b,sz}|{tab:true}], align, ind:{left,hanging,firstLine} (ซม.), before (pt), tabs:[ซม.] }
// ระยะขอบตามแบบหนังสือราชการ: บน 1.5 ซม. ซ้าย 3 ซม. ขวา 2 ซม. ล่าง 2 ซม. · ฟอนต์ TH SarabunPSK 16 pt
import { toThaiDigits, thaiDate } from './thai.js';

export const PAGE = { top: 1.5, left: 3, right: 2, bottom: 2 };
const SIGN_IND = 6;    // ตำแหน่งกลุ่มลงนาม (ซม. จากขอบซ้ายของเนื้อที่)

const P = (runs, o = {}) => ({ runs, align: 'left', ind: {}, before: 0, tabs: [], ...o });
const R = (t, o = {}) => ({ t: String(t ?? ''), ...o });
const TAB = { tab: true };
const lines = (s) => String(s ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
const body = (s, first = 0) => lines(s).map((l, i) => P([R(l)], { align: 'justify', ind: { firstLine: 2.5 }, before: i === 0 ? first : 0 }));

export function findDirector(people) {
  return people.find((p) => p.duty === 'ผู้อำนวยการ') || people.find((p) => /ผู้อำนวยการ/.test(p.rank || '')) || null;
}

function signature(person, before) {
  const out = [P([R(`(${person?.full_name || '                              '})`)], { align: 'center', ind: { left: SIGN_IND }, before })];
  for (const l of lines(person?.sign_title)) out.push(P([R(l)], { align: 'center', ind: { left: SIGN_IND } }));
  return out;
}

function memo(d, s, people) {
  const signer = people.find((p) => String(p.id) === String(d.signer_id));
  const H = (t) => R(t, { b: true, sz: 20 });
  const out = [
    P([R('บันทึกข้อความ', { b: true, sz: 29 })], { align: 'center', garuda: 'memo' }),
    P([H('ส่วนราชการ'), R(`  ${d.dept ?? s.memo_dept}`)], { before: 6 }),
    P([H('ที่'), R(`  ${d.doc_no || ''}`), TAB, H('วันที่'), R(`  ${thaiDate(d.doc_date)}`)], { tabs: [8] }),
    P([H('เรื่อง'), TAB, R(d.subject)], { ind: { left: 1.4, hanging: 1.4 }, tabs: [1.4] }),
    P([R('เรียน'), R(`  ${d.to ?? s.director_to}`)], { before: 6 }),
    ...body(d.body, 6),
    ...body(d.closing),
    ...signature(signer, 36),
  ];
  if (d.director_box) {
    const dir = findDirector(people);
    out.push(P([R('ความเห็น/คำสั่งของผู้อำนวยการ', { b: true })], { before: 18 }));
    out.push(P([R('........................................................................................................................................')], { before: 6 }));
    out.push(P([R('........................................................................................................................................')]));
    out.push(...signature(dir, 30));
  }
  return out;
}

function external(d, s, people) {
  const signer = people.find((p) => String(p.id) === String(d.signer_id));
  const addr = lines(d.address ?? s.ext_address);
  const L = (label, value, w = 1.5) => P([R(label), TAB, R(value)], { ind: { left: w, hanging: w }, tabs: [w] });
  const out = [
    P([R(`ที่ ${d.doc_no || ''}`), TAB, R(addr[0] || '')], { tabs: [9.5], garuda: 'external' }),
    ...addr.slice(1).map((a) => P([R(a)], { ind: { left: 9.5 } })),
    P([R(thaiDate(d.doc_date))], { ind: { left: 7.5 }, before: 6 }),
    { ...L('เรื่อง', d.subject), before: 6 },
    { ...L('เรียน', d.to), before: 6 },
  ];
  if (lines(d.ref).length) out.push({ ...L('อ้างถึง', lines(d.ref).join(' ')), before: 6 });
  const encl = lines(d.encl);
  if (encl.length === 1) out.push({ ...L('สิ่งที่ส่งมาด้วย', encl[0], 2.75), before: 6 });
  else if (encl.length > 1) encl.forEach((e, i) => out.push({ ...L(i ? '' : 'สิ่งที่ส่งมาด้วย', `${i + 1}. ${e}`, 2.75), before: i ? 0 : 6 }));
  out.push(...body(d.body, 6), ...body(d.closing));
  out.push(P([R('ขอแสดงความนับถือ')], { align: 'center', ind: { left: SIGN_IND }, before: 12 }));
  out.push(...signature(signer, 42));
  const foot = [...lines(d.group), ...lines(d.footer ?? s.footer)];
  foot.forEach((f, i) => out.push(P([R(f)], { before: i ? 0 : 30 })));
  return out;
}

export function buildLayout(doc, settings, people) {
  const paras = doc.type === 'external' ? external(doc, settings, people) : memo(doc, settings, people);
  if (doc.thaiDigits !== false) for (const p of paras) for (const r of p.runs) if (r.t) r.t = toThaiDigits(r.t);
  return paras;
}
