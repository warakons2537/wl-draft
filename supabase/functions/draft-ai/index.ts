// Supabase Edge Function: draft-ai — ให้ Gemini ร่าง "เรื่อง" และ "เนื้อหา" ของหนังสือราชการ
// ตั้งค่า: Edge Functions → Secrets → GEMINI_API_KEY (ห้ามใส่ key ในไฟล์นี้หรือใน repo)
// ใช้ได้เฉพาะผู้ที่ล็อกอินและบทบาทเป็น teacher หรือ admin ใน WL Admin
// (ไม่มีโค้ดอื่นนอกจากนี้ ข้อความที่ส่งเข้าไปคือใจความที่ผู้ใช้พิมพ์ในช่อง AI เท่านั้น)

const MODEL_DEFAULT = 'gemini-3.5-flash-lite';
const TYPES: Record<string, string> = {
  memo: 'บันทึกข้อความ (ภายในโรงเรียน เสนอผู้บริหาร)',
  external: 'หนังสือภายนอก (ส่งถึงหน่วยงานอื่น)',
  order: 'คำสั่งโรงเรียน (ย่อหน้าเปิดเหตุผลก่อนแต่งตั้ง)',
  announce: 'ประกาศโรงเรียน',
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYSTEM = `คุณเป็นผู้ช่วยร่างหนังสือราชการของโรงเรียนในประเทศไทย เขียนภาษาไทยแบบทางการ กระชับ สุภาพ ตามแบบหนังสือราชการ
กติกา:
- ใช้เฉพาะข้อเท็จจริงที่ผู้ใช้ให้มา ห้ามแต่งชื่อคน วันที่ จำนวน เลขที่หนังสือ งบประมาณ มาตรา กฎหมาย หรือระเบียบขึ้นเอง
- ถ้าข้อมูลที่จำเป็นยังไม่มี ให้ใส่ "..." ไว้ให้ผู้ใช้เติมเอง
- ไม่ต้องใส่คำขึ้นต้น "เรียน" คำลงท้าย "จึงเรียนมาเพื่อ..." ชื่อผู้ลงนาม หรือวันที่ (ระบบใส่ให้แล้ว)
- เนื้อหาแยกย่อหน้าด้วยการขึ้นบรรทัดใหม่ ไม่ใช้ markdown ไม่ใช้สัญลักษณ์ตกแต่ง
- ตอบเป็น JSON เท่านั้น รูปแบบ {"subject":"...","body":"..."}`;

export async function handle(req: Request, env: Record<string, string | undefined>, fetchFn: typeof fetch = fetch) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'ใช้ได้เฉพาะ POST' }, 405);

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Supabase (Edge Functions → Secrets)' }, 500);

  // 1) ตรวจว่าล็อกอินและเป็นครู/แอดมินที่อนุมัติแล้ว
  const auth = req.headers.get('Authorization') || '';
  const base = env.SUPABASE_URL, anon = env.SUPABASE_ANON_KEY;
  if (!auth.startsWith('Bearer ') || !base || !anon) return json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, 401);
  const me = await fetchFn(`${base}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
  if (!me.ok) return json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }, 401);
  const uid = (await me.json()).id;
  const pr = await fetchFn(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=role`, { headers: { Authorization: auth, apikey: anon } });
  const role = pr.ok ? (await pr.json())?.[0]?.role : null;
  if (role !== 'teacher' && role !== 'admin') return json({ error: 'บัญชีนี้ยังไม่ได้รับอนุมัติให้ใช้งาน' }, 403);

  // 2) ตรวจข้อมูลที่ส่งมา
  let input: { type?: string; brief?: string; school?: string };
  try { input = await req.json(); } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400); }
  const brief = String(input.brief || '').trim().slice(0, 1500);
  const kind = TYPES[String(input.type)];
  if (!kind) return json({ error: 'ประเภทเอกสารไม่ถูกต้อง' }, 400);
  if (brief.length < 5) return json({ error: 'กรุณาพิมพ์ใจความอย่างน้อย 1 ประโยค' }, 400);
  const school = String(input.school || 'โรงเรียน').slice(0, 120);

  // 3) เรียก Gemini
  const model = env.GEMINI_MODEL || MODEL_DEFAULT;
  const r = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: `ประเภทเอกสาร: ${kind}\nโรงเรียน: ${school}\nใจความที่ต้องการ: ${brief}` }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1500, responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 300);
    const msg = r.status === 429 ? 'ใช้โควตาฟรีของ Gemini เต็มชั่วคราว ลองใหม่อีกครั้งในอีกสักครู่'
      : r.status === 400 || r.status === 403 ? `Gemini ปฏิเสธคำขอ (ตรวจ API key และชื่อรุ่น ${model}): ${t}` : `Gemini ขัดข้อง (${r.status})`;
    return json({ error: msg }, 502);
  }
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
  let out: { subject?: string; body?: string };
  try { out = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return json({ error: 'AI ตอบกลับในรูปแบบที่อ่านไม่ได้ ลองกดอีกครั้ง' }, 502); }
  const clean = (s: unknown) => String(s ?? '').replace(/[*#`]/g, '').trim();
  return json({ subject: clean(out.subject), body: clean(out.body).replace(/\n{2,}/g, '\n') });
}

// รันบน Supabase (Deno) · ในการทดสอบด้วย Node จะไม่เรียกส่วนนี้
// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D?.serve) D.serve((req: Request) => handle(req, D.env.toObject()));
