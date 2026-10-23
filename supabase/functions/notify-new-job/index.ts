// Alerts the contractor about homeowner activity. Events:
//   started   - homeowner entered contact info (sent once per job)
//   submitted - homeowner finished photos and answers (sent once per job; also emails)
//   contact   - homeowner asked to talk (video / call / call later / text)
// Safe to call publicly: each event only fires for a job in the right state, at most once,
// and only to the contractor's own alert channels.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://home-hire-quotes.vercel.app";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JOB_LABELS: Record<string, string> = {
  ducted_heat_pump: "heating & AC",
  ductless: "ductless mini-split",
  heat_pump_water_heater: "water heater",
};
const CONTACT_LABELS: Record<string, string> = {
  video: "wants a VIDEO CALL now",
  call: "is CALLING you now",
  later: "wants a call back",
  text: "wants the quote by text",
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const money = (n: number | null) => (n == null ? "" : "$" + Math.round(n).toLocaleString("en-US"));

async function push(topic: string | null, title: string, message: string, click: string, priority = "high") {
  if (!topic) return;
  await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: { Title: title, Priority: priority, Click: click, Tags: "house" },
    body: message,
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const jobId: string | undefined = body?.job_id;
  const event: string = body?.event ?? "submitted";
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) return json({ error: "bad request" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const link = `${SITE_URL}/admin/job?id=${jobId}`;

  if (event === "started") {
    const { data: job } = await db.from("jobs")
      .update({ started_notified_at: new Date().toISOString() })
      .eq("id", jobId).is("started_notified_at", null).not("phone", "is", null)
      .select("*, contractors(ntfy_topic)").maybeSingle();
    if (!job) return json({ ok: true, skipped: true });
    const name = `${job.first_name ?? ""} ${job.last_name ?? ""}`.trim() || "Someone";
    await push(job.contractors?.ntfy_topic, `${name} just started a quote`,
      `${JOB_LABELS[job.job_type] ?? "Quote"} · ${job.city ?? ""} · ${job.phone ?? ""}\nThey're filling out photos now. Tap to watch.`, link);
    return json({ ok: true });
  }

  if (event === "contact") {
    const { data: job } = await db.from("jobs").select("*, contractors(ntfy_topic)").eq("id", jobId).maybeSingle();
    if (!job?.contact_request || !job.contact_requested_at) return json({ ok: true, skipped: true });
    if (Date.now() - new Date(job.contact_requested_at).getTime() > 2 * 60 * 1000) return json({ ok: true, skipped: true });
    const name = `${job.first_name ?? ""} ${job.last_name ?? ""}`.trim() || "A homeowner";
    const pref = job.contact_pref ? ` (${job.contact_pref})` : "";
    await push(job.contractors?.ntfy_topic, `${name} ${CONTACT_LABELS[job.contact_request] ?? "wants to talk"}${pref}`,
      `${JOB_LABELS[job.job_type] ?? "Quote"} · ${job.city ?? ""} · ${job.phone ?? ""}` +
      (job.estimate_low ? `\nSaw estimate ${money(job.estimate_low)}–${money(job.estimate_high)}` : ""), link, "urgent");
    return json({ ok: true });
  }

  // submitted: claim the job so this only ever goes out once
  const { data: job, error } = await db.from("jobs")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", jobId).eq("status", "submitted").is("notified_at", null)
    .select("*, contractors(name, alert_email, ntfy_topic)").maybeSingle();
  if (error) return json({ error: "lookup failed" }, 500);
  if (!job) return json({ ok: true, skipped: true });

  const { count } = await db.from("job_media").select("id", { count: "exact", head: true }).eq("job_id", jobId);
  const name = `${job.first_name ?? ""} ${job.last_name ?? ""}`.trim() || "A homeowner";
  const what = JOB_LABELS[job.job_type] ?? "a quote";

  await push(job.contractors?.ntfy_topic, `${name} finished: ${what}`,
    `${job.city ?? ""} · ${job.phone ?? ""} · ${count ?? 0} photos/videos\nTap to review and build the quote.`, link);

  const to = job.contractors?.alert_email;
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (to && apiKey) {
    const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;color:#14201b">
      <p style="color:#1d4f91;font-weight:700;margin:0 0 4px">Home Hire · New job</p>
      <h2 style="margin:0 0 12px">${esc(name)} wants a quote for ${esc(what)}</h2>
      <table style="font-size:15px;line-height:1.6;border-collapse:collapse">
        <tr><td style="color:#5a6862;padding-right:12px">Phone</td><td><a href="tel:${esc(job.phone)}">${esc(job.phone)}</a></td></tr>
        <tr><td style="color:#5a6862;padding-right:12px">Email</td><td>${esc(job.email)}</td></tr>
        <tr><td style="color:#5a6862;padding-right:12px">Address</td><td>${esc(job.street)}, ${esc(job.city)} ${esc(job.zip)}</td></tr>
        <tr><td style="color:#5a6862;padding-right:12px">Photos & videos</td><td>${count ?? 0}</td></tr>
      </table>
      <p style="margin:20px 0"><a href="${link}" style="background:#e8742c;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Open the job</a></p>
      <p style="color:#5a6862;font-size:13px">Speed matters: they're most ready to buy right now.</p>
    </div>`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("ALERT_FROM") ?? "Home Hire <onboarding@resend.dev>",
        to: [to], subject: `New quote request: ${name}, ${job.city ?? ""} (${what})`, html,
      }),
    }).catch(() => {});
  }
  return json({ ok: true });
});
