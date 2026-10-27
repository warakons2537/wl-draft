// วาดย่อหน้า (จาก layout.js) เป็น HTML หน้า A4 — ใช้ทั้งหน้าตัวอย่างและพิมพ์/PDF
import { PAGE } from './layout.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const run = (r) => {
  if (!r.t) return '';
  const st = [r.b ? 'font-weight:700' : '', r.sz ? `font-size:${r.sz}pt` : ''].filter(Boolean).join(';');
  return st ? `<span style="${st}">${esc(r.t)}</span>` : esc(r.t);
};

function para(p) {
  const { left = 0, hanging = 0, firstLine = 0 } = p.ind;
  const st = [`text-align:${p.align}`, `margin-left:${left}cm`, `text-indent:${firstLine - hanging}cm`, p.before ? `margin-top:${p.before}pt` : ''];
  let html;
  if (p.runs.some((r) => r.tab) && p.tabs.length) {
    const segs = [[]]; for (const r of p.runs) { if (r.tab) segs.push([]); else segs[segs.length - 1].push(r); }
    let cur = left - hanging + firstLine;                         // จุดเริ่มบรรทัดแรก (ซม. จากขอบซ้ายของเนื้อที่)
    html = segs.map((sg, i) => {
      const inner = sg.map(run).join('');
      if (i === segs.length - 1) return inner;
      const w = Math.max(0, (p.tabs[i] ?? cur) - cur); cur = p.tabs[i] ?? cur;
      return `<span class="tabbox" style="min-width:${w}cm">${inner}</span>`;
    }).join('');
  } else html = p.runs.map(run).join('');
  return `<p style="${st.filter(Boolean).join(';')}">${html || '&nbsp;'}</p>`;
}

export function renderSheet(paras) {
  return `<div class="sheet" style="padding:${PAGE.top}cm ${PAGE.right}cm ${PAGE.bottom}cm ${PAGE.left}cm">${paras.map(para).join('')}</div>`;
}
