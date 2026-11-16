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
  meet_link: string | null;
  ntfy_topic: string | null;
  available_now: boolean;
  available_until: string | null;
  slug?: string | null;
  job_types?: string[] | null;
  specialist_name?: string | null;
};

export function isAvailable(c: Contractor | null): boolean {
  return !!c?.available_now && (!c.available_until || new Date(c.available_until) > new Date());
}

// The company the logged-in staff member is working in. Staff can belong to several
// contractors (e.g. Comfort Air and Attic Crew); the one picked in the header is remembered.
let cached: Contractor | null = null;
let all: Contractor[] | null = null;
const PICK = "hh_contractor";

function picked(): string | null {
  try { return localStorage.getItem(PICK); } catch { return null; }
}

export function useContractors(enabled = true) {
  const [list, setList] = useState<Contractor[] | null>(all);
  useEffect(() => {
    if (!enabled || all) return;
    supabase.from("contractors").select("*").order("created_at").then(({ data }) => {
      all = (data as Contractor[]) ?? [];
      setList(all);
    });
  }, [enabled]);
  return list;
}

export function useContractor(enabled = true) {
  const [c, setC] = useState<Contractor | null>(cached);
  const list = useContractors(enabled);
  useEffect(() => {
    if (!list || cached) return;
    cached = list.find((x) => x.id === picked()) ?? list[0] ?? null;
    setC(cached);
  }, [list]);
  return c;
}

export function switchContractor(id: string) {
  try { localStorage.setItem(PICK, id); } catch { /* private mode: still switches for this page */ }
  cached = all?.find((x) => x.id === id) ?? cached;
  window.location.href = "/admin";
}

export function setContractorCache(c: Contractor) {
  cached = c;
  if (all) all = all.map((x) => (x.id === c.id ? c : x));
}

// Standard loan payment. Returns null when financing isn't set up.
export function monthlyPayment(total: number, apr: number | null | undefined, months: number | null | undefined): number | null {
  if (!total || !months || apr === null || apr === undefined) return null;
  const r = apr / 100 / 12;
  if (r === 0) return total / months;
  return (total * r) / (1 - Math.pow(1 + r, -months));
}
