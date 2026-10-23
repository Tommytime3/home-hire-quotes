"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { Login, useSession } from "../../../../lib/auth";
import { BrandMark } from "../../../../lib/AdminShell";
import { monthlyPayment } from "../../../../lib/contractor";
import { EquipmentArt } from "../../../../lib/illustrations";
import { QuoteAdder, QuoteOption, TIER_LABEL, adderAmount, money, optionTotals } from "../../../../lib/quote";

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

      <article className="doc">
        <header className="doc-head">
          <div className="doc-brand">
            {co.logo_url ? (
              <img src={co.logo_url} alt={company} className="doc-logo" />
            ) : (
              <>
                <span className="doc-mark"><BrandMark size={44} /></span>
                <div><strong>{company}</strong><span>Heating &amp; Air Conditioning</span></div>
              </>
            )}
          </div>
          <div className="doc-meta">
            <h1>Your comfort options</h1>
            <p>Quote #{quoteNo} · {fmt(created)}</p>
            <p>Valid through {fmt(validUntil)}</p>
          </div>
        </header>

        <section className="doc-for">
          <div>
            <span className="cap">Prepared for</span>
            <strong>{name}</strong>
            <span>{[job.street, job.city, job.zip].filter(Boolean).join(", ")}</span>
            <span>{[job.phone, job.email].filter(Boolean).join(" · ")}</span>
          </div>
          <div>
            <span className="cap">Project</span>
            <strong>
              {job.job_type === "heat_pump_water_heater" ? "Heat pump water heater replacement" : `${q.size_tons ? `${q.size_tons}-ton ` : ""}heat pump system replacement`}
            </strong>
            <span>Price is locked for this scope. Any change needs your written approval.</span>
          </div>
        </section>

        <section className={`cards n${options.length}`}>
          {options.map((o) => {
            const t = optionTotals(o, q);
            const mo = financeReady ? monthlyPayment(t.afterRebate, co.finance_apr, co.finance_months) : null;
            const bullets = (o.bullets ?? []).map((b) => b.trim()).filter(Boolean);
            return (
              <div key={o.tier} className={`card-opt est-${o.tier}`}>
                <div className="est-band"><span>{TIER_LABEL[o.tier]}</span></div>
                <div className="est-photo">
                  {o.image_url ? <img src={o.image_url} alt={o.title} /> : <EquipmentArt kind={o.image_kind ?? "heat_pump_outdoor"} />}
                </div>
                <h2>{o.title}</h2>
                <span className={`rec-badge ${q.recommended === o.tier ? "" : "hide"}`}>Recommended</span>
                <div className="est-price">
                  <div>
                    <span className="cap-sm">Total price</span>
                    <strong>{money(t.afterRebate)}</strong>
                  </div>
                  {mo && (
                    <div>
                      <span className="cap-sm accent">Or as low as</span>
                      <strong className="accent">{money(mo)}<small>/mo</small></strong>
                    </div>
                  )}
                </div>
                {Number(q.rebate) > 0 && <p className="card-rebate">{money(t.beforeRebate)} minus {money(q.rebate)} {q.rebate_label || "rebate"}</p>}
                <ul className="card-bullets">
                  {bullets.map((b) => <li key={b}>{b}</li>)}
                  {o.addons.filter((a) => a.selected).map((a) => <li key={a.code}>{a.label} included</li>)}
                </ul>
                <p className="card-equip">{o.equipment_text}</p>
              </div>
            );
          })}
        </section>
        {financeReady && (
          <p className="fine center">
            Monthly payments are estimates based on {co.finance_months} monthly payments at {co.finance_apr}% APR
            {co.finance_lender ? ` through ${co.finance_lender}` : ""}, after any rebate shown. Subject to credit approval; your rate and terms may differ.
          </p>
        )}

        <section className="doc-cols">
          <div>
            <h3>Included with every option</h3>
            <ul className="ticks">
              {includeList.map((s) => <li key={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</li>)}
              <li>Haul-away &amp; recycling of old equipment <s>$500</s> <b>FREE</b></li>
              {Number(q.permit) > 0 && <li>City permit and inspection ({money(q.permit)}, included in prices above)</li>}
              {adders.map((a: QuoteAdder) =>
                a.unit_price === 0 && a.value
                  ? <li key={a.code}>{a.label} <s>{money(a.value)}</s> <b>FREE</b></li>
                  : <li key={a.code}>{a.label}{a.qty > 1 ? ` × ${a.qty}` : ""} ({money(adderAmount(a))}, included above)</li>)}
              <li>Manufacturer warranty registration, done for you</li>
              <li>{company} 2-year labor warranty</li>
            </ul>
          </div>
          <div>
            <h3>Optional add-ons</h3>
            <ul className="plain">
              {(options[0]?.addons ?? []).filter((a) => a.price > 0).map((a) => (
                <li key={a.code}><span>{a.label}</span><span>{money(a.price)}</span></li>
              ))}
            </ul>
            {Number(q.rebate) > 0 && (
              <p className="rebate-note"><b>{q.rebate_label || "Rebate"}: {money(q.rebate)}.</b> {/silicon valley power/i.test(q.rebate_label ?? "") ? "We handle the paperwork and the utility pays us directly, so you never front it." : "We file the paperwork for you; the utility sends your rebate check."}</p>
            )}
            {q.notes && <p className="doc-note">{q.notes}</p>}
          </div>
        </section>

        <section className="doc-terms">
          <h3>Next steps</h3>
          <ol>
            <li>Pick your option and sign. A deposit of 10% or $1,000, whichever is less, locks in your price and install date.</li>
            <li>We pull the permit and schedule your install, usually within days.</li>
            <li>The balance is due when the system is installed, started up, and running.</li>
          </ol>
          <p className="fine">
            This quote is based on the photos, videos, and answers you provided. If we find a condition on install day that
            changes the work, we'll explain it and get your written approval before doing anything extra. You have the
            right to cancel as described in your contract.
          </p>
        </section>

        <footer className="doc-foot">
          <span>{co.name}</span>
          <span>{co.license_number ? `CSLB Lic. #${co.license_number}` : <em className="no-print-hint">Add your CSLB license # in Settings before sending</em>}</span>
          <span>{[co.phone, co.website].filter(Boolean).join(" · ")}</span>
        </footer>
      </article>
    </div>
  );
}
