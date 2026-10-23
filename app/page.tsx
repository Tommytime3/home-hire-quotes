"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, DEFAULT_CONTRACTOR_ID } from "../lib/supabase";

type JobType = "ducted_heat_pump" | "ductless" | "heat_pump_water_heater";
type Answers = Record<string, string>;
type Upload = {
  id: string;
  step: string;
  kind: "photo" | "video";
  preview: string;
  status: "uploading" | "done" | "failed";
  message?: string;
};

type Capture = { step: string; title: string; hint: string; kind: "photo" | "video"; required?: boolean };
type Choice = { key: string; label: string; options: [string, string][] };
type Field = { key: string; label: string; type: "text" | "tel" | "email" | "number"; required?: boolean };
type Step = {
  id: string;
  title: string;
  lead: string;
  forTypes?: JobType[];
  fields?: Field[];
  choices?: Choice[];
  captures?: Capture[];
  tip?: string;
};

const ALL: JobType[] = ["ducted_heat_pump", "ductless", "heat_pump_water_heater"];
const HVAC: JobType[] = ["ducted_heat_pump", "ductless"];

const STEPS: Step[] = [
  {
    id: "contact",
    title: "Let's get you a real quote",
    lead: "No salesperson visit. Show us your system from your phone and we'll send a real, signable price.",
    fields: [
      { key: "first_name", label: "First name", type: "text", required: true },
      { key: "last_name", label: "Last name", type: "text", required: true },
      { key: "phone", label: "Mobile phone", type: "tel", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "street", label: "Street address", type: "text", required: true },
      { key: "city", label: "City", type: "text", required: true },
      { key: "zip", label: "ZIP code", type: "text", required: true },
    ],
    choices: [
      {
        key: "job_type",
        label: "What are you replacing?",
        options: [
          ["ducted_heat_pump", "Heating & AC system"],
          ["ductless", "Ductless mini-split"],
          ["heat_pump_water_heater", "Water heater"],
        ],
      },
    ],
  },
  {
    id: "outdoor",
    title: "Your outdoor unit",
    lead: "This is the metal box with the fan outside your home. Skip the video if you don't have one.",
    forTypes: HVAC,
    choices: [
      {
        key: "outdoor_location",
        label: "Where is it?",
        options: [
          ["side_yard_left", "Left side yard"],
          ["side_yard_right", "Right side yard"],
          ["backyard", "Backyard"],
          ["front_yard", "Front yard"],
          ["roof", "On the roof"],
          ["none", "I don't have one"],
        ],
      },
    ],
    captures: [
      { step: "outdoor_unit", title: "Film the outdoor unit", hint: "Walk around it slowly, about 10 seconds.", kind: "video" },
      { step: "outdoor_data_plate", title: "Photo of the label on the side", hint: "The sticker with the model and serial number. Get close and make sure it's sharp.", kind: "photo" },
      { step: "line_set_route", title: "Film where the pipes go into the house", hint: "Follow the copper pipes from the unit to the wall.", kind: "video" },
    ],
    tip: "Most Bay Area cities require the outdoor unit to sit a set distance from the property line and meet noise limits. We'll check this for your city.",
  },
  {
    id: "indoor",
    title: "Your indoor unit",
    lead: "This is your furnace or air handler, the big box connected to your ducts.",
    forTypes: HVAC,
    choices: [
      {
        key: "indoor_location",
        label: "Where is it?",
        options: [
          ["garage", "Garage"],
          ["closet", "Hall or interior closet"],
          ["attic_easy", "Attic (easy to walk in)"],
          ["attic_tight", "Attic (tight or low)"],
          ["crawlspace", "Under the house"],
          ["basement", "Basement"],
          ["other", "Somewhere else"],
        ],
      },
    ],
    captures: [
      { step: "indoor_unit", title: "Film the unit and the space around it", hint: "Show how much room there is on each side and above it.", kind: "video", required: true },
      { step: "indoor_data_plate", title: "Photo of the unit's label", hint: "Usually inside the front panel door. Get close and make sure it's sharp.", kind: "photo", required: true },
      { step: "hatch_or_closet_measurement", title: "Measure the opening", hint: "Hold a tape measure across the closet door or attic hatch and take a photo we can read.", kind: "photo" },
    ],
  },
  {
    id: "water_heater",
    title: "Your water heater",
    lead: "Show us the tank and the space around it.",
    forTypes: ["heat_pump_water_heater"],
    captures: [
      { step: "water_heater", title: "Film the water heater and the space around it", hint: "Show the floor, ceiling, and the pipes on top.", kind: "video", required: true },
      { step: "indoor_data_plate", title: "Photo of the tank's label", hint: "The sticker with the model number and size in gallons.", kind: "photo", required: true },
      { step: "door_width_measurement", title: "Photo of the door opening with a tape measure", hint: "Open the door all the way and stretch the tape across the narrowest part of the opening, inside the frame. Make sure we can read the number.", kind: "photo", required: true },
    ],
    fields: [
      { key: "door_width_in", label: "Door opening width (inches)", type: "number", required: true },
      { key: "door_height_in", label: "Door opening height (inches, if you can)", type: "number" },
    ],
    tip: "The new water heater has to fit through this door, so the width matters. Measure the opening, not the door itself.",
  },
  {
    id: "panel",
    title: "Your electrical panel",
    lead: "This tells us if your panel can power a new heat pump. Please don't skip it.",
    forTypes: ALL,
    choices: [
      {
        key: "service_lines",
        label: "How does power come to your house?",
        options: [
          ["overhead", "Overhead wires"],
          ["underground", "Underground"],
          ["unsure", "Not sure"],
        ],
      },
    ],
    captures: [
      { step: "panel_video", title: "Film the panel and the wall around it", hint: "Start a few steps back so we can see where it is, then move in close with the door open. About 10 seconds.", kind: "video", required: true },
      { step: "panel", title: "Photo of the panel with the door open", hint: "Show all the breakers. Don't remove any covers.", kind: "photo", required: true },
      { step: "panel_label", title: "Photo of the main breaker", hint: "The big breaker at the top, usually marked 100 or 200.", kind: "photo", required: true },
      { step: "service_lines", title: "Photo of where power enters the house", hint: "The wires or meter outside, near the panel.", kind: "photo" },
    ],
  },
  {
    id: "walkthrough",
    title: "Show us the distances",
    lead: "Film one walk from the outdoor unit to the indoor unit, then to the panel. Count your steps as you go.",
    forTypes: HVAC,
    fields: [
      { key: "steps_condenser_to_indoor", label: "Steps from outdoor unit to indoor unit", type: "number" },
      { key: "steps_indoor_to_panel", label: "Steps from indoor unit to the panel", type: "number" },
    ],
    captures: [{ step: "walkthrough", title: "Film the walk", hint: "Keep it to about 15 seconds. Normal walking pace is fine.", kind: "video" }],
  },
  {
    id: "ducts",
    title: "Your vents",
    lead: "Count the vents that blow air into rooms, and the larger grilles that pull air back in.",
    forTypes: ["ducted_heat_pump"],
    fields: [
      { key: "supply_register_count", label: "Vents that blow air (supply)", type: "number" },
      { key: "return_count", label: "Large return grilles", type: "number" },
    ],
    captures: [{ step: "return_grille", title: "Photo of a return grille with a tape measure", hint: "Hold the tape across it so we can read the size.", kind: "photo" }],
  },
  {
    id: "home",
    title: "A few quick details",
    lead: "Rough numbers are fine.",
    forTypes: ALL,
    fields: [
      { key: "square_feet", label: "Square feet", type: "number" },
      { key: "stories", label: "Number of stories", type: "number" },
      { key: "year_built", label: "Year built (if you know)", type: "number" },
      { key: "notes", label: "Anything else we should know?", type: "text" },
    ],
  },
];

