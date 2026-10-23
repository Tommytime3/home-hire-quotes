"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}${window.location.search}` },
    });
    if (error) setErr("Couldn't send the link. Wait a minute and try again.");
    else setSent(true);
  }

  return (
    <main className="wrap">
      <p className="brand" style={{ marginTop: 24 }}>Home Hire</p>
      <h1>Contractor login</h1>
      {sent ? (
        <p className="lead">Check your email for a login link. Open it on this device.</p>
      ) : (
        <section className="card">
          <label className="field" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="primary block" style={{ marginTop: 14 }} disabled={!email.includes("@")} onClick={send}>
            Email me a login link
          </button>
          {err && <p className="warn" style={{ marginTop: 12 }}>{err}</p>}
        </section>
      )}
    </main>
  );
}

