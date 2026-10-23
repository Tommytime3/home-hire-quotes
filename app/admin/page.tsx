"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { label } from "../../lib/labels";
import { Login, useSession } from "../../lib/auth";

type JobRow = {
  id: string;
  status: string;
  job_type: string | null;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  phone: string | null;
  submitted_at: string | null;
  created_at: string;
};

function ago(iso: string | null) {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminHome() {
  const session = useSession();
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("jobs")
      .select("id,status,job_type,first_name,last_name,city,phone,submitted_at,created_at")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setJobs((data as JobRow[]) ?? []));
  }, [session]);

  if (session === undefined) return <main className="wrap"><p className="lead">Loading…</p></main>;
  if (!session) return <Login />;

  const list = (jobs ?? []).filter((j) => showDrafts || j.status !== "capturing");

  return (
    <main className="wrap admin">
      <div className="admin-head">
        <div>
          <p className="brand">Home Hire</p>
          <h1>Quote requests</h1>
        </div>
        <button className="link" onClick={() => supabase.auth.signOut()}>Log out</button>
      </div>

      {jobs === null && <p className="lead">Loading jobs…</p>}
      {jobs !== null && jobs.length === 0 && (
        <p className="lead">No jobs yet. If you just logged in for the first time, your account may still need to be linked to your company.</p>
      )}

      {list.map((j) => (
        <a key={j.id} className="card job-row" href={`/admin/job?id=${j.id}`}>
          <div>
            <h2>{[j.first_name, j.last_name].filter(Boolean).join(" ") || "No name yet"}</h2>
            <p>{label("job_type", j.job_type)} · {j.city || "No city"}</p>
          </div>
          <div className="job-meta">
            <span className={`pill ${j.status}`}>{label("status", j.status)}</span>
            <span className="when">{ago(j.submitted_at ?? j.created_at)}</span>
          </div>
        </a>
      ))}

      {jobs && jobs.some((j) => j.status === "capturing") && (
        <button className="link" onClick={() => setShowDrafts((v) => !v)}>
          {showDrafts ? "Hide" : "Show"} unfinished requests ({jobs.filter((j) => j.status === "capturing").length})
        </button>
      )}
    </main>
  );
}
