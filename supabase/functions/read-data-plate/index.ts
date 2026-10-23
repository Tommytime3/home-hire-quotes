// Reads the equipment labels (data plates) a homeowner photographed and saves what they say:
// brand, model, serial, tank size, fuel, year, tons. For water heater jobs the tank size drives
// which Navien / Bradford White / Rheem size gets suggested on the quote.
//
// Body: { job_id, force? }
// Safe to call publicly: each photo is read at most once. Re-reading (force) needs a staff login.
// Needs the ANTHROPIC_API_KEY secret. Without it, this does nothing and staff enter the size by hand.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MODEL = Deno.env.get("PLATE_MODEL") ?? "claude-sonnet-5-5";
const PLATE_STEPS = ["indoor_data_plate", "outdoor_data_plate", "second_indoor_data_plate", "second_outdoor_data_plate"];
const MAX_BYTES = 5 * 1024 * 1024; // vision API limit per image

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TOOL = {
  name: "save_label",
  description: "Save what the equipment label says. Use null for anything not clearly printed on the label.",
  input_schema: {
    type: "object",
    properties: {
      is_label: { type: "boolean", description: "True if the photo shows an equipment rating label or data plate that can be read." },
      equipment: { type: "string", enum: ["water_heater", "furnace", "air_handler", "air_conditioner", "heat_pump", "other"] },
      brand: { type: ["string", "null"] },
      model: { type: ["string", "null"] },
      serial: { type: ["string", "null"] },
      gallons: { type: ["number", "null"], description: "Tank capacity in US gallons, water heaters only." },
      fuel: { type: ["string", "null"], enum: ["gas", "propane", "electric", "heat_pump", null] },
      year: { type: ["integer", "null"], description: "Manufacture year if printed, or decoded from the serial number when you are confident." },
      tons: { type: ["number", "null"], description: "Cooling capacity in tons for AC / heat pumps / air handlers (12,000 BTU/h = 1 ton). Use the rated cooling capacity if printed; otherwise decode it from the model number when the brand's pattern is clear (e.g. the 24/30/36/42/48/60 in a model number = 2/2.5/3/3.5/4/5 tons). Null for furnaces and water heaters." },
      input_btu: { type: ["integer", "null"] },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      note: { type: ["string", "null"], description: "Short note for the contractor, e.g. 'label partly blurry'." },
    },
    required: ["is_label", "equipment", "confidence"],
  },
};

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function readOne(apiKey: string, bytes: Uint8Array, mediaType: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "save_label" },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: b64(bytes) } },
          { type: "text", text: "This is a homeowner's photo of the label on their HVAC equipment or water heater. Read it exactly. Only report what is printed or clearly decodable; never guess." },
        ],
      }],
    }),
  });
  if (!res.ok) { const t = await res.text(); console.log("read-data-plate: vision error", res.status, t.slice(0, 300)); throw new Error(`vision ${res.status}`); }
  const out = await res.json();
  const use = out.content?.find((c: any) => c.type === "tool_use");
  return use?.input ?? null;
}

const MEDIA_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const jobId: string | undefined = body?.job_id;
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) return json({ error: "bad request" }, 400);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) { console.log("read-data-plate: no ANTHROPIC_API_KEY secret"); return json({ ok: true, skipped: "no_api_key" }); }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: job } = await db.from("jobs").select("id, contractor_id, job_type, plate_source").eq("id", jobId).maybeSingle();
  if (!job) return json({ error: "not found" }, 404);

  // Re-reading photos that were already read is staff-only.
  let force = false;
  if (body?.force) {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(token);
    if (!u?.user) return json({ error: "login required" }, 401);
    const { count } = await db.from("contractor_users").select("user_id", { count: "exact", head: true })
      .eq("user_id", u.user.id).eq("contractor_id", job.contractor_id);
    if (!count) return json({ error: "not allowed" }, 403);
    force = true;
  }

  let q = db.from("job_media").select("id, step, storage_path, ai_status").eq("job_id", jobId).eq("kind", "photo").in("step", PLATE_STEPS);
  if (!force) q = q.or("ai_status.is.null,ai_status.eq.pending"); // new photos start as "pending"
  const { data: media, error: mediaErr } = await q.order("created_at");
  console.log("read-data-plate:", JSON.stringify({ job: jobId, force, photos: media?.length ?? 0, mediaErr: mediaErr?.message ?? null }));
  const results: any[] = [];

  for (const m of media ?? []) {
    // Claim the photo first so two calls never pay to read it twice.
    if (!force) {
      const { data: claimed } = await db.from("job_media").update({ ai_status: "reading" }).eq("id", m.id).or("ai_status.is.null,ai_status.eq.pending").select("id").maybeSingle();
      if (!claimed) continue;
    }
    try {
      const ext = (m.storage_path.split(".").pop() ?? "").toLowerCase();
      const type = MEDIA_TYPES[ext];
      if (!type) { await db.from("job_media").update({ ai_status: "unsupported" }).eq("id", m.id); continue; }
      const file = await db.storage.from("job-media").download(m.storage_path);
      if (file.error || !file.data) throw new Error("download");
      const bytes = new Uint8Array(await file.data.arrayBuffer());
      if (bytes.length > MAX_BYTES) { await db.from("job_media").update({ ai_status: "too_large" }).eq("id", m.id); continue; }
      const read = await readOne(apiKey, bytes, type);
      await db.from("job_media").update({ ai_status: read ? "done" : "failed", ai_extracted: read }).eq("id", m.id);
      if (read) results.push({ step: m.step, ...read });
    } catch (e) {
      console.log("read-data-plate: photo failed", m.id, String(e));
      await db.from("job_media").update({ ai_status: "failed" }).eq("id", m.id);
    }
  }

  // Copy the main label's details onto the job. Never overwrite numbers staff typed in by hand.
  const main = results.find((r) => r.is_label && r.step === "indoor_data_plate") ?? results.find((r) => r.is_label);
  if (main && (job.plate_source !== "staff" || force)) {
    const isWh = job.job_type === "heat_pump_water_heater";
    const gal = Number(main.gallons);
    const year = Number(main.year);
    const patch: Record<string, unknown> = {
      existing_brand: main.brand ?? null,
      existing_model: main.model ?? null,
      existing_serial: main.serial ?? null,
      existing_year: year >= 1950 && year <= 2100 ? year : null,
      plate_read_at: new Date().toISOString(),
      plate_source: "ai",
    };
    if (isWh) {
      patch.existing_gallons = gal >= 10 && gal <= 150 ? Math.round(gal) : null;
      patch.existing_fuel = ["gas", "propane", "electric", "heat_pump"].includes(main.fuel) ? main.fuel : null;
    } else {
      // System size: the outdoor unit's label is the most reliable (an indoor furnace label often has no AC size).
      // Only the first system: a second system's label never overwrites it.
      const ok = (r: any) => r.is_label && Number(r.tons) > 0 && Number(r.tons) <= 6;
      const src = results.find((r) => ok(r) && r.step === "outdoor_data_plate") ?? results.find((r) => ok(r) && r.step === "indoor_data_plate");
      if (src) patch.existing_tons = Math.round(Number(src.tons) * 2) / 2;
    }
    await db.from("jobs").update(patch).eq("id", jobId);
  }
  return json({ ok: true, read: results.length, label: main ?? null });
});
