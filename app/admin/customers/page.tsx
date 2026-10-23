"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Login, useSession } from "../../../lib/auth";
import { AdminShell } from "../../../lib/AdminShell";
import { useContractor } from "../../../lib/contractor";

type Customer = {
  id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null;
  street: string | null; city: string | null; zip: string | null; source: string | null; created_at: string;
  jobs: { id: string; status: string }[];
};

const SOURCES: [string, string][] = [
  ["phone", "Phone call"], ["photo_link", "Photo link"], ["referral", "Referral"], ["ads", "Ads"], ["walk_in", "Walk-in"], ["other", "Other"],
];

export default function CustomersPage() {
  const session = useSession();
  const co = useContractor(!!session);
  const [list, setList] = useState<Customer[] | null>(null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ source: "phone" });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("customers")
      .select("id,first_name,last_name,email,phone,street,city,zip,source,created_at,jobs(id,status)")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => setList((data as Customer[]) ?? []));
  }, [session]);

  async function create() {
    if (!co) return;
    if (!form.first_name?.trim() && !form.last_name?.trim()) return setErr("Add at least a name.");
    const { data, error } = await supabase.from("customers").insert({ ...form, contractor_id: co.id }).select("id").single();
    if (error || !data) return setErr("Couldn't save the customer. Try again.");
    window.location.href = `/admin/customer?id=${data.id}`;
  }

  if (session === undefined) return <AdminShell><p className="lead">Loading…</p></AdminShell>;
  if (!session) return <Login />;

  const term = q.trim().toLowerCase();
  const shown = (list ?? []).filter((c) =>
    !term || [c.first_name, c.last_name, c.email, c.phone, c.street, c.city].some((v) => v?.toLowerCase().includes(term)));

  return (
    <AdminShell>
      <div className="admin-head">
        <div>
          <p className="eyebrow">Customers</p>
          <h1>Customers</h1>
        </div>
        <button className="btn" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "+ New customer"}</button>
      </div>

      {adding && (
        <section className="panel grid2">
          <div>
            <label className="lbl">First name</label>
            <input type="text" autoComplete="off" value={form.first_name ?? ""} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <label className="lbl">Last name</label>
            <input type="text" autoComplete="off" value={form.last_name ?? ""} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            <label className="lbl">Phone</label>
            <input type="text" inputMode="tel" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <label className="lbl">Email</label>
            <input type="text" inputMode="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="lbl">Street address</label>
            <input type="text" value={form.street ?? ""} onChange={(e) => setForm({ ...form, street: e.target.value })} />
            <label className="lbl">City</label>
            <input type="text" value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <label className="lbl">ZIP</label>
            <input type="text" inputMode="numeric" value={form.zip ?? ""} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
            <label className="lbl">How they found you</label>
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {err && <p className="warn">{err}</p>}
          <div><button className="btn" onClick={create}>Save customer</button></div>
        </section>
      )}

      <input className="search" type="search" placeholder="Search name, phone, email, or address" value={q} onChange={(e) => setQ(e.target.value)} />

      {list === null && <p className="lead">Loading customers…</p>}
      {list && shown.length === 0 && <p className="muted">No customers found.</p>}
      <div className="cust-list">
        {shown.map((c) => (
          <a key={c.id} className="card cust-row" href={`/admin/customer?id=${c.id}`}>
            <div>
              <h2>{[c.first_name, c.last_name].filter(Boolean).join(" ") || "No name"}</h2>
              <p>{[c.street, c.city].filter(Boolean).join(", ") || "No address"}</p>
            </div>
            <div className="cust-meta">
              <span>{c.phone || c.email || ""}</span>
              <span className="muted small">{c.jobs.length} {c.jobs.length === 1 ? "job" : "jobs"}</span>
            </div>
          </a>
        ))}
      </div>
    </AdminShell>
  );
}
