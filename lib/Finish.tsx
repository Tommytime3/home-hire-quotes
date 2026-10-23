"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

type Estimate = {
  low: number | null;
  high: number | null;
  rebate: number;
  rebate_label: string | null;
  utility?: string | null;
  rebate_paid_to?: "contractor" | "homeowner" | null;
  rebate_reservation?: boolean | null;
  rebate_pitch?: string | null;
  utility_bonus?: number | null;
  utility_bonus_label?: string | null;
  utility_bonus_ends?: string | null;
  tons: number | null;
  gallons?: number | null;
  size_from?: string | null;
  existing_tons?: number | null;
  existing_gallons?: number | null;
  specialist?: string | null;
  bonus?: { label: string; value: number; expires_at: string; earned: boolean } | null;
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

function useCountdown(until?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return "0:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const shortDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function Finish({ jobId, firstName, city }: { jobId: string; firstName?: string; city?: string }) {
  const steps = stepsFor(city);
  const [shown, setShown] = useState(0);
  const [est, setEst] = useState<Estimate | null | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(null);
  const [laterOpen, setLaterOpen] = useState(false);
  const [earned, setEarned] = useState(false);
  const left = useCountdown(est?.bonus && !est.bonus.earned ? est.bonus.expires_at : null);

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
    const bonusOpen = !!est?.bonus && new Date(est.bonus.expires_at).getTime() > Date.now();
    await supabase.rpc("request_contact", { p_job_id: jobId, p_kind: kind, p_pref: pref ?? null });
    if (bonusOpen) setEarned(true);
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
  const specialist = est?.specialist ? `${est.specialist}, your rebate specialist` : "your rebate specialist";
  const talkTo = est?.specialist ? `Talk to ${est.specialist}` : "Talk to a rebate specialist";
  const hasRange = est && est.low != null && est.high != null;
  const same = hasRange && Math.abs(est!.high! - est!.low!) < 1;
  const afterRebate = hasRange && est!.rebate > 0 ? Math.max(0, est!.low! - est!.rebate) : null;
  const phoneDigits = String(est?.phone ?? "").replace(/[^\d+]/g, "");
  const bonus = est?.bonus;
  const bonusEarned = earned || !!bonus?.earned;
  const bonusLive = !!bonus && !bonusEarned && left !== "0:00:00";

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
          <p className="est-fine">
            Includes permit and haul-away. Your exact, locked price comes after we look over your photos.
          </p>
        </section>
      ) : (
        <p className="lead">We're putting your quote together now and will send it soon.</p>
      )}

      {/* Rebates: only real, published programs for their city */}
      <section className="rebate-card">
        <span className="est-cap">Your rebates{est?.utility ? `: ${est.utility}` : ""}</span>
        {est?.utility && est.rebate > 0 ? (
          <>
            <p className="rebate-amt">
              Up to <b>{money(est.rebate)}</b> back
              {afterRebate !== null && <> · as low as <b>{money(afterRebate)}</b></>}
            </p>
            {est.utility_bonus && est.utility_bonus > 0 && est.utility_bonus_ends ? (
              <p className="rebate-extra">⏳ {est.utility_bonus_label} (ends {shortDate(est.utility_bonus_ends)})</p>
            ) : null}
            {est.rebate_pitch && <p className="rebate-pitch">{est.rebate_pitch}</p>}
            <p className="rebate-fine">
              Rebates are set by {est.utility} and can change. {est.specialist || "We"} will confirm yours before you sign
              {est.rebate_paid_to === "homeowner" ? ", and we file the paperwork so the check comes to you." : "."}
            </p>
          </>
        ) : (
          <>
            <p className="rebate-amt">We'll check what your utility offers.</p>
            <p className="rebate-pitch">Many Bay Area utilities pay for switching to a heat pump. {est?.specialist || "Our rebate specialist"} will look up every rebate you qualify for and handle the paperwork.</p>
          </>
        )}
      </section>

      {bonus && (bonusLive || bonusEarned) && (
        <section className={`bonus ${bonusEarned ? "won" : ""}`}>
          {bonusEarned ? (
            <p><b>🎁 You got it: {bonus.label.toLowerCase()} with your install</b> ({money(bonus.value)} installed value). We'll add it to your quote.</p>
          ) : (
            <>
              <p><b>🎁 {bonus.label} with your install</b> ({money(bonus.value)} installed value)</p>
              <p className="bonus-sub">Talk with {est?.specialist || "our rebate specialist"} in the next <b className="clock">{left}</b> to claim it.</p>
            </>
          )}
        </section>
      )}

      {picked === "video" && <p className="confirm">Opening the video call. If it didn't open, tap the button again.</p>}
      {picked === "call" && <p className="confirm">Calling {company}…</p>}
      {(picked === "later" || picked === "text") && (
        <p className="confirm">Got it. {est?.specialist || company} will {picked === "text" ? "text you your quote" : "call you back"} soon.</p>
      )}

      <section className="connect">
        <h2 className="connect-h">{est?.specialist ? `${talkTo}, your rebate specialist` : talkTo}</h2>
        <p className="connect-sub">
          Get your exact price and every rebate you qualify for.
          {est?.rebate_paid_to === "contractor" ? " We front your rebate, so the sooner you sign, the sooner we install and file it." : ""}
          {est?.rebate_reservation ? " Your rebate has to be reserved before install, and we file the reservation the day you sign." : ""}
        </p>
        {est?.available && est.meet_link ? (
          <>
            <p className="online"><span className="live" aria-hidden="true" /> {est.specialist || company} is online now</p>
            <a className="cta video" href={est.meet_link} target="_blank" rel="noreferrer" onClick={() => contact("video")}>
              🎥 Video chat now
              <small>Face to face in 1 tap, no app needed</small>
            </a>
          </>
        ) : null}

        {phoneDigits && (
          <a className={`cta ${est?.available ? "secondary" : "video"}`} href={`tel:${phoneDigits}`} onClick={() => contact("call")}>
            📞 Call {est?.specialist || "now"}
            <small>{est?.phone}</small>
          </a>
        )}

        <button className="cta secondary" onClick={() => setLaterOpen((v) => !v)}>
          📅 Call me later
        </button>
        {laterOpen && (
          <div className="later">
            {LATER.map(([k, l]) => (
              <button key={k} className="chip" onClick={() => { contact("later", l); setLaterOpen(false); }}>{k}</button>
            ))}
          </div>
        )}

        <button className="cta text" onClick={() => contact("text")}>Just text me my quote</button>
      </section>

      <section className="next">
        <h2>What happens next</h2>
        <ol>
          <li className="done">Photos and answers received</li>
          <li>{specialist.charAt(0).toUpperCase() + specialist.slice(1)} confirms your price and rebates</li>
          <li>You pick Good, Better, or Best and sign</li>
          <li>We pull the permit, install, and file your rebate</li>
        </ol>
      </section>
    </main>
  );
}
