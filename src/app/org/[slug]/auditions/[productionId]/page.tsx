"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

type Slot = {
  id: string;
  starts_at: string;
  duration_min: number;
  location: string | null;
  capacity: number;
  notes: string | null;
  taken: number;
};

function fmt(starts: string) {
  return new Date(starts).toLocaleString("en-US", {
    weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function AuditionsPage() {
  const router = useRouter();
  const { slug, productionId } = useParams<{ slug: string; productionId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [orgName, setOrgName] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [mySlotId, setMySlotId] = useState<string | null>(null);
  const [applied, setApplied] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push(`/login?next=/org/${slug}/auditions/${productionId}`); return; }
    const { data: person } = await supabase.from("people").select("id").eq("user_id", user.id).single();

    const { data: prod } = await supabase
      .from("productions").select("title, organizations(name)").eq("id", productionId).single();
    if (prod) {
      setTitle(prod.title as string);
      setOrgName((prod.organizations as unknown as { name: string })?.name || "");
    }

    // Slots visible per RLS (only if the viewer applied / is assigned / is a member).
    const { data: slotRows } = await supabase
      .from("audition_slots")
      .select("id, starts_at, duration_min, location, capacity, notes")
      .eq("production_id", productionId)
      .order("starts_at", { ascending: true });

    if (!slotRows || slotRows.length === 0) {
      // Could be no slots yet, or the viewer hasn't applied (RLS hides them).
      const { data: app } = await supabase
        .from("applications").select("id").eq("production_id", productionId).eq("person_id", person?.id).maybeSingle();
      setApplied(!!app);
      setSlots([]);
      setLoading(false);
      return;
    }

    const ids = slotRows.map((s) => s.id);
    const { data: counts } = await supabase
      .from("audition_signups").select("slot_id").in("slot_id", ids);
    const takenBy = new Map<string, number>();
    for (const c of counts || []) takenBy.set(c.slot_id as string, (takenBy.get(c.slot_id as string) || 0) + 1);

    const { data: mine } = await supabase
      .from("audition_signups").select("slot_id").eq("production_id", productionId).eq("person_id", person?.id).maybeSingle();
    setMySlotId((mine?.slot_id as string) ?? null);

    setSlots(slotRows.map((s) => ({
      id: s.id as string,
      starts_at: s.starts_at as string,
      duration_min: s.duration_min as number,
      location: (s.location as string | null) ?? null,
      capacity: s.capacity as number,
      notes: (s.notes as string | null) ?? null,
      taken: takenBy.get(s.id as string) || 0,
    })));
    setLoading(false);
  }, [slug, productionId, router]);

  useEffect(() => { load(); }, [load]);

  async function signUp(slotId: string) {
    setWorking(slotId); setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("signup_for_audition", { p_slot_id: slotId });
    setWorking(null);
    if (error) { setError(error.message); return; }
    await load();
  }
  async function cancel() {
    setWorking("cancel"); setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("cancel_audition_signup", { p_production_id: productionId });
    setWorking(null);
    if (error) { setError(error.message); return; }
    await load();
  }

  return (
    <div className="min-h-screen bg-paper">
      <PublicHeader />
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-10">
        <Link href={`/org/${slug}`} className="text-body-sm text-ash hover:text-brick">&larr; {orgName || "Back"}</Link>
        <h1 className="font-display text-display-lg text-ink mt-3 mb-1">Auditions</h1>
        {title && <p className="text-body-md text-ash mb-6">{title}</p>}

        {loading ? (
          <p className="text-body-md text-ash">Loading…</p>
        ) : !applied ? (
          <div className="bg-card border border-bone rounded-card p-6">
            <p className="text-body-md text-ink mb-2">Apply first to pick an audition time.</p>
            <Link href={`/org/${slug}/apply/${productionId}`} className="text-body-sm font-medium text-brick hover:underline">Go to the application &rarr;</Link>
          </div>
        ) : slots.length === 0 ? (
          <p className="text-body-md text-ash">No audition times are posted yet. Check back soon.</p>
        ) : (
          <div className="space-y-2">
            {error && <p className="text-body-sm text-brick">{error}</p>}
            {slots.map((s) => {
              const mine = mySlotId === s.id;
              const full = s.taken >= s.capacity && !mine;
              return (
                <div key={s.id} className={`border rounded-card px-4 py-3 ${mine ? "border-brick bg-brick/5" : "border-bone bg-card"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-md font-medium text-ink">{fmt(s.starts_at)}</p>
                      <p className="text-body-xs text-ash">{s.location || "Location TBD"} · {s.duration_min} min{s.capacity > 1 ? ` · ${s.taken}/${s.capacity}` : ""}</p>
                      {s.notes && <p className="text-body-xs text-muted mt-0.5">{s.notes}</p>}
                    </div>
                    <div className="shrink-0">
                      {mine ? (
                        <span className="text-body-xs font-medium text-brick">Your time ✓</span>
                      ) : (
                        <button onClick={() => signUp(s.id)} disabled={full || working === s.id}
                          className="px-3 py-1.5 text-body-xs font-medium rounded-card bg-ink text-paper hover:bg-ink/90 disabled:opacity-40">
                          {full ? "Full" : working === s.id ? "…" : "Sign up"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {mySlotId && (
              <button onClick={cancel} disabled={working === "cancel"} className="text-body-xs text-ash hover:text-brick mt-1">
                Cancel my signup
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