function newId() {
  return crypto.randomUUID();
}

export default function CapturePage() {
  const [contractorId, setContractorId] = useState(DEFAULT_CONTRACTOR_ID);
  const [jobId, setJobId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) setContractorId(c);
  }, []);

  const jobType = (answers.job_type as JobType) || null;
  const steps = useMemo(
    () => STEPS.filter((s) => !s.forTypes || (jobType && s.forTypes.includes(jobType))),
    [jobType]
  );
  const step = steps[index];
  const isLast = !!jobType && index === steps.length - 1;

  function set(key: string, value: string) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  function missing(): string | null {
    for (const f of step.fields ?? []) if (f.required && !answers[f.key]?.trim()) return f.label;
    for (const c of step.choices ?? []) if (step.id === "contact" && !answers[c.key]) return c.label;
    for (const cap of step.captures ?? [])
      if (cap.required && !uploads.some((u) => u.step === cap.step && u.status === "done")) return cap.title;
    if (uploads.some((u) => u.status === "uploading")) return "wait for uploads to finish";
    return null;
  }

  async function ensureJob(): Promise<string> {
    if (jobId) return jobId;
    const id = newId();
    const { error } = await supabase.from("jobs").insert({ id, contractor_id: contractorId, status: "capturing" });
    if (error) throw error;
    setJobId(id);
    return id;
  }

  async function saveAnswers(submit = false) {
    const id = await ensureJob();
    const { error } = await supabase.rpc("update_job_answers", { p_job_id: id, p_answers: answers, p_submit: submit });
    if (error) throw error;
  }

  function patchUpload(id: string, patch: Partial<Upload>) {
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  // `files` must already be a plain array: iPhone Safari empties the input's FileList
  // as soon as the input is reset, which silently dropped every upload before.
  async function onFiles(cap: Capture, files: File[]) {
    if (!files.length) return;
    setError(null);
    let id: string;
    try {
      id = await ensureJob();
    } catch {
      setError("Couldn't connect. Check your signal and try again.");
      return;
    }
    for (const file of files) {
      const uid = newId();
      const kind: Upload["kind"] = file.type.startsWith("video") ? "video" : "photo";
      setUploads((u) => [...u, { id: uid, step: cap.step, kind, preview: URL.createObjectURL(file), status: "uploading" }]);
      if (file.size > 50 * 1024 * 1024) {
        patchUpload(uid, { status: "failed", message: "Too long. Record 15 seconds or less." });
        continue;
      }
      try {
        const ext = (file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg")).toLowerCase();
        const path = `jobs/${id}/${cap.step}-${Date.now()}.${ext}`;
        const up = await supabase.storage.from("job-media").upload(path, file, { contentType: file.type || undefined });
        if (up.error) throw up.error;
        const rec = await supabase.from("job_media").insert({ job_id: id, step: cap.step, kind, storage_path: path });
        if (rec.error) throw rec.error;
        patchUpload(uid, { status: "done" });
      } catch {
        patchUpload(uid, { status: "failed", message: "Didn't upload. Tap to retake." });
      }
    }
  }

  function removeUpload(id: string) {
    setUploads((list) => list.filter((u) => u.id !== id));
  }

  async function next() {
    const m = missing();
    if (m) return setError(`Please complete: ${m}`);
    setError(null);
    setBusy("next");
    try {
      await saveAnswers(isLast);
      if (isLast) setSubmitted(true);
      else {
        setIndex((i) => i + 1);
        window.scrollTo(0, 0);
      }
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  if (submitted) {
    return (
      <main className="wrap done">
        <div className="done-badge" aria-hidden="true">✓</div>
        <h1>You're all set, {answers.first_name}.</h1>
        <p className="lead">
          We're reviewing your photos and videos now. You'll get your quote by text and email, usually the same day.
        </p>
      </main>
    );
  }

  const total = jobType ? steps.length : null;
  const pct = total ? ((index + 1) / total) * 100 : 8;

  return (
    <>
      <header className="topbar">
        <div className="topbar-row">
          <span className="brand">Home Hire</span>
          <span className="stepcount">{total ? `Step ${index + 1} of ${total}` : "Getting started"}</span>
        </div>
        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      </header>

      <main className="wrap">
        <h1>{step.title}</h1>
        <p className="lead">{step.lead}</p>

        {step.choices?.map((c) => (
          <section className="card" key={c.key}>
            <h2>{c.label}</h2>
            <div className="options">
              {c.options.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`option ${answers[c.key] === value ? "on" : ""}`}
                  onClick={() => set(c.key, value)}
                >
                  <span className="radio" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </section>
        ))}

        {step.captures?.map((cap) => {
          const mine = uploads.filter((u) => u.step === cap.step);
          const done = mine.some((u) => u.status === "done");
          const uploading = mine.some((u) => u.status === "uploading");
          return (
            <section className={`card capture-card ${done ? "complete" : ""}`} key={cap.step}>
              <div className="capture-head">
                <span className={`check ${done ? "on" : ""}`} aria-hidden="true">{done ? "✓" : ""}</span>
                <div>
                  <h2>{cap.title}</h2>
                  <span className={`tag ${cap.required ? "req" : ""}`}>{cap.required ? "Required" : "Optional"}</span>
                </div>
              </div>
              <p>{cap.hint}</p>

              {mine.length > 0 && (
                <div className="shots">
                  {mine.map((u) => (
                    <div key={u.id} className={`shot ${u.status}`}>
                      {u.kind === "video" ? (
                        <video src={u.preview} muted playsInline preload="metadata" />
                      ) : (
                        <img src={u.preview} alt="" />
                      )}
                      <span className="shot-status">
                        {u.status === "uploading" ? "Uploading…" : u.status === "done" ? "✓ Saved" : u.message}
                      </span>
                      {u.status === "failed" && (
                        <button type="button" className="shot-x" aria-label="Remove" onClick={() => removeUpload(u.id)}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <label className={`capture ${done ? "again" : ""}`}>
                <input
                  type="file"
                  accept={cap.kind === "video" ? "video/*" : "image/*"}
                  capture="environment"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    onFiles(cap, files);
                  }}
                />
                <span className="capture-icon" aria-hidden="true">{cap.kind === "video" ? "●" : "◉"}</span>
                {uploading ? "Uploading…" : done ? (cap.kind === "video" ? "Record another" : "Add another photo") : cap.kind === "video" ? "Record video" : "Take photo"}
              </label>
            </section>
          );
        })}

        {step.fields && (
          <section className="card">
            {step.fields.map((f) => (
              <div className="field-wrap" key={f.key}>
                <label className="field" htmlFor={f.key}>{f.label}</label>
                <input
                  id={f.key}
                  type={f.type}
                  inputMode={f.type === "number" ? "decimal" : f.type === "tel" ? "tel" : undefined}
                  autoComplete={AUTOCOMPLETE[f.key]}
                  value={answers[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </div>
            ))}
          </section>
        )}

        {step.tip && <p className="tip">{step.tip}</p>}
        {error && <p className="warn" role="alert">{error}</p>}
      </main>

      <nav className="nav">
        <div className="row">
          {index > 0 && (
            <button className="secondary" onClick={() => { setError(null); setIndex((i) => i - 1); window.scrollTo(0, 0); }}>
              Back
            </button>
          )}
          <button className="primary" disabled={busy === "next"} onClick={next}>
            {busy === "next" ? "Saving…" : isLast ? "Send for my quote" : "Next"}
          </button>
        </div>
      </nav>
    </>
  );
}

const AUTOCOMPLETE: Record<string, string> = {
  first_name: "given-name",
  last_name: "family-name",
  phone: "tel",
  email: "email",
  street: "address-line1",
  city: "address-level2",
  zip: "postal-code",
};
