// Quote building: types, defaults, and price math. All amounts in dollars.

export type Tier = "good" | "better" | "best";
export const TIERS: Tier[] = ["good", "better", "best"];
export const TIER_LABEL: Record<Tier, string> = { good: "Good", better: "Better", best: "Best" };

// Short selling points shown on each card, generated from the equipment and editable.
export function defaultBullets(items: CatalogItem[], jobType: string): string[] {
  const wh = items.find((i) => i.category === "heat_pump_water_heater");
  if (wh || jobType === "heat_pump_water_heater") {
    const w: string[] = [];
    if (wh?.gallons) w.push(`${wh.gallons}-gallon tank`);
    w.push("Up to 4x more efficient than a gas tank");
    if (wh?.brand === "Navien") w.push("Premium Navien build with smart Wi-Fi controls");
    if (wh?.brand === "Bradford White") w.push("Bradford White: sold only through licensed pros");
    if (wh?.brand === "Rheem") w.push("10-year tank and parts warranty");
    w.push("Qualifies for utility rebates");
    return w.slice(0, 4);
  }
  const outdoor = items.find((i) => i.category === "heat_pump_outdoor") ?? items[0];
  const b: string[] = [];
  if (!outdoor) return [];
  if (outdoor.seer2) b.push(`${outdoor.seer2} SEER2 cooling efficiency`);
  if (outdoor.hspf2) b.push(`${outdoor.hspf2} HSPF2 heating efficiency`);
  if (/inverter|SUZ|PUZ|MXZ/i.test(`${outdoor.series ?? ""} ${outdoor.model_number}`)) b.push("Quiet variable-speed inverter");
  if (outdoor.brand === "AUX") b.push("12-yr parts & compressor warranty when registered");
  if (outdoor.brand.startsWith("Mitsubishi")) b.push("Premium Mitsubishi Electric reliability");
  if (outdoor.brand === "Trane") b.push("Trusted Trane name brand");
  b.push("Installed in one day");
  return b.slice(0, 4);
}

export function imageFor(items: CatalogItem[]): { url: string | null; kind: string } {
  const outdoor = items.find((i) => i.category === "heat_pump_outdoor" || i.category === "heat_pump_water_heater") ?? items[0];
  return { url: outdoor?.image_url ?? null, kind: outdoor?.category ?? "heat_pump_outdoor" };
}

export type CatalogItem = {
  id: string;
  category: string;
  brand: string;
  model_number: string;
  series: string | null;
  capacity_tons: number | null;
  capacity_btu: number | null;
  gallons?: number | null;
  uef?: number | null;
  refrigerant: string | null;
  seer2: number | null;
  hspf2: number | null;
  width_in: number | null;
  depth_in: number | null;
  height_in: number | null;
  diameter_in?: number | null;
  weight_lb: number | null;
  min_circuit_amps: number | null;
  max_breaker_amps: number | null;
  image_url: string | null;
  tier: Tier | null;          // contractor's tier for this item
  dealer_cost: number | null; // contractor's cost
};

export type PriceItem = {
  code: string;
  label: string;
  price: number;
  unit: string;
  applies_to: string[];
  kind: "fee" | "adder" | "addon" | "included";
  notes: string | null;
};

export type SystemPrice = { job_type: string; tier: Tier; size_tons: number; price: number; includes: string | null };

export type QuoteAddon = { code: string; label: string; price: number; selected: boolean };
export type QuoteAdder = { code: string; label: string; unit: string; unit_price: number; qty: number };
export type QuoteOption = {
  tier: Tier;
  enabled: boolean;
  title: string;
  pitch: string;
  equipment_ids: string[];
  equipment_text: string;
  image_url?: string | null;
  image_kind?: string;        // which drawing to use when there's no photo
  bullets?: string[];
  base_price: number;
  addons: QuoteAddon[];
};

export type QuoteDraft = {
  id?: string;
  status: string;
  recommended: Tier | null;
  size_tons: number | null;
  options: QuoteOption[];
  adders: QuoteAdder[];
  permit: number;
  rebate: number;
  rebate_label: string;
  notes: string;
  crew_hours: number;
};

export const CREW_COST_PER_HOUR = 66; // two installers at about $33/hr each

export function money(n: number | null | undefined): string {
  const v = Math.round(Number(n ?? 0));
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}

