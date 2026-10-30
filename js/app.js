// WL Draft — ระบบร่างหนังสือราชการ โรงเรียนบ้านวังลึก(ยุวนาฏชนูทิศ)  เฟส 1: บันทึกข้อความ, หนังสือภายนอก
import { supabaseClient, remoteDb, localDb, signIn } from './db.js';
import { TEMPLATES, applyTemplate, AUTHORITY_DEFAULT } from './templates.js';
import { buildLayout, findDirector } from './layout.js';
import { renderSheet } from './render.js';
import { buildDocx } from './docx.js';
import { todayIso, thaiDate } from './thai.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const TYPE_NAME = { memo: 'บันทึกข้อความ', external: 'หนังสือภายนอก', order: 'คำสั่ง', announce: 'ประกาศ' };
const ROLES = ['ประธานกรรมการ', 'รองประธานกรรมการ', 'กรรมการ', 'กรรมการและเลขานุการ', 'กรรมการและผู้ช่วยเลขานุการ', 'ที่ปรึกษา'];
const GROUPS = ['ฝ่ายบริหารวิชาการ', 'ฝ่ายบริหารงบประมาณ', 'ฝ่ายบริหารงานบุคคล', 'ฝ่ายบริหารทั่วไป'];

const S = { db: null, client: null, me: null, isAdmin: false, setupNeeded: false, settings: {}, people: [], tab: 'draft', doc: null };

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { console.error(e); toast(e.message || String(e)); } };

// ------------------------------------------------------------------ เริ่มระบบ
async function boot() {
  S.client = supabaseClient();
  if (!S.client) return startLocal('โหลดไลบรารีฐานข้อมูลไม่สำเร็จ ใช้งานแบบเก็บในเครื่องนี้');
  const { data } = await S.client.auth.getSession();
  if (!data.session) return showLogin();
  const uid = data.session.user.id;
  const { data: prof } = await S.client.from('profiles').select('id,full_name,role').eq('id', uid).limit(1);
  S.me = prof?.[0] || { id: uid, full_name: data.session.user.email, role: 'pending' };
  if (S.me.role === 'pending') {
    app.innerHTML = `<div class="card login"><h2>รออนุมัติ</h2><p>บัญชีนี้ยังรอแอดมินอนุมัติในระบบ WL Admin เมื่ออนุมัติแล้วให้เปิดหน้านี้ใหม่</p><button class="btn" id="out">ออกจากระบบ</button></div>`;
    $('#out').onclick = logout; return;
  }
  S.isAdmin = S.me.role === 'admin';
  S.db = remoteDb(S.client);
  if (!(await S.db.ready())) { S.setupNeeded = true; S.db = localDb(); S.isAdmin = true; }
  await loadBase(); render();
}

function startLocal(note) {
  S.db = localDb(); S.isAdmin = true; S.me = { full_name: 'ใช้งานในเครื่องนี้', role: 'local' }; S.localNote = note || '';
  loadBase().then(render);
}

function showLogin() {
  app.innerHTML = `
  <form class="card login" id="lf">
    <img class="logo big" src="img/logo-192.png" alt="WL Draft">
    <h2>WL Draft</h2>
    <p class="muted">เข้าสู่ระบบด้วยบัญชีเดียวกับ WL Admin</p>
    <label class="field"><span>อีเมล</span><input name="email" type="email" required autocomplete="username"></label>
    <label class="field"><span>รหัสผ่าน</span><input name="password" type="password" required autocomplete="current-password"></label>
    <div class="actions"><button class="btn primary">เข้าสู่ระบบ</button><button type="button" class="btn" id="loc">ทดลองใช้ในเครื่องนี้</button></div>
  </form>`;
  $('#lf').onsubmit = guard(async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    await signIn(S.client, f.get('email'), f.get('password')); boot();
  });
  $('#loc').onclick = () => startLocal('โหมดทดลอง: ข้อมูลเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น');
}
async function logout() { if (S.client) await S.client.auth.signOut(); location.reload(); }

async function loadBase() {
  const [st, people] = await Promise.all([S.db.list('wd_settings', 'id'), S.db.list('wd_people')]);
  S.settings = st[0] || {}; S.people = people;
  if (!S.doc) S.doc = newDoc('memo');
}

