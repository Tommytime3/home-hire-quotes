"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { label, STEP_LABELS, ZONE_LABELS, CONTACT_LABELS } from "../../../lib/labels";
import { Login, useSession } from "../../../lib/auth";
import { AdminShell } from "../../../lib/AdminShell";
import { money } from "../../../lib/quote";

type Job = Record<string, any>;
type Media = { id: string; step: string; kind: "photo" | "video"; storage_path: string; url?: string };

const ZONE_GRID = [
  "back_left", "back_center", "back_right",
  "middle_left", "middle", "middle_right",
  "front_left", "front_center", "front_right",
];

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v === null || v === undefined || v === "" ? "—" : v}</span>
    </div>
  );
}

function MiniMap({ marks }: { marks: { zone: string | null; tag: string }[] }) {
  return (
    <div className="minimap">
      <span className="house-label">Back</span>
      <div className="mini-grid">
        {ZONE_GRID.map((z) => {
          const here = marks.filter((m) => m.zone === z);
          return <div key={z} className={`mini-cell ${here.length ? "on" : ""}`}>{here.map((m) => m.tag).join(" ")}</div>;
        })}
      </div>
      <span className="house-label">Front (street)</span>
      {marks.some((m) => m.zone === "unsure") && (
        <p className="tip">Not sure: {marks.filter((m) => m.zone === "unsure").map((m) => m.tag).join(", ")}</p>
      )}
    </div>
  );
}

const FUELS: [string, string][] = [["gas", "Gas"], ["propane", "Propane"], ["electric", "Electric"], ["heat_pump", "Heat pump"]];

