"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { label, STEP_LABELS, ZONE_LABELS } from "../../../lib/labels";
import { Login, useSession } from "../../../lib/auth";

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

export default function JobPage() {
  const session = useSession();
  const [id, setId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [media, setMedia] = useState<Media[]>([]);
  const [saving, setSaving] = useState(false);

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
    })();
  }, [session, id]);

  async function setStatus(status: string) {
    if (!job) return;
    setSaving(true);
    const { error } = await supabase.from("jobs").update({ status }).eq("id", job.id);
    if (!error) setJob({ ...job, status });
    setSaving(false);
  }

  if (session === undefined) return <main className="wrap"><p className="lead">Loading…</p></main>;
  if (!session) return <Login />;
  if (job === undefined) return <main className="wrap"><p className="lead">Loading job…</p></main>;
  if (job === null) return <main className="wrap"><p className="lead">Job not found, or your account doesn't have access to it.</p><a href="/admin">Back to jobs</a></main>;

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
    <main className="wrap admin">
      <a className="back" href="/admin">← All jobs</a>
      <div className="admin-head">
        <div>
          <h1>{name}</h1>
          <p className="lead" style={{ margin: 0 }}>{label("job_type", job.job_type)} · {job.city || "No city"}</p>
        </div>
        <span className={`pill ${job.status}`}>{label("status", job.status)}</span>
      </div>

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
    </main>
  );
}
