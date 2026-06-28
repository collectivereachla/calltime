"use client";

import { useState } from "react";

const ENDPOINT = "https://lyyqmbabqisljqrowwpr.supabase.co/functions/v1/in-kind-submit";

export default function InKindPage() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    try {
      const r = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok || d.error) { setErr(d.error || "Something went wrong."); }
      else { setSent(true); }
    } catch { setErr("Network error. Please email thejuneteenthstory@gmail.com."); }
    setBusy(false);
  }

  const field = "w-full border border-bone rounded-md px-3 py-2 text-body-sm bg-paper text-ink placeholder:text-muted focus:outline-none focus:border-brick";
  const label = "block text-body-sm text-ink mb-1";

  if (sent) {
    return (
      <div style={{ fontFamily: "Georgia, serif" }} className="max-w-xl mx-auto px-6 py-20 text-ink">
        <h1 className="font-display text-display-md mb-3">Thank you.</h1>
        <p className="text-body-md text-ash leading-relaxed">We received your in-kind offer and someone from The Juneteenth Story will reach out to coordinate. We're grateful you want to build this with us.</p>
        <p className="text-body-sm text-muted mt-6">Yes indeed,<br/>Black Theatre Experience</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-12 md:py-16 text-ink">
      <h1 className="font-display text-display-md mb-2">Become an in-kind sponsor</h1>
      <p className="text-body-md text-ash leading-relaxed mb-8">
        Donating food, drinks, a gift card, or a service instead of cash? Tell us what you'd like to contribute and we'll follow up to coordinate the details. In-kind supporters are recognized alongside our sponsors.
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <input type="text" name="company_url" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <div>
          <label className={label}>Business or organization *</label>
          <input name="business" required className={field} placeholder="e.g., Prejean's Carencro" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className={label}>Contact name</label><input name="contact_name" className={field} /></div>
          <div><label className={label}>Phone</label><input name="phone" className={field} /></div>
        </div>
        <div><label className={label}>Email</label><input name="email" type="email" className={field} /></div>
        <div>
          <label className={label}>What are you offering?</label>
          <select name="gift_type" className={field} defaultValue="">
            <option value="" disabled>Choose one…</option>
            <option>Food</option>
            <option>Drinks / Beverages</option>
            <option>Gift card</option>
            <option>Service</option>
            <option>Other</option>
          </select>
        </div>
        <div><label className={label}>Describe your in-kind gift</label><textarea name="description" rows={3} className={field} placeholder="e.g., Two trays of food for opening night" /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className={label}>Estimated value (optional)</label><input name="est_value" className={field} placeholder="$" /></div>
          <div><label className={label}>What's it for? (optional)</label><input name="needed_for" className={field} placeholder="e.g., Opening-night reception" /></div>
        </div>
        {err && <p className="text-body-sm text-brick">{err}</p>}
        <button type="submit" disabled={busy} className="inline-block bg-brick text-paper rounded-md px-6 py-3 text-body-sm disabled:opacity-60">
          {busy ? "Sending…" : "Submit in-kind offer"}
        </button>
      </form>
      <p className="text-body-xs text-muted mt-8">Black Theatre Experience &middot; The Juneteenth Story &middot; thejuneteenthstory@gmail.com</p>
    </div>
  );
}
