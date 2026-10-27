// ชั้นข้อมูล: Supabase (ฐานข้อมูลกลาง) หรือ "เครื่องนี้" (localStorage) — API เดียวกัน
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { SEED_SETTINGS, SEED_PEOPLE } from './seed.js';

const thaiError = (e) => {
  const m = String(e?.message || e);
  if (/row-level security|permission denied/i.test(m)) return new Error('ไม่มีสิทธิ์บันทึกข้อมูลส่วนนี้');
  if (/Invalid login credentials/i.test(m)) return new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  if (/Email not confirmed/i.test(m)) return new Error('ยังไม่ได้ยืนยันอีเมล กรุณาเปิดลิงก์ในอีเมลก่อน');
  return e instanceof Error ? e : new Error(m);
};
const isMissingTable = (e) => /does not exist|Could not find the table|schema cache|42P01|PGRST205/i.test(`${e?.code} ${e?.message}`);

export function supabaseClient() {
  if (!window.supabase || !SUPABASE_URL) return null;
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

export function remoteDb(client) {
  const run = async (p) => { const { data, error } = await p; if (error) throw thaiError(error); return data; };
  return {
    mode: 'supabase',
    async ready() {   // false = ยังไม่ได้รันไฟล์ SQL
      const { error } = await client.from('wd_settings').select('id').limit(1);
      if (error && isMissingTable(error)) return false;
      if (error) throw thaiError(error);
      return true;
    },
    list: (t, order = 'sort') => run(client.from(t).select('*').order(order, { ascending: order === 'sort' })),
    get: async (t, id) => (await run(client.from(t).select('*').eq('id', id).limit(1)))[0] || null,
    save: async (t, row) => {
      const r = { ...row };
      if (!r.id || String(r.id).startsWith('new-')) { delete r.id; return (await run(client.from(t).insert(r).select()))[0]; }
      return (await run(client.from(t).update(r).eq('id', r.id).select()))[0];
    },
    remove: (t, id) => run(client.from(t).delete().eq('id', id)),
    async ai(payload) {   // ให้ Gemini ร่างเนื้อหา ผ่าน Edge Function ชื่อ draft-ai (key เก็บใน Supabase ไม่อยู่ในหน้าเว็บ)
      const { data, error } = await client.functions.invoke('draft-ai', { body: payload });
      if (error) {
        let msg = '';
        try { msg = (await error.context?.json?.())?.error || ''; } catch { /* */ }
        if (/not found|404/i.test(`${error.message} ${error.context?.status}`) && !msg) msg = 'ยังไม่ได้ติดตั้งฟังก์ชัน draft-ai ใน Supabase';
        throw new Error(msg || 'เรียก AI ไม่สำเร็จ ลองใหม่อีกครั้ง');
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
  };
}

export function localDb() {
  const KEY = (t) => `wl-draft:${t}`;
  const read = (t) => { try { return JSON.parse(localStorage.getItem(KEY(t))) || null; } catch { return null; } };
  const write = (t, rows) => { try { localStorage.setItem(KEY(t), JSON.stringify(rows)); } catch { throw new Error('พื้นที่เก็บข้อมูลในเครื่องเต็ม หรือเบราว์เซอร์ไม่อนุญาต'); } };
  const seed = { wd_settings: [SEED_SETTINGS], wd_people: SEED_PEOPLE, wd_documents: [] };
  const rows = (t) => read(t) ?? structuredClone(seed[t] || []);
  return {
    mode: 'local',
    async ready() { return true; },
    async list(t, order = 'sort') {
      const r = rows(t);
      return order === 'sort' ? r.sort((a, b) => (a.sort || 0) - (b.sort || 0)) : r.sort((a, b) => String(b[order]).localeCompare(String(a[order])));
    },
    async get(t, id) { return rows(t).find((r) => String(r.id) === String(id)) || null; },
    async save(t, row) {
      const all = rows(t); const now = new Date().toISOString();
      const r = { ...row, updated_at: now };
      if (!r.id || String(r.id).startsWith('new-')) { r.id = crypto.randomUUID?.() || `l${Date.now()}`; r.created_at = now; all.push(r); }
      else { const i = all.findIndex((x) => String(x.id) === String(r.id)); if (i < 0) all.push(r); else all[i] = { ...all[i], ...r }; }
      write(t, all); return r;
    },
    async remove(t, id) { write(t, rows(t).filter((r) => String(r.id) !== String(id))); },
    async ai() { throw new Error('ปุ่ม AI ใช้ได้เมื่อเข้าสู่ระบบและตั้งค่าฐานข้อมูลแล้วเท่านั้น (โหมดเก็บในเครื่องใช้ไม่ได้)'); },
  };
}

export async function signIn(client, email, password) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw thaiError(error);
}
