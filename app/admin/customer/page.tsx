"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Login, useSession } from "../../../lib/auth";
import { AdminShell } from "../../../lib/AdminShell";
import { label } from "../../../lib/labels";
import { money } from "../../../lib/quote";

const SOURCES: [string, string][] = [
  ["phone", "Phone call"], ["photo_link", "Photo link"], ["referral", "Referral"], ["ads", "Ads"], ["walk_in", "Walk-in"], ["other", "Other"],
];
const FIELDS: [string, string, string?][] = [
  ["first_name", "First name"], ["last_name", "Last name"], ["phone", "Phone", "tel"], ["email", "Email", "email"],
  ["street", "Street address"], ["city", "City"], ["zip", "ZIP", "numeric"],
];

export default function CustomerPage() {
  const session = useSession();
  const [c, setC] = useState<Record<string, any> | null | undefined>(undefined);
  const [jobs, setJobs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [newType, setNewType] = useState("ducted_heat_pump");

  useEffect(() => {
    if (!session) return;
    const id = new URLSearchParams(window.location.search).get("id");
    (async () => {
      const { data } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
      setC(data ?? null);
      if (data) {
        const { data: js } = await supabase
          .from("jobs")
          .select("id,status,job_type,created_at,submitted_at,quotes(id,status,options,updated_at)")
          .eq("customer_id", data.id)
          .order("created_at", { ascending: false });
        setJobs(js ?? []);
      }
    })();
  }, [session]);

  if (session === undefined) return <AdminShell><p className="lead">Loading…</p></AdminShell>;
  if (!session) return <Login />;
  if (c === undefined) return <AdminShell><p className="lead">Loading customer…</p></AdminShell>;
  if (c === null) return <AdminShell back={{ href: "/admin/customers", label: "Customers" }}><p className="lead">Customer not found.</p></AdminShell>;

  async function save() {
    setSaving(true);
    const { id, contractor_id, created_at, updated_at, ...patch } = c!;
    const { error } = await supabase.from("customers").update(patch).eq("id", id);
    setSaving(false);
    setMsg(error ? "Couldn't save. Try again." : "Saved");
    setTimeout(() => setMsg(null), 1500);
  }

  // A quote for a customer who didn't use the photo link (e.g. a phone lead): create a job, then open the builder.
  async function newQuote() {
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        contractor_id: c!.contractor_id, customer_id: c!.id, status: "in_review", job_type: newType,
        first_name: c!.first_name, last_name: c!.last_name, phone: c!.phone, email: c!.email,
        street: c!.street, city: c!.city, zip: c!.zip,
      })
      .select("id")
      .single();
    if (error || !data) return setMsg("Couldn't start a quote. Try again.");
    window.location.href = `/admin/quote?job=${data.id}`;
  }

  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Customer";
  const digits = String(c.phone ?? "").replace(/[^\d+]/g, "");

  return (
    <AdminShell back={{ href: "/admin/customers", label: "Customers" }}>
      <div className="admin-head">
        <div>
          <p className="eyebrow">Customer</p>
          <h1>{name}</h1>
          <p className="muted">{[c.street, c.city, c.zip].filter(Boolean).join(", ")}</p>
        </div>
      </div>

      <div className="actions">
        <a className="act" href={digits ? `tel:${digits}` : undefined}>Call</a>
        <a className="act" href={digits ? `sms:${digits}` : undefined}>Text</a>
        <a className="act" href={c.email ? `mailto:${c.email}` : undefined}>Email</a>
      </div>

      <section className="panel">
        <div className="quote-card-head">
          <h2>Jobs & quotes</h2>
          <span className="new-quote">
            <select value={newType} onChange={(e) => setNewType(e.target.value)} aria-label="Job type">
              <option value="ducted_heat_pump">Heating & AC</option>
              <option value="ductless">Ductless</option>
              <option value="heat_pump_water_heater">Water heater</option>
            </select>
            <button className="btn" onClick={newQuote}>New quote</button>
          </span>
        </div>
        {jobs.length === 0 && <p className="muted">No jobs yet.</p>}
        {jobs.map((j) => (
          <div key={j.id} className="job-line">
            <a href={`/admin/job?id=${j.id}`}>
              <strong>{label("job_type", j.job_type)}</strong>
              <span className="muted small">{new Date(j.submitted_at ?? j.created_at).toLocaleDateString()}</span>
            </a>
            <span className={`pill ${j.status}`}>{label("status", j.status)}</span>
            {(j.quotes ?? []).map((qt: any) => (
              <a key={qt.id} className="quote-row" href={`/admin/quote/print?id=${qt.id}`}>
                <span>Quote · {qt.status === "sent" ? "Sent" : "Draft"}</span>
                <span className="muted">{(qt.options ?? []).filter((o: any) => o.enabled).map((o: any) => money(o.base_price)).join(" / ")}</span>
                <span className="link-txt">View →</span>
              </a>
            ))}
          </div>
        ))}
      </section>

      <section className="panel grid2">
        <div>
          <h2>Contact info</h2>
          {FIELDS.slice(0, 4).map(([k, l, mode]) => (
            <div key={k}>
              <label className="lbl">{l}</label>
              <input type="text" inputMode={mode as any} value={c[k] ?? ""} onChange={(e) => setC({ ...c, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <div>
          <h2>Address</h2>
          {FIELDS.slice(4).map(([k, l, mode]) => (
            <div key={k}>
              <label className="lbl">{l}</label>
              <input type="text" inputMode={mode as any} value={c[k] ?? ""} onChange={(e) => setC({ ...c, [k]: e.target.value })} />
            </div>
          ))}
          <label className="lbl">How they found you</label>
          <select value={c.source ?? "other"} onChange={(e) => setC({ ...c, source: e.target.value })}>
            {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="lbl">Notes</label>
          <textarea rows={4} value={c.notes ?? ""} onChange={(e) => setC({ ...c, notes: e.target.value })} />
        </div>
      </section>

      {msg && <p className="toast" role="status">{msg}</p>}
      <div className="savebar">
        <span className="muted small">Customer since {new Date(c.created_at).toLocaleDateString()}</span>
        <button className="btn" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </AdminShell>
  );
}