// ------------------------------------------------------------------ เอกสาร
function newDoc(type) {
  const meP = S.people.find((p) => p.full_name === S.me?.full_name);
  const dir = findDirector(S.people);
  return {
    id: null, type, template: TEMPLATES[type][0].id, values: {},
    doc_no: type === 'external' ? `${S.settings.doc_code || ''}/` : '',
    doc_date: todayIso(), subject: '',
    to: type === 'memo' ? (S.settings.director_to || '') : '',
    ref: '', encl: '', body: '', closing: ({ memo: 'จึงเรียนมาเพื่อโปรดทราบและพิจารณา', order: 'ให้ผู้ที่ได้รับการแต่งตั้ง ปฏิบัติหน้าที่อย่างเต็มความสามารถ ความรับผิดชอบและเอาใจใส่', announce: 'จึงประกาศให้ทราบโดยทั่วกัน' })[type] || 'จึงเรียนมาเพื่อโปรดทราบ',
    authority: type === 'order' ? AUTHORITY_DEFAULT : '', appoint: '', groups: type === 'order' ? [{ title: '', members: [], duties: '' }] : [],
    signer_id: type === 'memo' ? (meP?.id || '') : (dir?.id || ''),
    director_box: false, group: '', thaiDigits: true,
  };
}
const layoutOf = (d) => buildLayout(d, S.settings, S.people);

