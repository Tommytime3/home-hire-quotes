"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Login, useSession } from "../../../lib/auth";
import { AdminShell } from "../../../lib/AdminShell";
import { useContractor, monthlyPayment } from "../../../lib/contractor";
import { EquipmentArt } from "../../../lib/illustrations";
import { label } from "../../../lib/labels";
import {
  CatalogItem, PriceItem, QuoteAdder, QuoteDraft, QuoteOption, SystemPrice, TIER_LABEL, Tier,
  adderAmount, defaultBullets, describeEquipment, guessTons, imageFor, inches, money, newDraft, optionMargin, optionTotals, pickEquipment,
} from "../../../lib/quote";

const SIZES = [2, 3, 4, 5];

function NumberInput({ value, onChange, step = 1, prefix }: { value: number; onChange: (n: number) => void; step?: number; prefix?: string }) {
  return (
    <span className="num">
      {prefix && <span className="num-prefix">{prefix}</span>}
      <input type="number" inputMode="decimal" step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} />
    </span>
  );
}

export default function QuoteBuilder() {
  const session = useSession();
  const co = useContractor(!!session);
  const [jobId, setJobId] = useState<string | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [job, setJob] = useState<Record<string, any> | null>(null);
  const [prices, setPrices] = useState<SystemPrice[]>([]);
  const [items, setItems] = useState<PriceItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setJobId(p.get("job"));
    setQuoteId(p.get("id"));
  }, []);

  useEffect(() => {
    if (!session || (!jobId && !quoteId)) return;
    (async () => {
      try {
        let existing: any = null;
        let jid = jobId;
        if (quoteId) {
          const { data } = await supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle();
          existing = data;
          jid = data?.job_id ?? null;
        }
        if (!jid) throw new Error("Job not found.");
        const { data: j } = await supabase.from("jobs").select("*").eq("id", jid).maybeSingle();
        if (!j) throw new Error("Job not found, or your account doesn't have access to it.");
        const [{ data: sp }, { data: pi }, { data: ce }] = await Promise.all([
          supabase.from("price_book_systems").select("job_type,tier,size_tons,price,includes").eq("contractor_id", j.contractor_id),
          supabase.from("price_book_items").select("code,label,price,unit,applies_to,kind,notes").eq("contractor_id", j.contractor_id),
          supabase.from("contractor_equipment").select("tier,dealer_cost,active,image_url,equipment_catalog(*)").eq("contractor_id", j.contractor_id),
        ]);
        const cat: CatalogItem[] = (ce ?? [])
          .filter((r: any) => r.active && r.equipment_catalog)
          .map((r: any) => ({ ...r.equipment_catalog, tier: r.tier, dealer_cost: r.dealer_cost, image_url: r.image_url ?? r.equipment_catalog.image_url }));
        if (!existing && !quoteId) {
          const { data: latest } = await supabase.from("quotes").select("*").eq("job_id", jid).order("created_at", { ascending: false }).limit(1);
          existing = latest?.[0] ?? null;
        }
        setJob(j);
        setPrices((sp as SystemPrice[]) ?? []);
        setItems((pi as PriceItem[]) ?? []);
        setCatalog(cat);
        if (existing) {
          setQuoteId(existing.id);
          setDraft({
            id: existing.id, status: existing.status, recommended: existing.recommended ?? null, size_tons: existing.size_tons,
            options: existing.options, adders: existing.adders, permit: Number(existing.permit), rebate: Number(existing.rebate),
            rebate_label: existing.rebate_label ?? "", notes: existing.notes ?? "", crew_hours: Number(existing.crew_hours ?? 8),
          });
        } else {
          setDraft(newDraft(j, (sp as SystemPrice[]) ?? [], (pi as PriceItem[]) ?? [], cat, guessTons(j.square_feet)));
        }
      } catch (e: any) {
        setError(e.message ?? "Couldn't load this quote.");
      }
    })();
  }, [session, jobId, quoteId]);

  const jobType: string = job?.job_type ?? "";
  const isDucted = jobType === "ducted_heat_pump";
  const adderChoices = useMemo(
    () => items.filter((i) => i.applies_to.includes(jobType) && i.kind === "adder" && !(draft?.adders ?? []).some((a) => a.code === i.code)),
    [items, jobType, draft?.adders]
  );

  if (session === undefined) return <AdminShell><p className="lead">Loading…</p></AdminShell>;
  if (!session) return <Login />;
  if (error) return <AdminShell back={{ href: "/admin", label: "All jobs" }}><p className="lead">{error}</p></AdminShell>;
  if (!job || !draft) return <AdminShell><p className="lead">Loading quote…</p></AdminShell>;

  const setOpt = (tier: Tier, patch: Partial<QuoteOption>) =>
    setDraft((d) => d && { ...d, options: d.options.map((o) => (o.tier === tier ? { ...o, ...patch } : o)) });

  function applyPicks(o: QuoteOption, picks: CatalogItem[]): Partial<QuoteOption> {
    const img = imageFor(picks);
    return {
      equipment_ids: picks.map((p) => p.id),
      equipment_text: picks.length ? describeEquipment(picks) : "",
      title: picks[0]?.brand ?? TIER_LABEL[o.tier],
      image_url: img.url,
      image_kind: img.kind,
      bullets: defaultBullets(picks, jobType),
    };
  }

  function changeSize(size: number) {
    setDraft((d) => {
      if (!d) return d;
      const rebate = d.rebate_label && isDucted ? Math.min(3000 * size, 10000) : d.rebate;
      return {
        ...d, size_tons: size, rebate,
        options: d.options.map((o) => {
          const price = prices.find((p) => p.job_type === jobType && p.tier === o.tier && Number(p.size_tons) === size);
          return { ...o, ...applyPicks(o, pickEquipment(catalog, o.tier, size, jobType)), enabled: !!price, base_price: Number(price?.price ?? 0) };
        }),
      };
    });
  }

  function chooseOutdoor(o: QuoteOption, outdoorId: string) {
    const outdoor = catalog.find((c) => c.id === outdoorId);
    if (!outdoor) return setOpt(o.tier, applyPicks(o, []));
    const sameSize = (c: CatalogItem) => c.category === "air_handler" && c.brand === outdoor.brand && Number(c.capacity_tons) === Number(outdoor.capacity_tons);
    const indoor = catalog.find((c) => sameSize(c) && c.series === outdoor.series) ?? catalog.find(sameSize);
    setOpt(o.tier, applyPicks(o, [outdoor, indoor].filter(Boolean) as CatalogItem[]));
  }

  const setAdder = (code: string, patch: Partial<QuoteAdder>) =>
    setDraft((d) => d && { ...d, adders: d.adders.map((a) => (a.code === code ? { ...a, ...patch } : a)) });

  async function save(goPrint = false) {
    if (!draft || !job) return;
    setSaving(true);
    setError(null);
    const row = {
      job_id: job.id, contractor_id: job.contractor_id, status: draft.status, recommended: draft.recommended, size_tons: draft.size_tons,
      options: draft.options, adders: draft.adders, permit: draft.permit, rebate: draft.rebate,
      rebate_label: draft.rebate_label || null, notes: draft.notes || null, crew_hours: draft.crew_hours,
    };
    const res = draft.id
      ? await supabase.from("quotes").update(row).eq("id", draft.id).select("id").single()
      : await supabase.from("quotes").insert(row).select("id").single();
    setSaving(false);
    if (res.error || !res.data) return setError("Couldn't save. Check your connection and try again.");
    setDraft((d) => d && { ...d, id: res.data.id });
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    if (job.status === "submitted") await supabase.from("jobs").update({ status: "in_review" }).eq("id", job.id);
    if (goPrint) window.location.href = `/admin/quote/print?id=${res.data.id}`;
    else if (!quoteId) window.history.replaceState(null, "", `/admin/quote?id=${res.data.id}`);
  }

  const name = [job.first_name, job.last_name].filter(Boolean).join(" ") || "Customer";
  const outdoorChoices = catalog
    .filter((c) => c.category === "heat_pump_outdoor" && Number(c.capacity_tons) === Number(draft.size_tons))
    .sort((a, b) => a.brand.localeCompare(b.brand));
  const tonsGuess = guessTons(job.square_feet);
  const financeReady = co?.finance_apr != null && !!co?.finance_months;

  return (
    <AdminShell back={{ href: `/admin/job?id=${job.id}`, label: name }}>
      <div className="qb-head">
        <div>
          <p className="eyebrow">Quote builder</p>
          <h1>{name}</h1>
          <p className="muted">{label("job_type", jobType)} · {[job.street, job.city].filter(Boolean).join(", ") || "No address"}{job.email ? ` · ${job.email}` : ""}</p>
        </div>
        <span className={`pill ${draft.status}`}>{draft.status === "draft" ? "Draft" : draft.status}</span>
      </div>

      {isDucted && (
        <section className="panel size-panel">
          <div>
            <h2>System size</h2>
            <p className="muted small">
              {tonsGuess ? `${job.square_feet.toLocaleString()} sq ft ≈ ${tonsGuess} ton by your rule of thumb. ` : ""}Check the old unit's label in the photos.
            </p>
          </div>
          <div className="seg">
            {SIZES.map((s) => (
              <button key={s} type="button" className={Number(draft.size_tons) === s ? "on" : ""} onClick={() => changeSize(s)}>{s} ton</button>
            ))}
          </div>
        </section>
      )}

      {!financeReady && (
        <p className="tip">Monthly prices appear once you add your financing terms in <a href="/admin/settings">Settings</a>.</p>
      )}

      <div className="est">
        {draft.options.map((o) => {
          const t = optionTotals(o, draft);
          const m = optionMargin(o, draft, catalog);
          const mo = financeReady ? monthlyPayment(t.afterRebate, co!.finance_apr, co!.finance_months) : null;
          const picked = o.equipment_ids.map((id) => catalog.find((c) => c.id === id)).filter(Boolean) as CatalogItem[];
          const outdoor = picked.find((p) => p.category === "heat_pump_outdoor");
          const handler = picked.find((p) => p.category === "air_handler");
          const isRec = draft.recommended === o.tier;
          return (
            <section key={o.tier} className={`est-col est-${o.tier} ${o.enabled ? "" : "off"}`}>
              <header className="est-band">
                <span>{TIER_LABEL[o.tier]}</span>
                <label className="band-switch">
                  <input type="checkbox" checked={o.enabled} onChange={(e) => setOpt(o.tier, { enabled: e.target.checked })} />
                  {o.enabled ? "Showing" : "Hidden"}
                </label>
              </header>

              <div className="est-photo">
                {o.image_url ? <img src={o.image_url} alt={o.title} /> : <EquipmentArt kind={o.image_kind ?? "heat_pump_outdoor"} />}
              </div>
              {!o.image_url && <p className="photo-hint">No photo yet. <a href="/admin/catalog">Add one in Catalog</a></p>}

              <input className="est-title" type="text" value={o.title} aria-label="Headline" onChange={(e) => setOpt(o.tier, { title: e.target.value })} />
              <button type="button" className={`rec ${isRec ? "on" : ""}`} onClick={() => setDraft((d) => d && { ...d, recommended: isRec ? null : o.tier })}>
                {isRec ? "★ Recommended" : "☆ Mark recommended"}
              </button>

              <div className="est-price">
                <div>
                  <span className="cap-sm">Total price</span>
                  <strong>{money(t.afterRebate)}</strong>
                  {draft.rebate > 0 && <span className="was">{money(t.beforeRebate)} before rebate</span>}
                </div>
                <div>
                  <span className="cap-sm accent">Or monthly</span>
                  <strong className="accent">{mo ? `${money(mo)}/mo` : "—"}</strong>
                  {mo && <span className="was">{co!.finance_months} mo at {co!.finance_apr}% APR</span>}
                </div>
              </div>

              <div className="est-body">
                {isDucted && (
                  <>
                    <label className="lbl">Equipment</label>
                    <select value={outdoor?.id ?? ""} onChange={(e) => chooseOutdoor(o, e.target.value)}>
                      <option value="">Choose an outdoor unit…</option>
                      {outdoorChoices.map((c) => (
                        <option key={c.id} value={c.id}>{c.brand} {c.model_number}{c.series ? ` · ${c.series}` : ""}{c.tier ? ` (${TIER_LABEL[c.tier]})` : ""}</option>
                      ))}
                    </select>
                    {picked.length > 0 && (
                      <p className="spec">
                        {picked.map((p) => `${p.model_number}: ${inches(p.width_in)}W × ${inches(p.depth_in)}D × ${inches(p.height_in)}H, ${p.weight_lb ?? "?"} lb`).join(" · ")}
                        {handler ? "" : " · No matched air handler in your catalog yet"}
                      </p>
                    )}
                  </>
                )}

                <label className="lbl">Card bullets (one per line)</label>
                <textarea rows={4} value={(o.bullets ?? []).join("\n")} onChange={(e) => setOpt(o.tier, { bullets: e.target.value.split("\n") })} />

                <label className="lbl">Equipment details on the PDF</label>
                <textarea rows={3} value={o.equipment_text} placeholder={jobType === "heat_pump_water_heater" ? "e.g. Rheem ProTerra 50-gallon heat pump water heater" : "Equipment description"} onChange={(e) => setOpt(o.tier, { equipment_text: e.target.value })} />

                {o.addons.length > 0 && (
                  <>
                    <label className="lbl">Add-ons included</label>
                    <div className="checks">
                      {o.addons.map((a, i) => (
                        <label key={a.code} className="check">
                          <input type="checkbox" checked={a.selected} onChange={(e) => setOpt(o.tier, { addons: o.addons.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)) })} />
                          <span>{a.label}</span>
                          <span className="amt">{a.price ? money(a.price) : "Free"}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}

                <label className="lbl">Base price</label>
                <NumberInput prefix="$" step={50} value={o.base_price} onChange={(n) => setOpt(o.tier, { base_price: n })} />

                <div className={`margin ${m.knownCost ? (m.pct >= 0.48 ? "good" : "low") : "unknown"}`}>
                  {m.knownCost
                    ? <>Your profit ≈ {money(m.profit)} ({Math.round(m.pct * 100)}%) · only you see this</>
                    : <>Add your equipment cost in Catalog to see profit</>}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <section className="panel">
        <h2>Job extras <span className="muted small">(added to every option)</span></h2>
        {draft.adders.length === 0 && <p className="muted small">None yet. Add anything this job needs.</p>}
        {draft.adders.map((a) => (
          <div key={a.code} className="adder">
            <span className="adder-name">{a.label}<small>{money(a.unit_price)}{a.unit === "flat" ? "" : ` ${a.unit.replace("_", " ")}`}</small></span>
            {a.unit !== "flat" && <NumberInput value={a.qty} onChange={(n) => setAdder(a.code, { qty: n })} />}
            <NumberInput prefix="$" step={50} value={a.unit_price} onChange={(n) => setAdder(a.code, { unit_price: n })} />
            <strong className="amt">{money(adderAmount(a))}</strong>
            <button className="x" aria-label={`Remove ${a.label}`} onClick={() => setDraft((d) => d && { ...d, adders: d.adders.filter((x) => x.code !== a.code) })}>×</button>
          </div>
        ))}
        <select
          value=""
          onChange={(e) => {
            const it = items.find((i) => i.code === e.target.value);
            if (it) setDraft((d) => d && { ...d, adders: [...d.adders, { code: it.code, label: it.label, unit: it.unit, unit_price: Number(it.price), qty: 1 }] });
          }}
        >
          <option value="">+ Add an extra…</option>
          {adderChoices.map((i) => <option key={i.code} value={i.code}>{i.label} ({money(i.price)})</option>)}
        </select>
      </section>

      <section className="panel grid2">
        <div>
          <h2>Fees & rebate</h2>
          <label className="lbl">Permit</label>
          <NumberInput prefix="$" step={50} value={draft.permit} onChange={(n) => setDraft((d) => d && { ...d, permit: n })} />
          <p className="muted small">Haul-away & recycling shows as <s>$500</s> FREE on the quote.</p>
          <label className="lbl">Rebate</label>
          <NumberInput prefix="$" step={100} value={draft.rebate} onChange={(n) => setDraft((d) => d && { ...d, rebate: n })} />
          <input type="text" placeholder="Rebate name, e.g. Silicon Valley Power rebate" value={draft.rebate_label} onChange={(e) => setDraft((d) => d && { ...d, rebate_label: e.target.value })} />
        </div>
        <div>
          <h2>Your numbers</h2>
          <label className="lbl">Crew hours (2 installers)</label>
          <NumberInput step={1} value={draft.crew_hours} onChange={(n) => setDraft((d) => d && { ...d, crew_hours: n })} />
          <p className="muted small">Only used for your profit estimate.</p>
          <label className="lbl">Note to the customer</label>
          <textarea rows={3} value={draft.notes} placeholder="e.g. Price assumes the existing line set can be reused." onChange={(e) => setDraft((d) => d && { ...d, notes: e.target.value })} />
        </div>
      </section>

      {error && <p className="warn">{error}</p>}

      <div className="savebar">
        <span className="muted small">{savedAt ? `Saved ${savedAt}` : "Not saved yet"}</span>
        <button className="btn ghost" disabled={saving} onClick={() => save(false)}>{saving ? "Saving…" : "Save draft"}</button>
        <button className="btn" disabled={saving} onClick={() => save(true)}>Preview PDF</button>
      </div>
    </AdminShell>
  );
}