// What the old equipment's label says. Read automatically from the homeowner's photo;
// anything typed here wins over the automatic read and sizes the quote.
function LabelCard({ job, onChange }: { job: Job; onChange: (patch: Partial<Job>) => void }) {
  const isWh = job.job_type === "heat_pump_water_heater";
  const [gal, setGal] = useState<string>(job.existing_gallons ? String(job.existing_gallons) : "");
  const [fuel, setFuel] = useState<string>(job.existing_fuel ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = Number(gal);
    const patch = { existing_gallons: n >= 10 && n <= 150 ? Math.round(n) : null, existing_fuel: fuel || null, plate_source: "staff" };
    const { error } = await supabase.from("jobs").update(patch).eq("id", job.id);
    setMsg(error ? "Couldn't save" : "Saved. New quotes use this size.");
    if (!error) onChange(patch);
  }

  async function reread() {
    setBusy(true);
    setMsg("Reading the label…");
    const { data, error } = await supabase.functions.invoke("read-data-plate", { body: { job_id: job.id, force: true } });
    setBusy(false);
    if (error) return setMsg("Couldn't read it. Check the photo below and type the size in.");
    if (data?.skipped === "no_api_key") return setMsg("Label reading isn't switched on yet (needs the AI key in Supabase).");
    const { data: fresh } = await supabase.from("jobs").select("*").eq("id", job.id).maybeSingle();
    if (fresh) {
      onChange(fresh);
      setGal(fresh.existing_gallons ? String(fresh.existing_gallons) : "");
      setFuel(fresh.existing_fuel ?? "");
    }
    setMsg(data?.label?.is_label ? `Read it (${data.label.confidence} confidence)${data.label.note ? `: ${data.label.note}` : ""}` : "Couldn't find a readable label in the photo.");
  }

  const read = [job.existing_brand, job.existing_model && `model ${job.existing_model}`, job.existing_serial && `serial ${job.existing_serial}`, job.existing_year && `made ${job.existing_year}`].filter(Boolean).join(" · ");

  return (
    <section className="card">
      <div className="quote-card-head">
        <h2>From the label</h2>
        <button className="btn ghost" disabled={busy} onClick={reread}>{busy ? "Reading…" : "Read label again"}</button>
      </div>
      {read ? <p>{read}{job.existing_tons ? ` · ${job.existing_tons} ton` : ""}</p> : <p className="muted">Not read yet.</p>}
      {job.plate_source && <p className="muted small">{job.plate_source === "ai" ? "Read automatically. Double-check it against the photo." : "Entered by you."}</p>}
      {isWh && (
        <div className="label-edit">
          <label className="lbl">Tank size now (gallons)</label>
          <input type="number" inputMode="numeric" value={gal} onChange={(e) => setGal(e.target.value)} placeholder="e.g. 50" />
          <label className="lbl">Fuel now</label>
          <select value={fuel} onChange={(e) => setFuel(e.target.value)}>
            <option value="">Not sure</option>
            {FUELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="btn" onClick={save}>Save</button>
        </div>
      )}
      {msg && <p className="tip">{msg}</p>}
    </section>
  );
}

export default function JobPage() {
  const session = useSession();
  const [id, setId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [media, setMedia] = useState<Media[]>([]);
  const [saving, setSaving] = useState(false);
  const [quotes, setQuotes] = useState<any[]>([]);

  useEffect(() => setId(new URLSearchParams(window.location.search).get("id")), []);

  useEffect(() => {
    if (!session || !id) return;
    (async () => {
      const { data } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
      setJob(data ?? null);
      const { data: rows } = await supabase.from("job_media").select("id,step,kind,storage_path").eq("job_id", id).order("created_at");
      const list = (rows as Media[]) ?? [];
      if (list.length) {
        const { data: signed } = await supabase.storage
          .from("job-media")
          .createSignedUrls(list.map((m) => m.storage_path), 60 * 60);
        const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
        list.forEach((m) => (m.url = byPath.get(m.storage_path) ?? undefined));
      }
      setMedia(list);
      const { data: qs } = await supabase.from("quotes").select("id,status,options,updated_at").eq("job_id", id).order("updated_at", { ascending: false });
      setQuotes(qs ?? []);
    })();
  }, [session, id]);

  async function setStatus(status: string) {
    if (!job) return;
    setSaving(true);
    const { error } = await supabase.from("jobs").update({ status }).eq("id", job.id);
    if (!error) setJob({ ...job, status });
    setSaving(false);
  }

  if (session === undefined) return <AdminShell><p className="lead">Loading…</p></AdminShell>;
  if (!session) return <Login />;
  if (job === undefined) return <AdminShell><p className="lead">Loading job…</p></AdminShell>;
  if (job === null) return <AdminShell back={{ href: "/admin", label: "All jobs" }}><p className="lead">Job not found, or your account doesn't have access to it.</p></AdminShell>;

  const name = [job.first_name, job.last_name].filter(Boolean).join(" ") || "Homeowner";
  const first = job.first_name || "there";
  const phoneDigits = String(job.phone ?? "").replace(/[^\d+]/g, "");
  const smsBody = encodeURIComponent(`Hi ${first}, this is Tommy with Comfort Air. I got your photos and I'm putting your quote together now. Do you have a few minutes for a quick call?`);
  const mailSubject = encodeURIComponent("Your Comfort Air quote");
  const mailBody = encodeURIComponent(`Hi ${first},\n\nThanks for sending your photos and videos. I'm putting your quote together now and will have it to you shortly.\n\nTommy\nComfort Air Heating & Air Conditioning`);
  const isHvac = job.job_type === "ducted_heat_pump" || job.job_type === "ductless";
  const isWh = job.job_type === "heat_pump_water_heater";
  const steps = Array.from(new Set(media.map((m) => m.step)));

  const marks = [
    ...(isHvac ? [{ zone: job.indoor_zone, tag: "Unit" }] : []),
    ...(isWh ? [{ zone: job.water_heater_zone, tag: "Water heater" }] : []),
    { zone: job.panel_zone, tag: "Panel" },
  ];

  return (
    <AdminShell back={{ href: "/admin", label: "All jobs" }}>
      <div className="admin-head">
        <div>
          <h1>{name}</h1>
          <p className="lead" style={{ margin: 0 }}>{label("job_type", job.job_type)} · {job.city || "No city"}</p>
        </div>
        <span className={`pill ${job.status}`}>{label("status", job.status)}</span>
      </div>

      {job.contact_request && (
        <div className="contact-alert">
          ● {CONTACT_LABELS[job.contact_request]}{job.contact_pref ? `: ${job.contact_pref}` : ""}
          {job.contact_requested_at ? ` · ${new Date(job.contact_requested_at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}
        </div>
      )}
      {job.estimate_low != null && (
        <p className="muted small">They saw an estimate of {money(job.estimate_low)}–{money(job.estimate_high)}{Number(job.estimate_rebate) > 0 ? `, ${money(job.estimate_rebate)} rebate` : ""}.</p>
      )}

      <section className="card quote-card">
        <div className="quote-card-head">
          <h2>Quote</h2>
          <a className="btn" href={quotes.length ? `/admin/quote?id=${quotes[0].id}` : `/admin/quote?job=${job.id}`}>
            {quotes.length ? "Edit quote" : "Build quote"}
          </a>
        </div>
        {quotes.length === 0 && <p>No quote yet. Build Good / Better / Best from your price book.</p>}
        {quotes.map((qt) => (
          <a key={qt.id} className="quote-row" href={`/admin/quote/print?id=${qt.id}`}>
            <span>{qt.status === "sent" ? "Sent" : "Draft"} · {new Date(qt.updated_at).toLocaleDateString()}</span>
            <span className="muted">{(qt.options ?? []).filter((o: any) => o.enabled).map((o: any) => money(o.base_price)).join(" / ")}</span>
            <span className="link-txt">View PDF →</span>
          </a>
        ))}
      </section>

      <LabelCard job={job} onChange={(patch) => setJob({ ...job, ...patch })} />

      <div className="actions">
        <a className="act" href={`tel:${phoneDigits}`}>Call</a>
        <a className="act" href={`sms:${phoneDigits}?&body=${smsBody}`}>Text</a>
        <a className="act" href={`mailto:${job.email ?? ""}?subject=${mailSubject}&body=${mailBody}`}>Email</a>
      </div>

      <section className="card">
        <h2>Contact</h2>
        <Row k="Phone" v={job.phone} />
        <Row k="Email" v={job.email} />
        <Row k="Address" v={[job.street, job.city, job.zip].filter(Boolean).join(", ")} />
        <Row k="Home" v={`${label("home_type", job.home_type)}${job.stories ? ` · ${job.stories === 3 ? "3+" : job.stories} ${job.stories === 1 ? "story" : "stories"}` : ""}`} />
        <Row k="Sq ft / built" v={[job.square_feet && `${job.square_feet} sq ft`, job.year_built && `built ${job.year_built}`].filter(Boolean).join(" · ")} />
      </section>

      <section className="card">
        <h2>Where things are</h2>
        <MiniMap marks={marks} />
        {isHvac && <Row k="Indoor unit" v={`${label("indoor_location", job.indoor_location)} · ${ZONE_LABELS[job.indoor_zone] ?? "—"}`} />}
        {isHvac && <Row k="Outdoor unit" v={label("outdoor_location", job.outdoor_location)} />}
        {job.job_type === "ducted_heat_pump" && (
          <Row k="Systems" v={[
            job.system_count && `${job.system_count === 3 ? "3+" : job.system_count} ducted`,
            job.has_mini_splits === "yes" ? `+ mini-splits${job.mini_split_heads ? ` (${job.mini_split_heads} heads)` : ""}` : job.has_mini_splits === "unsure" ? "mini-splits: not sure" : null,
          ].filter(Boolean).join(" ")} />
        )}
        {job.second_system_location && <Row k="Second system" v={job.second_system_location} />}
        {isWh && <Row k="Water heater" v={`${label("water_heater_location", job.water_heater_location)} · ${ZONE_LABELS[job.water_heater_zone] ?? "—"}`} />}
        {isWh && <Row k="Door opening" v={job.door_width_in ? `${job.door_width_in}" wide${job.door_height_in ? ` × ${job.door_height_in}" tall` : ""}` : null} />}
        <Row k="Panel" v={`${label("panel_location", job.panel_location)} · ${ZONE_LABELS[job.panel_zone] ?? "—"}`} />
        {isHvac && <Row k="Steps outdoor → indoor" v={job.steps_condenser_to_indoor} />}
        <Row k={isWh ? "Steps water heater → panel" : "Steps indoor → panel"} v={job.steps_indoor_to_panel} />
      </section>

      <section className="card">
        <h2>System clues</h2>
        <Row k="Panel type (guess)" v={`${label("panel_type", job.panel_type)} · ${label("meter_at_panel", job.meter_at_panel)}`} />
        <Row k="Service lines" v={label("service_lines", job.service_lines)} />
        {job.job_type === "ducted_heat_pump" && (
          <>
            <Row k="Airflow (guess)" v={label("airflow_config", job.airflow_config)} />
            <Row k="Supply vents" v={`${label("supply_location", job.supply_location)}${job.supply_register_count ? ` · ${job.supply_register_count} vents` : ""}`} />
            <Row k="Returns" v={`${label("return_location", job.return_location)}${job.return_count ? ` · ${job.return_count}` : ""}`} />
          </>
        )}
        {job.notes && <Row k="Notes" v={job.notes} />}
        <p className="tip">Guesses come from the homeowner's answers. Confirm them in the photos and videos below.</p>
      </section>

      {steps.length === 0 && <section className="card"><h2>Photos & videos</h2><p>Nothing uploaded.</p></section>}
      {steps.map((s) => (
        <section className="card" key={s}>
          <h2>{STEP_LABELS[s] ?? s}</h2>
          <div className="media-grid">
            {media.filter((m) => m.step === s).map((m) =>
              m.kind === "video" ? (
                <video key={m.id} src={m.url} controls playsInline preload="metadata" />
              ) : (
                <a key={m.id} href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt={STEP_LABELS[s] ?? s} /></a>
              )
            )}
          </div>
        </section>
      ))}

      <section className="card">
        <h2>Status</h2>
        <div className="options">
          {["in_review", "quoted", "signed", "declined"].map((s) => (
            <button key={s} type="button" disabled={saving} className={`option ${job.status === s ? "on" : ""}`} onClick={() => setStatus(s)}>
              <span className="radio" aria-hidden="true" />
              {label("status", s)}
            </button>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
