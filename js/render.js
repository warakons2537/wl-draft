// วาดย่อหน้า (จาก layout.js) เป็น HTML หน้า A4 — ใช้ทั้งหน้าตัวอย่างและพิมพ์/PDF
import { PAGE } from './layout.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DOT = 'border-bottom:1px dotted #000';
const run = (r) => {
  if (!r.t) return '';
  const st = [r.b ? 'font-weight:700' : '', r.sz ? `font-size:${r.sz}pt` : '', r.u ? DOT : ''].filter(Boolean).join(';');
  return st ? `<span style="${st}">${esc(r.t)}</span>` : esc(r.t);
};

// ตราครุฑ: บันทึกข้อความ สูง 1.5 ซม. มุมซ้ายบน (ฐานตรงบรรทัดชื่อ) · แบบอื่น สูง 3 ซม. กึ่งกลาง เหนือหัวหนังสือ
const GARUDA = 'img/garuda.png';
function para(p) {
  const { left = 0, hanging = 0, firstLine = 0 } = p.ind;
  const tabOnly = p.runs.length && p.runs.every((r) => r.tab);
  const st = [`text-align:${p.align}`, `margin-left:${left}cm`, `text-indent:${firstLine - hanging}cm`, p.before ? `margin-top:${p.before}pt` : '',
    p.garuda === 'memo' ? 'position:relative' : '', tabOnly && p.runs[0].sz ? `font-size:${p.runs[0].sz}pt;line-height:1` : ''];
  let html;
  if (p.runs.some((r) => r.tab) && p.tabs.length) {
    const segs = [[]]; for (const r of p.runs) { if (r.tab) segs.push([]); else segs[segs.length - 1].push(r); }
    let cur = left - hanging + firstLine;                         // จุดเริ่มบรรทัดแรก (ซม. จากขอบซ้ายของเนื้อที่)
    html = segs.map((sg, i) => {
      const inner = sg.map(run).join('');
      if (i === segs.length - 1) return inner;
      const w = Math.max(0, (p.tabs[i] ?? cur) - cur); cur = p.tabs[i] ?? cur;
      const t = p.runs.filter((r) => r.tab)[i];                    // แท็บขีดเส้นใต้ = เส้นประยาวถึงจุดแท็บ
      if (t.u) {                                                   // ป้ายข้อความ (ไม่ขีด) + ส่วนที่ขีดเส้นประยาวถึงจุดแท็บ
        const k = sg.findIndex((r) => r.u), lead = k < 0 ? sg : sg.slice(0, k), rest = k < 0 ? [] : sg.slice(k);
        return `<span class="tabbox" style="min-width:${w}cm;display:inline-flex;align-items:baseline;white-space:pre">${lead.map(run).join('')}<span style="flex:1;${DOT}">${rest.map((r) => run({ ...r, u: false })).join('')}</span></span>`;
      }
      return `<span class="tabbox" style="min-width:${w}cm">${inner}</span>`;
    }).join('');
  } else html = p.runs.map(run).join('');
  if (p.garuda === 'memo') html = `<img src="${GARUDA}" alt="" style="position:absolute;left:0;bottom:0;height:1.5cm">${html}`;
  const out = `<p style="${st.filter(Boolean).join(';')}">${html || '&nbsp;'}</p>`;
  return p.garuda && p.garuda !== 'memo' ? `<p style="text-align:center"><img src="${GARUDA}" alt="" style="height:3cm;vertical-align:bottom"></p>${out}` : out;
}

export function renderSheet(paras) {
  return `<div class="sheet" style="padding:${PAGE.top}cm ${PAGE.right}cm ${PAGE.bottom}cm ${PAGE.left}cm">${paras.map(para).join('')}</div>`;
}
