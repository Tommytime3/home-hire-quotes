"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useContractor } from "./contractor";

const TABS = [
  { href: "/admin", label: "Jobs", match: ["/admin", "/admin/job", "/admin/quote"] },
  { href: "/admin/customers", label: "Customers", match: ["/admin/customers", "/admin/customer"] },
  { href: "/admin/catalog", label: "Catalog", match: ["/admin/catalog"] },
  { href: "/admin/settings", label: "Settings", match: ["/admin/settings"] },
];

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#fff" />
      <path d="M9 19c3-6 11-6 14 0" stroke="var(--ca-blue)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M12 14c2-3 6-3 8 0" stroke="var(--ca-orange)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// Branded frame for every staff page. Uses the uploaded logo when there is one.
export function AdminShell({ children, back }: { children: React.ReactNode; back?: { href: string; label: string } }) {
  const co = useContractor();
  const [path, setPath] = useState("");
  useEffect(() => setPath(window.location.pathname.replace(/\/$/, "") || "/admin"), []);
  const active = TABS.find((t) => t.match.includes(path))?.href;
  const name = co?.display_name || "Comfort Air";

  return (
    <div className="ca">
      <header className="ca-bar">
        <div className="ca-bar-row">
          <a href="/admin" className="ca-logo" aria-label={`${name} home`}>
            {co?.logo_url ? (
              <img src={co.logo_url} alt={name} className="ca-logo-img" />
            ) : (
              <>
                <BrandMark />
                <span className="ca-word">
                  <strong>{name}</strong>
                  <small>Heating &amp; Air Conditioning</small>
                </span>
              </>
            )}
          </a>
          <button className="ca-logout" onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/admin"))}>
            Log out
          </button>
        </div>
        <nav className="ca-tabs" aria-label="Sections">
          {TABS.map((t) => (
            <a key={t.href} href={t.href} className={active === t.href ? "on" : ""}>{t.label}</a>
          ))}
        </nav>
      </header>
      <main className="ca-main">
        {back && <a className="ca-back" href={back.href}>← {back.label}</a>}
        {children}
      </main>
      <footer className="ca-foot">Powered by Home Hire</footer>
    </div>
  );
}