// ------------------------------------------------------------------ หน้าหลัก
function render() {
  const banner = S.setupNeeded
    ? 'ยังไม่ได้สร้างตารางของ WL Draft ในฐานข้อมูล (รันไฟล์ supabase/wl-draft.sql ครั้งเดียว) ระหว่างนี้ข้อมูลเก็บในเครื่องนี้เท่านั้น'
    : (S.localNote || '');
  app.innerHTML = `
  <header class="top"><img class="logo" src="img/logo-192.png" alt=""><h1>WL Draft · ร่างหนังสือราชการ</h1><a class="home" href="../" title="ทางเข้า WL (ทุกแอป)">ทางเข้า WL</a><span class="who">${esc(S.me?.full_name || '')}</span>${S.client ? '<button id="out">ออก</button>' : ''}</header>
  <nav class="tabs">${[['draft', 'ร่างหนังสือ'], ['history', 'ประวัติ'], ['people', 'บุคลากร'], ['settings', 'ตั้งค่า']]
    .map(([k, n]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${n}</button>`).join('')}</nav>
  ${banner ? `<div class="banner">${esc(banner)}</div>` : ''}
  <main id="view"></main>`;
  $('#out')?.addEventListener('click', logout);
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; render(); }));
  ({ draft: viewDraft, history: viewHistory, people: viewPeople, settings: viewSettings })[S.tab]();
}

// ------------------------------------------------------------------ ร่างหนังสือ
function viewDraft() {
  const d = S.doc; const tpl = TEMPLATES[d.type].find((t) => t.id === d.template) || TEMPLATES[d.type][0];
  const peopleOpts = (sel) => `<option value="">— เลือก —</option>` + S.people.map((p) =>
    `<option value="${esc(p.id)}" ${String(p.id) === String(sel) ? 'selected' : ''}>${esc(p.full_name)}${p.duty ? ` · ${esc(p.duty)}` : ''}</option>`).join('');
  const fld = (f) => {
    const v = esc(d.values[f.k] ?? ''); const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : '';
    const input = f.type === 'textarea' ? `<textarea data-v="${f.k}"${ph}>${v}</textarea>`
      : `<input data-v="${f.k}" type="${f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}" value="${v}"${ph}>`;
    return `<label class="field"><span>${esc(f.label)}</span>${input}</label>`;
  };
  const ext = d.type === 'external', isOrder = d.type === 'order', hasTo = d.type === 'memo' || ext;
  $('#view').innerHTML = `
  <div class="draft">
    <div class="card">
      <div class="seg">${Object.entries(TYPE_NAME).map(([k, n]) => `<button data-type="${k}" class="${d.type === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <fieldset><legend>1. เลือกแบบเนื้อหาแล้วกรอกสั้นๆ</legend>
        <label class="field"><span>แบบเนื้อหา</span><select id="tpl">${TEMPLATES[d.type].map((t) => `<option value="${t.id}" ${t.id === tpl.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        ${tpl.fields.map(fld).join('')}
        ${tpl.fields.length ? '<button class="btn primary" id="fill" style="margin-bottom:10px">เติมเนื้อหาจากแบบ</button>' : ''}
      </fieldset>
      <fieldset><legend>หรือให้ AI ร่างเรื่องและเนื้อหา</legend>
        <label class="field"><span>บอกใจความสั้นๆ</span><textarea id="aibrief" placeholder="เช่น ขออนุญาตพานักเรียน 5 คนไปแข่งขันศิลปหัตถกรรมที่โรงเรียนอนุบาลศรีสำโรง วันที่ 29-30 พ.ย.">${esc(d.aiBrief || '')}</textarea></label>
        <p class="muted">ข้อความนี้ถูกส่งไปที่ Google Gemini (ระดับฟรีอาจถูกนำไปปรับปรุงผลิตภัณฑ์ของ Google) <b>ห้ามพิมพ์ชื่อนักเรียนหรือข้อมูลส่วนบุคคล</b> · AI อาจผิดพลาด ตรวจทุกครั้งก่อนใช้</p>
        <button class="btn primary" id="ai">ให้ AI ร่าง</button>
      </fieldset>
      <fieldset><legend>2. ตรวจ/แก้ก่อนออกไฟล์</legend>
        <div class="row2">
          <label class="field"><span>ที่</span><input data-d="doc_no" value="${esc(d.doc_no)}" placeholder="${ext ? '' : isOrder ? 'เช่น ๒๓/๒๕๖๙' : 'เว้นว่างได้'}"${d.type === 'announce' ? ' disabled' : ''}></label>
          <label class="field"><span>วันที่</span><input data-d="doc_date" type="date" value="${esc(d.doc_date)}"></label>
        </div>
        <label class="field"><span>เรื่อง</span><input data-d="subject" value="${esc(d.subject)}"></label>
        ${hasTo ? `<label class="field"><span>เรียน</span><input data-d="to" value="${esc(d.to)}"></label>` : ''}
        ${ext ? `<label class="field"><span>อ้างถึง (ถ้ามี)</span><input data-d="ref" value="${esc(d.ref)}"></label>
        <label class="field"><span>สิ่งที่ส่งมาด้วย (บรรทัดละรายการ ถ้ามี)</span><textarea data-d="encl">${esc(d.encl)}</textarea></label>` : ''}
        <label class="field"><span>${isOrder ? 'ย่อหน้าเปิด (เหตุผล) ขึ้นบรรทัดใหม่ = ย่อหน้าใหม่' : 'เนื้อหา (ขึ้นบรรทัดใหม่ = ย่อหน้าใหม่' + (d.type === 'announce' ? ' · ขึ้นต้นด้วย ๑. = รายการข้อ)' : ')')}</span><textarea class="body" data-d="body">${esc(d.body)}</textarea></label>
        ${isOrder ? `<label class="field"><span>อาศัยอำนาจตามความใน… (ตรวจให้ถูกต้องก่อนใช้ทุกครั้ง · ลบทิ้งได้)</span><textarea data-d="authority">${esc(d.authority)}</textarea></label>
        <label class="field"><span>ประโยคแต่งตั้ง</span><textarea data-d="appoint" placeholder="เช่น จึงแต่งตั้งคณะกรรมการ… ดังนี้">${esc(d.appoint)}</textarea></label>
        <div id="grp"></div>` : ''}
        <label class="field"><span>${isOrder ? 'ข้อความท้ายคำสั่ง' : 'คำลงท้าย'}</span>${isOrder || d.type === 'announce' ? `<textarea data-d="closing">${esc(d.closing)}</textarea>` : `<input data-d="closing" value="${esc(d.closing)}">`}</label>
        <label class="field"><span>ผู้ลงนาม</span><select data-d="signer_id">${peopleOpts(d.signer_id)}</select></label>
        ${ext ? `<label class="field"><span>ส่วนราชการเจ้าของเรื่อง (ท้ายหนังสือ)</span><input data-d="group" list="groups" value="${esc(d.group)}" placeholder="เช่น ฝ่ายบริหารงานบุคคล"><datalist id="groups">${GROUPS.map((g) => `<option value="${g}">`).join('')}</datalist></label>`
    : d.type === 'memo' ? `<label class="check"><input type="checkbox" data-d="director_box" ${d.director_box ? 'checked' : ''}> เพิ่มช่องความเห็น/คำสั่งของผู้อำนวยการ</label>` : ''}
        <label class="check"><input type="checkbox" data-d="thaiDigits" ${d.thaiDigits !== false ? 'checked' : ''}> ใช้เลขไทยทั้งฉบับ</label>
      </fieldset>
      <div class="actions">
        <button class="btn primary" id="save">บันทึก</button>
        <button class="btn" id="word">ดาวน์โหลด Word</button>
        <button class="btn" id="print">พิมพ์ / PDF</button>
        <button class="btn" id="new">ร่างใหม่</button>
      </div>
      <p class="muted">${d.id ? 'กำลังแก้ไขเอกสารที่บันทึกไว้' : 'ร่างใหม่ (ยังไม่บันทึก)'}</p>
    </div>
    <div class="preview" id="pv"><div class="scaler" id="sc"></div></div>
  </div>`;

  $$('[data-type]').forEach((b) => b.onclick = () => {
    if (b.dataset.type === d.type) return;
    if ((d.body || d.subject) && !confirm('เปลี่ยนประเภทจะเริ่มร่างใหม่ เนื้อหาที่ยังไม่บันทึกจะหายไป ต้องการเปลี่ยนไหม')) return;
    S.doc = newDoc(b.dataset.type); viewDraft();
  });
  $('#tpl').onchange = (e) => { d.template = e.target.value; viewDraft(); };
  $$('[data-v]').forEach((el) => el.oninput = () => { d.values[el.dataset.v] = el.value; });
  $$('[data-d]').forEach((el) => {
    const k = el.dataset.d;
    const set = () => { d[k] = el.type === 'checkbox' ? el.checked : el.value; preview(); };
    el.oninput = set; el.onchange = set;
  });
  $('#fill')?.addEventListener('click', () => {
    const signer = S.people.find((p) => String(p.id) === String(d.signer_id));
    const r = applyTemplate(d.type, tpl.id, d.values, { school: S.settings.school_name, signer });
    if ((d.body.trim()) && !confirm('แทนที่เรื่องและเนื้อหาเดิมด้วยเนื้อหาจากแบบไหม')) return;
    d.subject = r.subject; d.body = r.body; d.closing = r.closing;
    if (d.type === 'order') d.appoint = r.appoint || '';
    if (r.to !== undefined && r.to) d.to = r.to;
    if (r.ref) d.ref = r.ref;
    if (r.encl) d.encl = r.encl;
    viewDraft();
  });
  $('#aibrief').oninput = (e) => { d.aiBrief = e.target.value; };
  $('#ai').onclick = guard(async () => {
    const brief = $('#aibrief').value.trim(); if (brief.length < 5) throw new Error('กรุณาพิมพ์ใจความอย่างน้อย 1 ประโยค');
    if (d.body.trim() && !confirm('แทนที่เรื่องและเนื้อหาเดิมด้วยที่ AI ร่างไหม')) return;
    const btn = $('#ai'); btn.disabled = true; btn.textContent = 'AI กำลังร่าง…';
    try {
      const r = await S.db.ai({ type: d.type, brief, school: S.settings.school_name });
      if (r.subject) d.subject = r.subject; d.body = r.body || d.body;
      toast('AI ร่างให้แล้ว ตรวจและแก้ก่อนใช้'); viewDraft();
    } finally { btn.disabled = false; btn.textContent = 'ให้ AI ร่าง'; }
  });
  $('#save').onclick = guard(saveDoc);
  $('#word').onclick = guard(downloadWord);
  $('#print').onclick = printDoc;
  $('#new').onclick = () => { if ((d.body || d.subject) && !d.id && !confirm('เริ่มร่างใหม่ เนื้อหาที่ยังไม่บันทึกจะหายไป')) return; S.doc = newDoc(d.type); viewDraft(); };
  if (isOrder) { renderGroups(); }
  preview();
}

// ------------------------------------------------------------------ คำสั่ง: คณะกรรมการและรายชื่อ
function renderGroups() {
  const d = S.doc, box = $('#grp'); if (!box) return;
  const opts = `<option value="">+ เพิ่มจากรายชื่อบุคลากร…</option>` + S.people.map((p) => `<option value="${esc(p.id)}">${esc(p.full_name)}${p.duty ? ` · ${esc(p.duty)}` : ''}</option>`).join('');
  box.innerHTML = `<datalist id="roles">${ROLES.map((r) => `<option value="${r}">`).join('')}</datalist>` +
    d.groups.map((g, gi) => `
    <div class="grp" data-gi="${gi}">
      <div class="gh"><span>${gi + 1}.</span><input data-g="title" value="${esc(g.title)}" placeholder="ชื่อคณะกรรมการ เช่น คณะกรรมการอำนวยการ">
        <button class="btn small" data-op="gup" title="เลื่อนขึ้น">↑</button><button class="btn small" data-op="gdn" title="เลื่อนลง">↓</button><button class="btn small danger" data-op="gdel" title="ลบคณะนี้">✕</button></div>
      ${g.members.map((m, mi) => `
      <div class="mem" data-mi="${mi}">
        <input class="full" data-m="name" value="${esc(m.name)}" placeholder="ชื่อ-สกุล (พิมพ์เองได้)">
        <input data-m="position" value="${esc(m.position)}" placeholder="ตำแหน่ง">
        <input data-m="role" list="roles" value="${esc(m.role)}" placeholder="บทบาท">
        <div class="ops"><span class="no">${gi + 1}.${mi + 1}</span>
          <button class="btn small" data-op="mup">↑</button><button class="btn small" data-op="mdn">↓</button><button class="btn small danger" data-op="mdel">ลบ</button></div>
      </div>`).join('')}
      <div class="actions"><select data-addp>${opts}</select><button class="btn small" data-op="madd">+ พิมพ์รายชื่อเอง</button></div>
      <label class="field" style="margin-top:8px"><span>หน้าที่ (บรรทัดละข้อ ระบบใส่เลขข้อให้)</span><textarea data-g="duties">${esc(g.duties)}</textarea></label>
    </div>`).join('') + '<button class="btn" data-op="gadd">+ เพิ่มคณะกรรมการ</button>';

  const move = (arr, i, j) => { if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  box.oninput = (e) => {
    const gEl = e.target.closest('[data-gi]'); if (!gEl) return; const g = d.groups[+gEl.dataset.gi];
    if (e.target.dataset.g) g[e.target.dataset.g] = e.target.value;
    else if (e.target.dataset.m) g.members[+e.target.closest('[data-mi]').dataset.mi][e.target.dataset.m] = e.target.value;
    preview();
  };
  box.onchange = (e) => {
    if (!e.target.matches('[data-addp]') || !e.target.value) return;
    const g = d.groups[+e.target.closest('[data-gi]').dataset.gi]; const p = S.people.find((x) => String(x.id) === e.target.value);
    if (p) g.members.push({ name: p.full_name, position: p.rank || '', role: g.members.length ? 'กรรมการ' : 'ประธานกรรมการ' });
    renderGroups(); preview();
  };
  box.onclick = (e) => {
    const op = e.target.dataset.op; if (!op) return;
    const gEl = e.target.closest('[data-gi]'); const gi = gEl ? +gEl.dataset.gi : -1; const g = d.groups[gi];
    const mEl = e.target.closest('[data-mi]'); const mi = mEl ? +mEl.dataset.mi : -1;
    if (op === 'gadd') d.groups.push({ title: '', members: [], duties: '' });
    else if (op === 'gdel') { if (!confirm('ลบคณะกรรมการนี้และรายชื่อในคณะ?')) return; d.groups.splice(gi, 1); }
    else if (op === 'gup') move(d.groups, gi, gi - 1);
    else if (op === 'gdn') move(d.groups, gi, gi + 1);
    else if (op === 'madd') g.members.push({ name: '', position: '', role: g.members.length ? 'กรรมการ' : 'ประธานกรรมการ' });
    else if (op === 'mdel') g.members.splice(mi, 1);
    else if (op === 'mup') move(g.members, mi, mi - 1);
    else if (op === 'mdn') move(g.members, mi, mi + 1);
    renderGroups(); preview();
  };
}

function preview() {
  const sc = $('#sc'); if (!sc) return;
  sc.innerHTML = renderSheet(layoutOf(S.doc));
  fit();
}
function fit() {
  const pv = $('#pv'), sc = $('#sc'); if (!pv || !sc) return;
  const sheet = sc.firstElementChild; const w = sheet.offsetWidth;
  const k = Math.min(1, (pv.clientWidth - 24) / w);
  sc.style.transform = `scale(${k})`; sc.style.width = `${w}px`;
  pv.style.height = `${sheet.offsetHeight * k + 24}px`;
}
window.addEventListener('resize', fit);

const fileName = (d) => `${TYPE_NAME[d.type]} ${d.subject || ''}`.trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'หนังสือ';

async function saveDoc() {
  const d = S.doc;
  const row = { doc_type: d.type, doc_no: d.doc_no, doc_date: d.doc_date || null, subject: d.subject, data: { ...d, id: undefined }, updated_at: new Date().toISOString() };
  if (d.id) row.id = d.id;
  else if (S.db.mode === 'supabase') row.created_by = S.me.id;
  const saved = await S.db.save('wd_documents', row);
  d.id = saved.id; toast('บันทึกแล้ว'); viewDraft();
}

async function downloadWord() {
  const blob = await buildDocx(layoutOf(S.doc));
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${fileName(S.doc)}.docx`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function printDoc() {
  const root = $('#print-root'); root.innerHTML = renderSheet(layoutOf(S.doc));
  const title = document.title; document.title = fileName(S.doc);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); document.title = title; root.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  document.fonts.ready.then(() => window.print());
}

// ------------------------------------------------------------------ ประวัติ
async function viewHistory() {
  const v = $('#view'); v.innerHTML = '<div class="card">กำลังโหลด…</div>';
  const docs = await S.db.list('wd_documents', 'created_at');
  v.innerHTML = `<div class="card scroll">
    ${docs.length ? `<table class="list"><thead><tr><th>วันที่</th><th>ประเภท</th><th>ที่</th><th>เรื่อง</th><th></th></tr></thead><tbody>
    ${docs.map((r) => `<tr><td>${esc(thaiDate(r.doc_date))}</td><td>${esc(TYPE_NAME[r.doc_type] || r.doc_type)}</td><td>${esc(r.doc_no)}</td><td>${esc(r.subject)}</td>
      <td style="white-space:nowrap"><button class="btn small" data-open="${esc(r.id)}">เปิด</button> <button class="btn small" data-copy="${esc(r.id)}">ทำสำเนา</button> <button class="btn small danger" data-del="${esc(r.id)}">ลบ</button></td></tr>`).join('')}
    </tbody></table>` : '<p class="muted">ยังไม่มีเอกสารที่บันทึกไว้</p>'}</div>`;
  const load = (id, copy) => {
    const r = docs.find((x) => String(x.id) === String(id));
    S.doc = { ...newDoc(r.doc_type), ...r.data, type: r.doc_type, id: copy ? null : r.id };
    if (copy) { S.doc.doc_no = r.doc_type === 'external' ? `${S.settings.doc_code || ''}/` : ''; S.doc.doc_date = todayIso(); }
    S.tab = 'draft'; render();
  };
  $$('[data-open]').forEach((b) => b.onclick = () => load(b.dataset.open, false));
  $$('[data-copy]').forEach((b) => b.onclick = () => load(b.dataset.copy, true));
  $$('[data-del]').forEach((b) => b.onclick = guard(async () => {
    if (!confirm('ลบเอกสารนี้?')) return;
    await S.db.remove('wd_documents', b.dataset.del);
    if (String(S.doc?.id) === String(b.dataset.del)) S.doc.id = null;
    viewHistory();
  }));
}

// ------------------------------------------------------------------ บุคลากร
function viewPeople() {
  const ro = !S.isAdmin;
  const cell = (p, k) => ro ? esc(p[k]) : `<input data-k="${k}" value="${esc(p[k])}">`;
  $('#view').innerHTML = `<div class="card scroll">
    ${ro ? '<p class="muted">แก้ไขรายชื่อได้เฉพาะแอดมิน</p>' : '<p class="muted">แก้แล้วกด "บันทึก" ท้ายแถว · "ตำแหน่งใต้ลายมือชื่อ" คือข้อความที่พิมพ์ใต้ชื่อผู้ลงนาม</p>'}
    <table class="list"><thead><tr><th style="width:56px">ลำดับ</th><th>ชื่อ-สกุล</th><th>ตำแหน่งตามคำสั่ง</th><th>ตำแหน่งใต้ลายมือชื่อ</th><th>หน้าที่หลัก</th>${ro ? '' : '<th></th>'}</tr></thead>
    <tbody>${S.people.map((p) => `<tr data-id="${esc(p.id)}"><td>${cell(p, 'sort')}</td><td>${cell(p, 'full_name')}</td><td>${cell(p, 'rank')}</td><td>${cell(p, 'sign_title')}</td><td>${cell(p, 'duty')}</td>
      ${ro ? '' : '<td style="white-space:nowrap"><button class="btn small primary" data-save>บันทึก</button> <button class="btn small danger" data-del>ลบ</button></td>'}</tr>`).join('')}
    </tbody></table>
    ${ro ? '' : '<div class="actions"><button class="btn" id="add">เพิ่มบุคลากร</button></div>'}</div>`;
  if (ro) return;
  $$('tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    $('[data-save]', tr).onclick = guard(async () => {
      const row = { id }; $$('[data-k]', tr).forEach((i) => { row[i.dataset.k] = i.dataset.k === 'sort' ? Number(i.value) || 0 : i.value.trim(); });
      if (!row.full_name) throw new Error('กรุณากรอกชื่อ-สกุล');
      await S.db.save('wd_people', row); S.people = await S.db.list('wd_people'); toast('บันทึกแล้ว'); viewPeople();
    });
    $('[data-del]', tr).onclick = guard(async () => {
      if (String(id).startsWith('new-')) { S.people = S.people.filter((p) => p.id !== id); return viewPeople(); }
      if (!confirm('ลบบุคลากรคนนี้?')) return;
      await S.db.remove('wd_people', id); S.people = await S.db.list('wd_people'); viewPeople();
    });
  });
  $('#add').onclick = () => { S.people.push({ id: `new-${Date.now()}`, full_name: '', rank: '', sign_title: '', duty: '', sort: S.people.length + 1 }); viewPeople(); };
}

