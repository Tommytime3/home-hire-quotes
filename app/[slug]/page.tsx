"use client";

import { Capture } from "../../lib/Capture";

// Each contractor's own quote link, e.g. /attic-crew or /comfort-air
export default function ContractorQuotePage({ params }: { params: { slug: string } }) {
  return <Capture slug={params.slug} />;
}
