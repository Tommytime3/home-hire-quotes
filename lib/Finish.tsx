"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

type Estimate = {
  low: number | null;
  high: number | null;
  rebate: number;
  rebate_label: string | null;
  tons: number | null;
  gallons?: number | null;
  size_from?: string | null;
  existing_tons?: number | null;
  existing_gallons?: number | null;
  company: string;
  phone: string | null;
  available: boolean;
  meet_link: string | null;
};

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

// Each step is real work done by the price estimate; the pacing just lets people read it.
function stepsFor(city?: string) {
  return [
    "Reading your equipment label",
    "Saving your photos and videos",
    "Matching the right equipment to your home",
    `Checking rebates${city ? ` in ${city}` : ""}`,
    "Pricing Good, Better, and Best options",
  ];
}

const LATER: [string, string][] = [
  ["Morning", "This morning or tomorrow morning"],
  ["Afternoon", "This afternoon"],
  ["Evening", "This evening"],
  ["Tomorrow", "Anytime tomorrow"],
];

export function Finish({ jobId, firstName, city }: { jobId: string; firstName?: string; city?: string }) {
  const steps = stepsFor(city);
  const [shown, setShown] = useState(0);
  const [est, setEst] = useState<Estimate | null | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(null);
  const [laterOpen, setLaterOpen] = useState(false);

  useEffect(() => {
    // Read the equipment label first (tank size, fuel) so the estimate is sized right.
    // Never hold the homeowner up more than 20 seconds for it.
    const read = supabase.functions.invoke("read-data-plate", { body: { job_id: jobId } }).catch(() => null);
    const timeout = new Promise((r) => setTimeout(r, 20000));
    Promise.race([read, timeout])
      .then(() => supabase.rpc("job_estimate", { p_job_id: jobId }))
      .then(({ data }) => setEst((data as Estimate) ?? null), () => setEst(null));
    const t = setInterval(() => setShown((n) => (n >= steps.length ? n : n + 1)), 1500);
    return () => clearInterval(t);
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function contact(kind: "video" | "call" | "later" | "text", pref?: string) {
    setPicked(kind);
    await supabase.rpc("request_contact", { p_job_id: jobId, p_kind: kind, p_pref: pref ?? null });
    supabase.functions.invoke("notify-new-job", { body: { job_id: jobId, event: "contact" } }).catch(() => {});
  }

  const analyzing = shown < steps.length || est === undefined;

  if (analyzing) {
    return (
      <main className="wrap finish">
        <div className="scan" aria-hidden="true"><span /></div>
        <h1>Building your estimate…</h1>
        <p className="lead">Hang tight, {firstName || "neighbor"}. This takes a few seconds.</p>
        <ol className="analyze" aria-live="polite">
          {steps.map((s, i) => (
            <li key={s} className={i < shown ? "done" : i === shown ? "now" : ""}>
              <span className="dot" aria-hidden="true">{i < shown ? "✓" : ""}</span>
              {s}
            </li>
          ))}
        </ol>
      </main>
    );
  }

  const company = est?.company ?? "our team";
  const hasRange = est && est.low != null && est.high != null;
  const same = hasRange && Math.abs(est!.high! - est!.low!) < 1;
  const afterRebate = hasRange && est!.rebate > 0 ? Math.max(0, est!.low! - est!.rebate) : null;
  const phoneDigits = String(est?.phone ?? "").replace(/[^\d+]/g, "");

  return (
    <main className="wrap finish">
      <p className="eyebrow-ok">✓ Photos and answers received</p>
      <h1>{hasRange ? `Your estimate is ready, ${firstName || "neighbor"}` : `Thanks, ${firstName || "neighbor"}. We've got everything.`}</h1>

      {hasRange ? (
        <section className="est-card">
          <span className="est-cap">Estimated price, installed</span>
          <strong className="est-range">{same ? `About ${money(est!.low!)}` : `${money(est!.low!)} – ${money(est!.high!)}`}</strong>
          {est!.tons && est!.size_from === "label" ? (
            <p className="est-size">
              Sized from your label: same as your {est!.existing_tons}-ton system{Number(est!.existing_tons) !== Number(est!.tons) ? ` (${est!.tons}-ton heat pump)` : ""}
            </p>
          ) : null}
          {est!.gallons ? (
            <p className="est-size">
              {est!.existing_gallons
                ? `Sized from your label: your ${est!.existing_gallons}-gallon tank → ${est!.gallons}-gallon heat pump water heater`
                : `Priced for a ${est!.gallons}-gallon heat pump water heater`}
            </p>
          ) : null}
          {afterRebate !== null && (
            <p className="est-rebate">
              With your {est!.rebate_label ?? "rebate"} ({money(est!.rebate)}): <b>as low as {money(afterRebate)}</b>
            </p>
          )}
          <p className="est-fine">
            Based on your answers, including permit and haul-away. Your exact, locked price comes after we look over your photos.
          </p>
        </section>
      ) : (
        <p className="lead">We're putting your quote together now and will send it soon.</p>
      )}

      {picked === "video" && <p className="confirm">Opening the video call. If it didn't open, tap the button again.</p>}
      {picked === "call" && <p className="confirm">Calling {company}…</p>}
      {(picked === "later" || picked === "text") && (
        <p className="confirm">Got it. {company} will {picked === "text" ? "text you your quote" : "call you back"} soon.</p>
      )}

      <section className="connect">
        {est?.available && est.meet_link ? (
          <>
            <p className="online"><span className="live" aria-hidden="true" /> {company} is online now</p>
            <a
              className="cta video"
              href={est.meet_link}
              target="_blank"
              rel="noreferrer"
              onClick={() => contact("video")}
            >
              🎥 Video chat now
              <small>Get your exact locked price, plus any same-day savings</small>
            </a>
          </>
        ) : null}

        {phoneDigits && (
          <a className={`cta ${est?.available ? "secondary" : "video"}`} href={`tel:${phoneDigits}`} onClick={() => contact("call")}>
            📞 Call now
            <small>{est?.phone}</small>
          </a>
        )}

        <button className="cta secondary" onClick={() => setLaterOpen((v) => !v)}>
          📅 Call me later
        </button>
        {laterOpen && (
          <div className="later">
            {LATER.map(([k, l]) => (
              <button key={k} className={`chip ${picked === "later" ? "" : ""}`} onClick={() => { contact("later", l); setLaterOpen(false); }}>{k}</button>
            ))}
          </div>
        )}

        <button className="cta text" onClick={() => contact("text")}>Just text me my quote</button>
      </section>

      <section className="next">
        <h2>What happens next</h2>
        <ol>
          <li className="done">Photos and answers received</li>
          <li>We review everything and lock in your exact price</li>
          <li>You pick Good, Better, or Best and sign</li>
          <li>We pull the permit and install, often within days</li>
        </ol>
      </section>
    </main>
  );
}