// ------------------------------------------------------------------ ตั้งค่า
function viewSettings() {
  const s = S.settings; const ro = S.isAdmin ? '' : 'disabled';
  const f = (k, label, ta) => `<label class="field"><span>${label}</span>${ta ? `<textarea data-s="${k}" ${ro}>${esc(s[k])}</textarea>` : `<input data-s="${k}" value="${esc(s[k])}" ${ro}>`}</label>`;
  $('#view').innerHTML = `<div class="card" style="max-width:640px">
    ${S.isAdmin ? '' : '<p class="muted">แก้ไขได้เฉพาะแอดมิน</p>'}
    ${f('school_name', 'ชื่อโรงเรียน (ใช้ในเนื้อหาจากแบบ)')}
    ${f('doc_code', 'รหัสหนังสือ (เช่น ศธ ๐๔๑๕๙.๐๕๒๖)')}
    ${f('memo_dept', 'ส่วนราชการ (บันทึกข้อความ)')}
    ${f('director_to', 'คำว่า "เรียน" เริ่มต้นของบันทึกข้อความ')}
    ${f('ext_address', 'ที่อยู่มุมขวา (หนังสือภายนอก) บรรทัดละส่วน', true)}
    ${f('footer', 'ท้ายหนังสือภายนอก (ชื่อหน่วยงาน/โทร) บรรทัดละส่วน', true)}
    ${S.isAdmin ? '<div class="actions"><button class="btn primary" id="ss">บันทึกการตั้งค่า</button></div>' : ''}
  </div>`;
  $('#ss')?.addEventListener('click', guard(async () => {
    const row = { id: 1 }; $$('[data-s]').forEach((i) => { row[i.dataset.s] = i.value; });
    S.settings = await S.db.save('wd_settings', row); toast('บันทึกแล้ว');
  }));
}

boot().catch((e) => { console.error(e); app.innerHTML = `<div class="card login"><h2>เปิดระบบไม่สำเร็จ</h2><p>${esc(e.message || e)}</p></div>`; });
