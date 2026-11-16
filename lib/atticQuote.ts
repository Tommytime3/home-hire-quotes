// Builds an attic & crawlspace estimate in the same line items, order, and wording Tommy uses
// in Housecall Pro, so it can be pasted straight in. Prices come from the contractor's price book.

export type PriceRow = { code: string; price: number | string | null };
export type Line = { name: string; note: string; qty: number; unit: number; amount: number };

const DUCT_NOTE = "Galvanized steel ductwork wrapped with a layer of fiberglass insulation, insulation value R6.";

export function atticLines(job: Record<string, any>, prices: PriceRow[]): { lines: Line[]; total: number; footprint: number | null; runs: number } {
  const p = (code: string) => Number(prices.find((x) => x.code === code)?.price ?? 0);
  const svc: string = job.attic_service || "full_renovation";
  const full = svc === "full_renovation";
  const insulate = full || svc === "rodent_proofing" || svc === "insulation";
  const ducts = full || svc === "ductwork";
  const attic = job.has_attic !== "no";
  const crawl = job.has_crawlspace === "yes";
  const footprint = job.square_feet ? Math.round(Number(job.square_feet) / Math.max(Number(job.stories) || 1, 1)) : null;
  const sq = footprint ?? 0;
  const runs = ducts ? Number(job.supply_register_count) || 0 : 0;
  const where = job.duct_location || "unsure";
  const atticRuns = where === "attic" ? runs : 0;
  const crawlRuns = where === "crawlspace" ? runs : 0;
  const bothRuns = where === "both" || where === "unsure" ? runs : 0;

  const L: Line[] = [];
  const add = (name: string, note: string, qty: number, unit: number) => L.push({ name, note, qty, unit, amount: Math.round(qty * unit * 100) / 100 });

  add("Cover Work Area Before Starting Project", "Client to clear fragile items between the front door and the attic/crawl space entrance. Existing damage is inspected at the start of the day.", 1, 0);
  if (attic && insulate) {
    add("Clean And Vacuum Attic Area Of Debris and Insulation", "", sq, p("attic_cleanout"));
    add("Sanitize Attic Using Anti-Microbial Disinfectant", "", 1, 0);
    add("Air Seal Attic Area", "Around recessed lights and penetrations, with polyurethane foam.", 1, 0);
  }
  if (svc === "rodent_proofing" || full) {
    add("Rodent Proof Whole House", "Wire mesh and polyurethane foam: attic, roof, around the house, crawl space, garage. Excludes detached garages, misaligned garage doors, and tile roofs with no plywood underneath. Refer to terms and conditions.", 1, 0);
  }
  if (attic && insulate) add("Install New CertainTeed R-38 Faced Insulation In Attic Area 16 inch", "", sq, p("attic_r38"));
  if (atticRuns) {
    add("Remove And Dispose of Existing Duct System in Attic", "", 1, 0);
    add("Install New Rigid Steel Ducts In Attic", DUCT_NOTE, atticRuns, p("duct_run"));
  }
  if (crawl && insulate) {
    add("Clean Crawl Space Of Rodent Waste", "Dirt and gravel cleaned to the best of the crew's ability.", 1, 0);
    add("Sanitize Crawl Space Using Anti-Microbial Disinfectant", "", 1, 0);
    add("Install New CertainTeed R-19 Faced Insulation In Crawl Space 16 inch", "", sq, p("crawl_r19"));
  }
  if (crawlRuns) {
    add("Remove And Dispose of Existing Duct System in Crawl Space", "", 1, 0);
    add("Install New Rigid Steel Ducts In Crawlspace", DUCT_NOTE, crawlRuns, p("duct_run"));
  }
  if (bothRuns) {
    add("Remove And Dispose of Existing Duct System", "Attic and crawl space.", 1, 0);
    add("Install New Rigid Steel Ducts", `${DUCT_NOTE} Split between attic and crawl space; confirm counts on site.`, bothRuns, p("duct_run"));
  }
  if (crawl && job.crawl_access === "no_access") add("Build a crawlspace door", "", 1, p("crawl_door"));
  if (svc === "rodent_proofing" || full) add("Set Traps in Attic and Crawlspace", "We return weekly for the first month to check traps.", 1, 0);
  add("Before and After Pictures", "By email request within 3 business days, sent after full payment.", 1, 0);
  if (svc === "rodent_proofing" || full) add("5 Year Warranty For Rodent Proofing", "", 1, 0);
  add("5 Year Warranty For Install Labor and Materials", "", 1, 0);

  const total = Math.round(L.reduce((s, l) => s + l.amount, 0));
  return { lines: L, total, footprint, runs };
}

// Tab-separated, one line item per row: pastes into a spreadsheet, or copy row by row into Housecall Pro.
export function linesAsText(lines: Line[]): string {
  const m = (n: number) => n.toFixed(2);
  return ["Service\tDescription\tQty\tUnit price\tAmount", ...lines.map((l) => [l.name, l.note, l.qty, m(l.unit), m(l.amount)].join("\t"))].join("\n");
}