export function inches(n: number | null | undefined): string {
  if (n === null || n === undefined) return "?";
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 16);
  if (frac === 0) return `${whole}"`;
  if (frac === 16) return `${whole + 1}"`;
  const g = gcd(frac, 16);
  return `${whole}-${frac / g}/${16 / g}"`;
}
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }

export function adderAmount(a: QuoteAdder): number {
  return Math.max(0, a.qty) * a.unit_price;
}

export function addersTotal(adders: QuoteAdder[]): number {
  return adders.reduce((s, a) => s + adderAmount(a), 0);
}

export function optionTotals(o: QuoteOption, q: Pick<QuoteDraft, "adders" | "permit" | "rebate">) {
  const addons = o.addons.filter((a) => a.selected).reduce((s, a) => s + a.price, 0);
  const adders = addersTotal(q.adders);
  const beforeRebate = o.base_price + addons + adders + q.permit;
  return { addons, adders, beforeRebate, afterRebate: Math.max(0, beforeRebate - q.rebate) };
}

export function optionMargin(o: QuoteOption, q: QuoteDraft, catalog: CatalogItem[]) {
  const t = optionTotals(o, q);
  const equipment = o.equipment_ids.reduce((s, id) => s + Number(catalog.find((c) => c.id === id)?.dealer_cost ?? 0), 0);
  const knownCost = o.equipment_ids.some((id) => catalog.find((c) => c.id === id)?.dealer_cost != null);
  const labor = q.crew_hours * CREW_COST_PER_HOUR;
  const revenue = t.beforeRebate - q.permit; // the permit is a pass-through fee
  const profit = revenue - equipment - labor;
  return { equipment, labor, revenue, profit, pct: revenue > 0 ? profit / revenue : 0, knownCost };
}

export function describeEquipment(items: CatalogItem[]): string {
  const wh = items.find((i) => i.category === "heat_pump_water_heater");
  if (wh) {
    const name = [wh.brand, wh.series].filter(Boolean).join(" ");
    return `${name} ${wh.gallons ? `${wh.gallons}-gallon ` : ""}heat pump water heater (${wh.model_number})${wh.uef ? `. ${wh.uef} UEF.` : "."}`;
  }
  const outdoor = items.find((i) => i.category === "heat_pump_outdoor" || i.category === "ductless_outdoor");
  const indoor = items.find((i) => i.category === "air_handler" || i.category === "furnace");
  const parts: string[] = [];
  if (outdoor) {
    const tons = outdoor.capacity_tons ? `${outdoor.capacity_tons}-ton ` : "";
    const inverter = /inverter|SUZ|PUZ|MXZ/i.test(`${outdoor.series ?? ""} ${outdoor.model_number}`);
    parts.push(`${outdoor.brand} ${tons}${inverter ? "inverter " : ""}heat pump (${outdoor.model_number})`);
  }
  if (indoor) parts.push(`matched air handler (${indoor.model_number})`);
  const other = items.filter((i) => i !== outdoor && i !== indoor);
  other.forEach((i) => parts.push(`${i.brand} ${i.model_number}`));
  const r = outdoor ?? items[0];
  const specs = [r?.seer2 && `${r.seer2} SEER2`, r?.hspf2 && `${r.hspf2} HSPF2`, r?.refrigerant].filter(Boolean).join(", ");
  return parts.join(" with ") + (specs ? `. ${specs}.` : ".");
}

const WH_PITCH: Record<Tier, string> = {
  good: "A proven heat pump water heater at the best price, with big savings over gas.",
  better: "A trusted pro-only brand with a great balance of efficiency and value.",
  best: "Our premium choice: top efficiency, quiet operation, and smart controls from your phone.",
};

const DEFAULT_PITCH: Record<Tier, string> = {
  good: "Reliable, efficient inverter comfort at the best price, backed by a long manufacturer warranty.",
  better: "A trusted name-brand system with a great balance of comfort, efficiency, and value.",
  best: "Our premium choice: the quietest, smoothest comfort with surge protection and cleaner air included.",
};

