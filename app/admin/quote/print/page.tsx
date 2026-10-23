"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { Login, useSession } from "../../../../lib/auth";
import { BrandMark } from "../../../../lib/AdminShell";
import { monthlyPayment } from "../../../../lib/contractor";
import { EquipmentArt } from "../../../../lib/illustrations";
import { QuoteAdder, QuoteOption, TIER_LABEL, adderAmount, money, optionTotals } from "../../../../lib/quote";

// Small line icons for the quote (inline so they print sharp)
const svg = (d: React.ReactNode) => () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const Ico = {
  check: svg(<path d="M5 12.5l4.2 4.2L19 7" />),
  lock: svg(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>),
  home: svg(<><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /></>),
  gift: svg(<><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M12 9v11M4 13h16M12 9c-2-4-6-3-5 0M12 9c2-4 6-3 5 0" /></>),
  camera: svg(<><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8 7l1.5-2.5h5L16 7" /></>),
  doc: svg(<><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></>),
  bolt: svg(<path d="M13 3L5 13h6l-1 8 8-10h-6z" />),
  shield: svg(<><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M8.5 12l2.5 2.5L16 9.5" /></>),
};

export default function QuotePrint() {
  const session = useSession();
  const [q, setQ] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [co, setCo] = useState<any>(null);
  const [includes, setIncludes] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!session) return;
    const id = new URLSearchParams(window.location.search).get("id");
    (async () => {
      const { data: quote } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();
      if (!quote) return setErr("Quote not found.");
      const [{ data: j }, { data: c }, { data: sp }] = await Promise.all([
        supabase.from("jobs").select("*").eq("id", quote.job_id).maybeSingle(),
        supabase.from("contractors").select("*").eq("id", quote.contractor_id).maybeSingle(),
        supabase.from("price_book_systems").select("includes,job_type").eq("contractor_id", quote.contractor_id),
      ]);
      setQ(quote);
      setJob(j);
      setCo(c);
      setIncludes((sp ?? []).find((s: any) => s.job_type === j?.job_type)?.includes ?? "");
    })();
  }, [session]);

  if (session === undefined) return <p className="lead" style={{ padding: 24 }}>Loading…</p>;
  if (!session) return <Login />;
  if (err) return <p className="lead" style={{ padding: 24 }}>{err}</p>;
  if (!q || !job || !co) return <p className="lead" style={{ padding: 24 }}>Loading quote…</p>;

  const options: QuoteOption[] = (q.options ?? []).filter((o: QuoteOption) => o.enabled);
  const adders: QuoteAdder[] = q.adders ?? [];
  const name = [job.first_name, job.last_name].filter(Boolean).join(" ");
  const created = new Date(q.updated_at ?? q.created_at);
  const validUntil = new Date(created.getTime() + (q.valid_days ?? 20) * 86400000);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const quoteNo = String(q.id).slice(0, 8).toUpperCase();
  const includeList = includes.split(",").map((s) => s.trim()).filter((s) => s && !/haul-?away/i.test(s));
  const financeReady = co.finance_apr != null && !!co.finance_months;
  const company = co.display_name || "Comfort Air";
  const specialist = co.specialist_name || "us";
  const fmtShort = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const projectName = job.job_type === "heat_pump_water_heater" ? "Heat pump water heater" : `${q.size_tons ? `${q.size_tons}-ton ` : ""}heat pump system`;
  const mailBody = encodeURIComponent(
    `Hi ${job.first_name ?? ""},\n\nAttached is your ${company} quote with options to choose from. ` +
    `Reply here or call me with any questions, and I'm happy to walk you through it.\n\nThis quote is good through ${fmt(validUntil)}.\n\nTommy\n${co.name}`
  );

  async function markSent() {
    setMarking(true);
    await supabase.from("quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", q.id);
    await supabase.from("jobs").update({ status: "quoted" }).eq("id", job.id);
    setQ({ ...q, status: "sent" });
    setMarking(false);
  }

  return (
    <div className="ca print-wrap">
      <div className="print-tools no-print">
        <a className="btn ghost" href={`/admin/quote?id=${q.id}`}>← Edit</a>
        <button className="btn" onClick={() => window.print()}>Save as PDF / Print</button>
        <a className="btn ghost" href={`mailto:${job.email ?? ""}?subject=${encodeURIComponent(`Your ${company} quote`)}&body=${mailBody}`}>Email customer</a>
        <button className="btn ghost" disabled={marking || q.status === "sent"} onClick={markSent}>{q.status === "sent" ? "Marked as sent ✓" : "Mark as sent"}</button>
        <p className="muted small">In the print window choose "Save as PDF," then attach it to your email.</p>
      </div>

      <article className="qd">
        {/* Hero */}
        <header className="qd-hero">
          <div className="qd-hero-top">
            <div className="qd-logo">
              {co.logo_url ? <img src={co.logo_url} alt={company} /> : <span className="qd-logo-txt"><BrandMark size={34} /> {company}</span>}
            </div>
            <div className="qd-meta">
              <span>Quote #{quoteNo}</span>
              <span>{fmt(created)}</span>
            </div>
          </div>
          <p className="qd-hi">Hi {job.first_name || "there"},</p>
          <h1 className="qd-title">Here's your {projectName.toLowerCase()} quote.</h1>
          <p className="qd-sub">Priced from your photos, with no sales visit and no pressure. Pick the option that fits you.</p>
          <div className="qd-chips">
            <span className="qd-chip"><Ico.lock /> Price locked until {fmtShort(validUntil)}</span>
            <span className="qd-chip"><Ico.home /> {[job.street, job.city].filter(Boolean).join(", ") || "Your home"}</span>
            {Number(q.rebate) > 0 && <span className="qd-chip gold"><Ico.gift /> {money(q.rebate)} rebate applied</span>}
          </div>
        </header>

        {/* The promise */}
        <section className="qd-promise">
          {[
            [Ico.camera, "Priced from your photos", "No tape-measure sales visit"],
            [Ico.lock, "Locked in writing", "No surprise add-ons later"],
            [Ico.doc, "Permit & rebate handled", "We file all the paperwork"],
            [Ico.bolt, "Installed in days", "Most jobs done in one day"],
          ].map(([I, t, d]: any) => (
            <div key={t} className="qd-p"><span className="qd-p-ico"><I /></span><b>{t}</b><small>{d}</small></div>
          ))}
        </section>

        {/* Options */}
        <h2 className="qd-h2">Your options</h2>
        <section className={`qd-cards n${options.length}`}>
          {options.map((o) => {
            const t = optionTotals(o, q);
            const mo = financeReady ? monthlyPayment(t.afterRebate, co.finance_apr, co.finance_months) : null;
            const bullets = (o.bullets ?? []).map((b) => b.trim()).filter(Boolean);
            const rec = q.recommended === o.tier;
            return (
              <div key={o.tier} className={`qd-card t-${o.tier} ${rec ? "qd-rec" : ""}`}>
                {rec && <span className="qd-ribbon">★ Our pick</span>}
                <div className="qd-card-head">
                  <span className="qd-tier">{TIER_LABEL[o.tier]}</span>
                  <h3>{o.title}</h3>
                </div>
                <div className="qd-card-body">
                  <div className="qd-photo">
                    {o.image_url ? <img src={o.image_url} alt={o.title} /> : <EquipmentArt kind={o.image_kind ?? "heat_pump_outdoor"} />}
                  </div>
                  <div className="qd-price">
                    <span className="qd-cap">Your price</span>
                    <strong>{money(t.afterRebate)}</strong>
                    {Number(q.rebate) > 0 && <span className="qd-was">{money(t.beforeRebate)} − {money(q.rebate)} rebate</span>}
                    {mo && <span className="qd-mo">or {money(mo)}/mo</span>}
                  </div>
                  <ul className="qd-bul">
                    {bullets.map((b) => <li key={b}><Ico.check />{b}</li>)}
                    {o.addons.filter((a) => a.selected).map((a) => <li key={a.code}><Ico.check />{a.label} included</li>)}
                  </ul>
                  <p className="qd-equip">{o.equipment_text}</p>
                </div>
              </div>
            );
          })}
        </section>
        {financeReady && (
          <p className="qd-fine center">
            Monthly payments are estimates based on {co.finance_months} monthly payments at {co.finance_apr}% APR
            {co.finance_lender ? ` through ${co.finance_lender}` : ""}, after any rebate shown. Subject to credit approval; your rate and terms may differ.
          </p>
        )}

        {/* Included + add-ons */}
        <section className="qd-two">
          <div className="qd-box">
            <h2 className="qd-h3">Included with every option</h2>
            <ul className="qd-inc">
              {includeList.map((s) => <li key={s}><Ico.check />{s.charAt(0).toUpperCase() + s.slice(1)}</li>)}
              <li><Ico.check /><span>Haul-away &amp; recycling of old equipment <s>$500</s> <b className="free">FREE</b></span></li>
              {Number(q.permit) > 0 && <li><Ico.check />City permit and inspection ({money(q.permit)}, in your price)</li>}
              {adders.map((a: QuoteAdder) =>
                a.unit_price === 0 && a.value
                  ? <li key={a.code}><Ico.check /><span>{a.label} <s>{money(a.value)}</s> <b className="free">FREE</b></span></li>
                  : <li key={a.code}><Ico.check />{a.label}{a.qty > 1 ? ` × ${a.qty}` : ""} ({money(adderAmount(a))}, in your price)</li>)}
              <li><Ico.check />Manufacturer warranty registration, done for you</li>
              <li><Ico.check />{company} 2-year labor warranty</li>
            </ul>
          </div>
          <div className="qd-side">
            {Number(q.rebate) > 0 && (
              <div className="qd-rebate">
                <span className="qd-rebate-ico"><Ico.gift /></span>
                <div>
                  <b>{money(q.rebate)} {q.rebate_label || "rebate"}</b>
                  <p>{/silicon valley power/i.test(q.rebate_label ?? "")
                    ? "Already taken off your price. We file it and the utility pays us directly, so you never front it or wait on a check."
                    : "We file the paperwork for you, and the utility sends your rebate check."}</p>
                </div>
              </div>
            )}
            {(options[0]?.addons ?? []).some((a) => a.price > 0) && (
              <div className="qd-box">
                <h2 className="qd-h3">Optional add-ons</h2>
                <ul className="qd-add">
                  {(options[0]?.addons ?? []).filter((a) => a.price > 0).map((a) => (
                    <li key={a.code}><span>{a.label}</span><b>{money(a.price)}</b></li>
                  ))}
                </ul>
              </div>
            )}
            {q.notes && <div className="qd-note"><b>Note from {specialist}:</b> {q.notes}</div>}
          </div>
        </section>

        {/* Timeline */}
        <h2 className="qd-h2">What happens next</h2>
        <section className="qd-steps">
          {[
            ["1", "Pick & sign", "A deposit of 10% or $1,000, whichever is less, locks your price and install date."],
            ["2", "We pull the permit", "And schedule your install, usually within days."],
            ["3", "Install day", "Our crew installs, starts up, and tests everything. Most jobs take one day."],
            ["4", "Pay & relax", "The balance is due once it's installed and running. We file your rebate and warranty."],
          ].map(([n, t, d]) => (
            <div key={n} className="qd-step"><span className="qd-num">{n}</span><b>{t}</b><small>{d}</small></div>
          ))}
        </section>

        {/* Promise */}
        <section className="qd-guar">
          <span className="qd-guar-ico"><Ico.shield /></span>
          <div>
            <b>Our no-surprise promise</b>
            <p>
              This quote is based on the photos, videos, and answers you sent us. If we find something on install day that changes
              the work, we'll show you, explain it, and get your written approval before doing anything extra. No pressure, ever.
              You have the right to cancel as described in your contract.
            </p>
          </div>
        </section>

        <footer className="qd-foot">
          <div className="qd-ask">
            <b>Questions? Talk to {specialist}.</b>
            <span>{[co.phone && `Call or text ${co.phone}`, co.website].filter(Boolean).join(" · ")}</span>
          </div>
          <div className="qd-legal">
            <span>{co.name}</span>
            <span>{co.license_number ? `CSLB Lic. #${co.license_number}` : <em className="no-print-hint">Add your CSLB license # in Settings before sending</em>}</span>
            <span>Valid through {fmt(validUntil)}</span>
          </div>
        </footer>
      </article>
    </div>
  );
}
