"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Login, useSession } from "../../../lib/auth";
import { AdminShell } from "../../../lib/AdminShell";
import { useContractor } from "../../../lib/contractor";
import { EquipmentArt } from "../../../lib/illustrations";
import { TIER_LABEL, Tier, inches } from "../../../lib/quote";

type Row = {
  equipment_id: string;
  tier: Tier | null;
  dealer_cost: number | null;
  image_url: string | null;
  notes: string | null;
  e: { id: string; category: string; brand: string; model_number: string; series: string | null; capacity_tons: number | null;
       seer2: number | null; hspf2: number | null; width_in: number | null; depth_in: number | null; height_in: number | null;
       weight_lb: number | null; image_url: string | null };
};

const CATEGORY: Record<string, string> = {
  heat_pump_outdoor: "Outdoor units", air_handler: "Air handlers", heat_pump_water_heater: "Water heaters",
  furnace: "Furnaces", evaporator_coil: "Coils", ductless_outdoor: "Ductless outdoor", ductless_head: "Ductless heads",
};

export default function CatalogPage() {
  const session = useSession();
  const co = useContractor(!!session);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<string>("heat_pump_outdoor");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !co) return;
    supabase
      .from("contractor_equipment")
      .select("equipment_id,tier,dealer_cost,image_url,notes,e:equipment_catalog(*)")
      .eq("contractor_id", co.id)
      .then(({ data }) => setRows(((data as any[]) ?? []).sort((a, b) =>
        `${a.e.brand}${String(a.e.capacity_tons).padStart(4, "0")}`.localeCompare(`${b.e.brand}${String(b.e.capacity_tons).padStart(4, "0")}`))));
  }, [session, co]);

  async function update(r: Row, patch: Partial<Row>) {
    setBusy(r.equipment_id);
    const { error } = await supabase.from("contractor_equipment").update(patch).eq("contractor_id", co!.id).eq("equipment_id", r.equipment_id);
    setBusy(null);
    if (error) return setMsg("Couldn't save that change. Try again.");
    setRows((rs) => rs && rs.map((x) => (x.equipment_id === r.equipment_id ? { ...x, ...patch } : x)));
    setMsg("Saved");
    setTimeout(() => setMsg(null), 1500);
  }

  async function upload(r: Row, file: File | undefined, applyToSeries: boolean) {
    if (!file || !co) return;
    setBusy(r.equipment_id);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${co.id}/equipment/${r.equipment_id}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("brand-assets").upload(path, file, { contentType: file.type, upsert: true });
    if (up.error) { setBusy(null); return setMsg("Photo didn't upload. Use a JPG or PNG under 5 MB."); }
    const url = supabase.storage.from("brand-assets").getPublicUrl(path).data.publicUrl;
    // One photo usually covers the whole series (e.g. every AUX Regular outdoor unit looks the same).
    const targets = applyToSeries
      ? (rows ?? []).filter((x) => x.e.brand === r.e.brand && x.e.series === r.e.series && x.e.category === r.e.category)
      : [r];
    for (const t of targets) {
      await supabase.from("contractor_equipment").update({ image_url: url }).eq("contractor_id", co.id).eq("equipment_id", t.equipment_id);
    }
    setRows((rs) => rs && rs.map((x) => (targets.some((t) => t.equipment_id === x.equipment_id) ? { ...x, image_url: url } : x)));
    setBusy(null);
    setMsg(targets.length > 1 ? `Photo added to ${targets.length} matching units` : "Photo added");
    setTimeout(() => setMsg(null), 2500);
  }

  if (session === undefined) return <AdminShell><p className="lead">Loading…</p></AdminShell>;
  if (!session) return <Login />;

  const cats = Array.from(new Set((rows ?? []).map((r) => r.e.category)));
  const list = (rows ?? []).filter((r) => r.e.category === filter);

  return (
    <AdminShell>
      <div className="admin-head">
        <div>
          <p className="eyebrow">Catalog</p>
          <h1>Your equipment</h1>
          <p className="muted">Add a photo and your cost for each unit. Photos show on quote cards; costs stay private and power your profit numbers.</p>
        </div>
      </div>

      <div className="seg wrap-seg">
        {cats.map((c) => (
          <button key={c} className={filter === c ? "on" : ""} onClick={() => setFilter(c)}>{CATEGORY[c] ?? c}</button>
        ))}
      </div>
      {msg && <p className="toast" role="status">{msg}</p>}
      {rows === null && <p className="lead">Loading equipment…</p>}

      <div className="cat-list">
        {list.map((r) => {
          const img = r.image_url ?? r.e.image_url;
          return (
            <section key={r.equipment_id} className="cat-row">
              <div className="cat-photo">
                {img ? <img src={img} alt={`${r.e.brand} ${r.e.model_number}`} /> : <EquipmentArt kind={r.e.category} />}
                <label className="cat-upload">
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(ev) => upload(r, ev.target.files?.[0], true)} />
                  {busy === r.equipment_id ? "Uploading…" : img ? "Change photo" : "Add photo"}
                </label>
              </div>
              <div className="cat-info">
                <h2>{r.e.brand} <span>{r.e.model_number}</span></h2>
                <p className="muted small">
                  {[r.e.series, r.e.capacity_tons && `${r.e.capacity_tons} ton`, r.e.seer2 && `${r.e.seer2} SEER2`, r.e.hspf2 && `${r.e.hspf2} HSPF2`].filter(Boolean).join(" · ")}
                </p>
                <p className="muted small">
                  {inches(r.e.width_in)}W × {inches(r.e.depth_in)}D × {inches(r.e.height_in)}H{r.e.weight_lb ? ` · ${r.e.weight_lb} lb` : ""}
                </p>
              </div>
              <div className="cat-edit">
                <label className="lbl">Tier</label>
                <select value={r.tier ?? ""} onChange={(e) => update(r, { tier: (e.target.value || null) as Tier | null })}>
                  <option value="">Not offered</option>
                  {(["good", "better", "best"] as Tier[]).map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
                </select>
                <label className="lbl">Your cost</label>
                <span className="num">
                  <span className="num-prefix">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    defaultValue={r.dealer_cost ?? ""}
                    placeholder="—"
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      if (v !== r.dealer_cost) update(r, { dealer_cost: v });
                    }}
                  />
                </span>
              </div>
            </section>
          );
        })}
      </div>
      <p className="muted small">A photo you add is used for every unit in the same series. Need a unit that isn't listed? Send me the spec sheet and I'll add it.</p>
    </AdminShell>
  );
}