// Build a fresh draft from the price book, the catalog, and the homeowner's answers.
export function newDraft(job: Record<string, any>, prices: SystemPrice[], items: PriceItem[], catalog: CatalogItem[], sizeGuess: number | null): QuoteDraft {
  const jobType: string = job.job_type;
  const size = jobType === "heat_pump_water_heater" ? 0 : sizeGuess ?? 3;
  const forJob = items.filter((i) => i.applies_to.includes(jobType));
  const addonItems = forJob.filter((i) => i.kind === "addon");

  const options: QuoteOption[] = TIERS.map((tier) => {
    const price = prices.find((p) => p.job_type === jobType && p.tier === tier && Number(p.size_tons) === Number(size));
    const picks = pickEquipment(catalog, tier, size, jobType, job.existing_gallons);
    return {
      tier,
      enabled: !!price || jobType === "heat_pump_water_heater",
      title: picks.length ? `${picks[0].brand}` : TIER_LABEL[tier],
      pitch: jobType === "heat_pump_water_heater" ? WH_PITCH[tier] : DEFAULT_PITCH[tier],
      equipment_ids: picks.map((p) => p.id),
      equipment_text: picks.length ? describeEquipment(picks) : "",
      image_url: imageFor(picks).url,
      image_kind: jobType === "heat_pump_water_heater" ? "heat_pump_water_heater" : imageFor(picks).kind,
      bullets: defaultBullets(picks, jobType),
      base_price: Number(price?.price ?? 0),
      // Best bundles every add-on; Good and Better offer them as options.
      addons: addonItems.map((a) => ({ code: a.code, label: a.label, price: Number(a.price), selected: tier === "best" && a.price > 0 })),
    };
  });

  const adders: QuoteAdder[] = [];
  const add = (code: string, qty = 1) => {
    const it = forJob.find((i) => i.code === code);
    if (it && !adders.some((a) => a.code === code)) adders.push({ code, label: it.label, unit: it.unit, unit_price: Number(it.price), qty });
  };
  if (job.indoor_location === "attic_tight") add("attic_platform");
  if (job.indoor_location === "rooftop") add("crane");

  const permit = Number(items.find((i) => i.code === "permit")?.price ?? 0);
  const svp = /santa\s*clara/i.test(String(job.city ?? ""));
  let rebate = 0;
  let rebate_label = "";
  if (svp && jobType === "heat_pump_water_heater") { rebate = 5500; rebate_label = "Silicon Valley Power rebate"; }
  if (svp && jobType === "ducted_heat_pump") { rebate = Math.min(3000 * size, 10000); rebate_label = "Silicon Valley Power rebate"; }

  return { status: "draft", recommended: "better", size_tons: size || null, options, adders, permit, rebate, rebate_label, notes: "", crew_hours: 8 };
}

// Water heaters: the smallest tank in this tier that's at least as big as what they have now.
// Bigger than anything we sell: the biggest. Size unknown: 50 gallons.
// Matches wh_size_for() in the database, which the homeowner's estimate uses.
export function pickWaterHeater(catalog: CatalogItem[], tier: Tier, existingGallons: number | null | undefined): CatalogItem | null {
  const list = catalog
    .filter((c) => c.category === "heat_pump_water_heater" && c.tier === tier && c.gallons)
    .sort((a, b) => Number(a.gallons) - Number(b.gallons));
  if (!list.length) return null;
  const want = Number(existingGallons) || 50;
  return list.find((c) => Number(c.gallons) >= want) ?? list[list.length - 1];
}

export function pickEquipment(catalog: CatalogItem[], tier: Tier, size: number, jobType: string, existingGallons?: number | null): CatalogItem[] {
  if (jobType === "heat_pump_water_heater") {
    const wh = pickWaterHeater(catalog, tier, existingGallons);
    return wh ? [wh] : [];
  }
  const fits = (c: CatalogItem) => c.tier === tier && Number(c.capacity_tons) === Number(size);
  const outdoor = catalog.find((c) => fits(c) && c.category === "heat_pump_outdoor");
  const indoor = catalog.find((c) => fits(c) && c.category === "air_handler" && (!outdoor || c.brand === outdoor.brand));
  return [outdoor, indoor].filter(Boolean) as CatalogItem[];
}

// Same size as the system they have now, from the old unit's label: the smallest size we sell
// that covers it (2.5 ton -> 3 ton). Matches hvac_size_for() in the database.
export function sizeFromLabel(tons: number | null | undefined): number | null {
  const t = Number(tons);
  if (!t || t <= 0) return null;
  const sizes = [2, 3, 4, 5];
  return sizes.find((s) => s >= t) ?? 5;
}

// Rough size guess from square footage, using 500-600 sq ft per ton (Comfort Air rule of thumb).
export function guessTons(sqft: number | null | undefined): number | null {
  if (!sqft) return null;
  const tons = sqft / 550;
  const sizes = [2, 3, 4, 5];
  return sizes.find((s) => s >= tons - 0.25) ?? 5;
}
