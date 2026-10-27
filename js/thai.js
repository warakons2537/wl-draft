// ตัวช่วยภาษาไทย: เลขไทย วันที่ไทย จำนวนเงินเป็นตัวอักษร
const TD = '๐๑๒๓๔๕๖๗๘๙';
export const toThaiDigits = (s) => String(s ?? '').replace(/[0-9]/g, (d) => TD[d]);
export const toArabicDigits = (s) => String(s ?? '').replace(/[๐-๙]/g, (d) => TD.indexOf(d));

export const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

const parse = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return y && m && d ? { y, m, d } : null; };

// "27 ตุลาคม 2569"
export function thaiDate(iso) { const p = parse(iso); return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y + 543}` : ''; }
// "วันอังคารที่ 27 ตุลาคม 2569"
export function thaiDateLong(iso) {
  const p = parse(iso); if (!p) return '';
  return `วัน${DAYS[new Date(p.y, p.m - 1, p.d).getDay()]}ที่ ${p.d} ${MONTHS[p.m - 1]} ${p.y + 543}`;
}
// ช่วงวันที่: วันเดียว หรือ "ระหว่างวันที่ 1 – 3 ธันวาคม 2569"
export function thaiDateRange(a, b) {
  if (!a) return '';
  if (!b || b === a) return thaiDateLong(a);
  const p = parse(a), q = parse(b);
  if (p.y === q.y && p.m === q.m) return `ระหว่างวันที่ ${p.d} – ${q.d} ${MONTHS[p.m - 1]} ${p.y + 543}`;
  return `ระหว่างวันที่ ${thaiDate(a)} – ${thaiDate(b)}`;
}
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// จำนวนเงินเป็นตัวอักษร เช่น 1250.50 → "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์"
const N = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const P = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
function readInt(s) {
  s = s.replace(/^0+/, ''); if (!s) return '';
  if (s.length > 6) return readInt(s.slice(0, -6)) + 'ล้าน' + readInt(s.slice(-6));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const d = +s[i], pos = s.length - i - 1; if (!d) continue;
    if (pos === 1 && d === 1) out += 'สิบ';
    else if (pos === 1 && d === 2) out += 'ยี่สิบ';
    else if (pos === 0 && d === 1 && s.length > 1) out += 'เอ็ด';
    else out += N[d] + P[pos];
  }
  return out;
}
export function bahtText(v) {
  const n = Number(String(toArabicDigits(v)).replace(/,/g, ''));
  if (!isFinite(n) || n < 0) return '';
  const [b, s] = n.toFixed(2).split('.');
  const baht = readInt(b), sat = readInt(s);
  if (!baht && !sat) return 'ศูนย์บาทถ้วน';
  return (baht ? baht + 'บาท' : '') + (sat ? sat + 'สตางค์' : 'ถ้วน');
}
export const money = (v) => {
  const n = Number(String(toArabicDigits(v)).replace(/,/g, ''));
  return isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) : String(v);
};
