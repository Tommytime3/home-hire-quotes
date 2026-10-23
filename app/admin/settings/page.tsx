"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Login, useSession } from "../../../lib/auth";
import { AdminShell } from "../../../lib/AdminShell";
import { Contractor, monthlyPayment, setContractorCache, useContractor } from "../../../lib/contractor";
import { money } from "../../../lib/quote";

type Form = Pick<Contractor, "display_name" | "license_number" | "phone" | "website" | "alert_email" | "finance_lender" | "finance_apr" | "finance_months" | "logo_url">;

export default function SettingsPage() {
  const session = useSession();
  const co = useContractor(!!session);
  const [f, setF] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (co) setF({
      display_name: co.display_name, license_number: co.license_number, phone: co.phone, website: co.website,
      alert_email: co.alert_email, finance_lender: co.finance_lender, finance_apr: co.finance_apr, finance_months: co.finance_months, logo_url: co.logo_url,
    });
  }, [co]);

  if (session === undefined) return <AdminShell><p className="lead">Loading…</p></AdminShell>;
  if (!session) return <Login />;
  if (!co || !f) return <AdminShell><p className="lead">Loading settings…</p></AdminShell>;

  const set = (k: keyof Form, v: any) => setF((x) => x && { ...x, [k]: v });

  async function save(patch: Partial<Form> = f!) {
    setSaving(true);
    const { data, error } = await supabase.from("contractors").update(patch).eq("id", co!.id).select("*").single();
    setSaving(false);
    if (error) return setMsg("Couldn't save. Only company admins can change settings.");
    setContractorCache(data as Contractor);
    setMsg("Saved");
    setTimeout(() => setMsg(null), 1500);
  }

  async function uploadLogo(file?: File) {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${co!.id}/logo-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("brand-assets").upload(path, file, { contentType: file.type });
    if (up.error) return setMsg("Logo didn't upload. Use a PNG, JPG, or SVG under 5 MB.");
    const url = supabase.storage.from("brand-assets").getPublicUrl(path).data.publicUrl;
    set("logo_url", url);
    await save({ logo_url: url });
  }

  const sample = monthlyPayment(12000, f.finance_apr, f.finance_months);

  return (
    <AdminShell>
      <div className="admin-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Company & quotes</h1>
        </div>
      </div>
      {msg && <p className="toast" role="status">{msg}</p>}

      <section className="panel">
        <h2>Logo</h2>
        <div className="logo-row">
          <div className="logo-preview">{f.logo_url ? <img src={f.logo_url} alt="Company logo" /> : <span className="muted small">No logo yet</span>}</div>
          <label className="btn ghost">
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => uploadLogo(e.target.files?.[0])} />
            {f.logo_url ? "Replace logo" : "Upload logo"}
          </label>
          {f.logo_url && <button className="btn ghost" onClick={() => { set("logo_url", null); save({ logo_url: null }); }}>Remove</button>}
        </div>
        <p className="muted small">A wide logo on a transparent or white background works best. It shows on your dashboard and every quote.</p>
      </section>

      <section className="panel grid2">
        <div>
          <h2>Company info</h2>
          <label className="lbl">Name on quotes</label>
          <input type="text" value={f.display_name ?? ""} onChange={(e) => set("display_name", e.target.value)} />
          <label className="lbl">CSLB license #</label>
          <input type="text" value={f.license_number ?? ""} onChange={(e) => set("license_number", e.target.value)} placeholder="Required on quotes and ads" />
          <label className="lbl">Phone</label>
          <input type="text" value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          <label className="lbl">Website</label>
          <input type="text" value={f.website ?? ""} onChange={(e) => set("website", e.target.value)} />
          <label className="lbl">New-job alerts go to</label>
          <input type="text" value={f.alert_email ?? ""} onChange={(e) => set("alert_email", e.target.value)} />
        </div>
        <div>
          <h2>Financing</h2>
          <p className="muted small">Used for the "or as low as $X/mo" price on each quote card. Leave blank to hide monthly prices.</p>
          <label className="lbl">Lender</label>
          <input type="text" value={f.finance_lender ?? ""} onChange={(e) => set("finance_lender", e.target.value)} placeholder="e.g. Hearth" />
          <label className="lbl">APR (%)</label>
          <input type="number" inputMode="decimal" step="0.01" value={f.finance_apr ?? ""} onChange={(e) => set("finance_apr", e.target.value === "" ? null : Number(e.target.value))} />
          <label className="lbl">Number of months</label>
          <input type="number" inputMode="numeric" value={f.finance_months ?? ""} onChange={(e) => set("finance_months", e.target.value === "" ? null : Number(e.target.value))} />
          {sample && <p className="tip">Example: a $12,000 job comes to about <b>{money(sample)}/mo</b>.</p>}
        </div>
      </section>

      <div className="savebar">
        <span className="muted small">Changes apply to new and existing quotes.</span>
        <button className="btn" disabled={saving} onClick={() => save()}>{saving ? "Saving…" : "Save settings"}</button>
      </div>
    </AdminShell>
  );
}
