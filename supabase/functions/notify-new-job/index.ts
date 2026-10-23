// Emails the contractor when a homeowner submits a job.
// Called by the capture page right after submit. Safe to call publicly: it only acts on a job
// that is submitted and not yet notified, sends once, and only to the contractor's own alert address.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://home-hire-quotes.vercel.app";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JOB_LABELS: Record<string, string> = {
  ducted_heat_pump: "Heating & AC system",
  ductless: "Ductless mini-split",
  heat_pump_water_heater: "Heat pump water heater",
};

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let jobId: string | undefined;
  try {
    jobId = (await req.json())?.job_id;
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) return json({ error: "bad request" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Claim the job atomically so the email only ever goes out once.
  const { data: job, error } = await db
    .from("jobs")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "submitted")
    .is("notified_at", null)
    .select("*, contractors(name, alert_email)")
    .maybeSingle();
  if (error) return json({ error: "lookup failed" }, 500);
  if (!job) return json({ ok: true, skipped: true });

  const to = job.contractors?.alert_email;
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!to || !apiKey) {
    await db.from("jobs").update({ notified_at: null }).eq("id", jobId);
    return json({ error: "email not configured" }, 500);
  }

  const { count } = await db.from("job_media").select("id", { count: "exact", head: true }).eq("job_id", jobId);
  const name = `${job.first_name ?? ""} ${job.last_name ?? ""}`.trim() || "A homeowner";
  const what = JOB_LABELS[job.job_type] ?? "a quote";
  const link = `${SITE_URL}/admin/job?id=${jobId}`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;color:#14201b">
    <p style="color:#1d6a4d;font-weight:700;margin:0 0 4px">Home Hire · New job</p>
    <h2 style="margin:0 0 12px">${esc(name)} wants a quote for a ${esc(what.toLowerCase())}</h2>
    <table style="font-size:15px;line-height:1.6;border-collapse:collapse">
      <tr><td style="color:#5a6862;padding-right:12px">Phone</td><td><a href="tel:${esc(job.phone)}">${esc(job.phone)}</a></td></tr>
      <tr><td style="color:#5a6862;padding-right:12px">Email</td><td>${esc(job.email)}</td></tr>
      <tr><td style="color:#5a6862;padding-right:12px">Address</td><td>${esc(job.street)}, ${esc(job.city)} ${esc(job.zip)}</td></tr>
      <tr><td style="color:#5a6862;padding-right:12px">Photos & videos</td><td>${count ?? 0}</td></tr>
    </table>
    <p style="margin:20px 0">
      <a href="${link}" style="background:#1d6a4d;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Open the job</a>
    </p>
    <p style="color:#5a6862;font-size:13px">Speed matters: they're most ready to buy right now.</p>
  </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("ALERT_FROM") ?? "Home Hire <onboarding@resend.dev>",
      to: [to],
      subject: `New quote request: ${name}, ${job.city ?? ""} (${what})`,
      html,
    }),
  });

  if (!res.ok) {
    await db.from("jobs").update({ notified_at: null }).eq("id", jobId);
    return json({ error: "email failed", detail: await res.text() }, 502);
  }
  return json({ ok: true });
});
