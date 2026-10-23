"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Contractor = {
  id: string;
  name: string;
  display_name: string | null;
  license_number: string | null;
  phone: string | null;
  website: string | null;
  logo_url: string | null;
  brand_color: string | null;
  accent_color: string | null;
  finance_lender: string | null;
  finance_apr: number | null;
  finance_months: number | null;
  home_zip: string | null;
  alert_email: string | null;
};

// The company the logged-in staff member works for. Cached for the session.
let cached: Contractor | null = null;

export function useContractor(enabled = true) {
  const [c, setC] = useState<Contractor | null>(cached);
  useEffect(() => {
    if (!enabled || cached) return;
    supabase
      .from("contractors")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        cached = (data as Contractor) ?? null;
        setC(cached);
      });
  }, [enabled]);
  return c;
}

export function setContractorCache(c: Contractor) {
  cached = c;
}

// Standard loan payment. Returns null when financing isn't set up.
export function monthlyPayment(total: number, apr: number | null | undefined, months: number | null | undefined): number | null {
  if (!total || !months || apr === null || apr === undefined) return null;
  const r = apr / 100 / 12;
  if (r === 0) return total / months;
  return (total * r) / (1 - Math.pow(1 + r, -months));
}
