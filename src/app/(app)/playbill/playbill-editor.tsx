"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePlaybill, addCredit, deleteCredit, pullSongsScenes } from "./actions";

interface Playbill {
  id: string;
  cover_title: string | null;
  cover_subtitle: string | null;
  cover_image_path: string | null;
  dedication: string | null;
  show_info: string | null;
  directors_note: string | null;
  song_scene_list: { act: string; items: { title: string; detail?: string }[] }[];
  special_thanks: string | null;
  include_cast: boolean;
  include_creative_team: boolean;
}
interface Credit {
  id: string; credit_type: string; name: string; detail: string | null;
  link_url: string | null; image_path: string | null; sort_order: number;
}

const CREDIT_TYPES = [
  { key: "sponsor", label: "Sponsor" },
  { key: "ad", label: "Ad" },
  { key: "partner", label: "Partner" },
  { key: "acknowledgment", label: "Acknowledgment" },
] as const;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-body-sm font-medium text-ink mb-1">{label}</label>
      {hint && <p className="text-body-xs text-muted mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 text-body-sm border border-bone rounded-card bg-paper focus:border-brick focus:outline-none";

export function PlaybillEditor({
  productionId, productionTitle, orgId, playbill, credits, castCount, teamCount,
}: {
  productionId: string; productionTitle: string; orgId: string;
  playbill: Playbill; credits: Credit[]; castCount: number; teamCount: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Playbill>({
    ...playbill,
    song_scene_list: Array.isArray(playbill.song_scene_list) ? playbill.song_scene_list : [],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Playbill>(k: K, v: Playbill[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await savePlaybill(playbill.id, orgId, {
      cover_title: form.cover_title,
      cover_subtitle: form.cover_subtitle,
      dedication: form.dedication,
      show_info: form.show_info,
      directors_note: form.directors_note,
      song_scene_list: form.song_scene_list,
      special_thanks: form.special_thanks,
      include_cast: form.include_cast,
      include_creative_team: form.include_creative_team,
    });
    setSaving(false);
    if (res?.error) { setError(res.error); return; }
    setSaved(true);
    router.refresh();
  }

  // Song/scene list editing
  const [pulling, setPulling] = useState<"full" | "audience" | null>(null);
  async function handlePull(mode: "full" | "audience") {
    if (form.song_scene_list.length > 0 &&
        !window.confirm("Replace the current Songs & Scenes list with a fresh pull from the rooms? Your other playbill sections stay untouched, and nothing is published until you Save.")) {
      return;
    }
    setPulling(mode);
    setError(null);
    const res = await pullSongsScenes(productionId, orgId, mode);
    setPulling(null);
    if (res?.error) { setError(res.error); return; }
    set("song_scene_list", res.list ?? []);
  }
  function addAct() {
    set("song_scene_list", [...form.song_scene_list, { act: `Act ${form.song_scene_list.length + 1}`, items: [] }]);
  }
  function updateAct(i: number, act: string) {
    const next = [...form.song_scene_list]; next[i] = { ...next[i], act }; set("song_scene_list", next);
  }
  function removeAct(i: number) {
    set("song_scene_list", form.song_scene_list.filter((_, idx) => idx !== i));
  }
  function addItem(ai: number) {
    const next = [...form.song_scene_list];
    next[ai] = { ...next[ai], items: [...next[ai].items, { title: "", detail: "" }] };
    set("song_scene_list", next);
  }
  function updateItem(ai: number, ii: number, key: "title" | "detail", val: string) {
    const next = [...form.song_scene_list];
    const items = [...next[ai].items]; items[ii] = { ...items[ii], [key]: val };
    next[ai] = { ...next[ai], items }; set("song_scene_list", next);
  }
  function removeItem(ai: number, ii: number) {
    const next = [...form.song_scene_list];
    next[ai] = { ...next[ai], items: next[ai].items.filter((_, idx) => idx !== ii) };
    set("song_scene_list", next);
  }

  // Credits
  const [newCredit, setNewCredit] = useState<{ credit_type: Credit["credit_type"]; name: string; detail: string; link_url: string }>({
    credit_type: "sponsor" as Credit["credit_type"], name: "", detail: "", link_url: "",
  });
  const [creditBusy, setCreditBusy] = useState(false);

  async function handleAddCredit() {
    if (!newCredit.name.trim()) return;
    setCreditBusy(true);
    const res = await addCredit(playbill.id, orgId, {
      credit_type: newCredit.credit_type as "sponsor" | "ad" | "acknowledgment" | "partner",
      name: newCredit.name, detail: newCredit.detail || null, link_url: newCredit.link_url || null,
    });
    setCreditBusy(false);
    if (res?.error) { setError(res.error); return; }
    setNewCredit({ credit_type: "sponsor", name: "", detail: "", link_url: "" });
    router.refresh();
  }
  async function handleDeleteCredit(id: string) {
    await deleteCredit(id, orgId);
    router.refresh();
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="font-display text-display-md text-ink">Playbill</h1>
          <p className="text-body-sm text-ash"><span className="font-display italic">{productionTitle}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/playbill-print?p=${productionId}`} target="_blank" rel="noopener noreferrer"
            className="px-3 py-2 text-body-sm border border-bone rounded-card text-ink hover:border-ink transition-colors">
            Preview &amp; print
          </a>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-body-sm font-medium bg-ink text-paper rounded-card hover:bg-ink/90 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {error && <p className="text-body-sm text-brick mb-3">{error}</p>}
      {saved && <p className="text-body-sm text-confirmed mb-3">Saved.</p>}

      <p className="text-body-xs text-muted border-t border-bone pt-4 mb-6">
        Cast ({castCount}) and the creative &amp; production team ({teamCount}) are pulled in automatically from
        your roster — no need to type them. Edit the sections below, then preview and print.
      </p>

      {/* Cover */}
      <section className="mb-8">
        <h2 className="text-body-md font-medium text-brick mb-3">Cover &amp; title page</h2>
        <Field label="Cover title" hint={`Defaults to "${productionTitle}" if left blank.`}>
          <input className={inputCls} value={form.cover_title ?? ""} onChange={(e) => set("cover_title", e.target.value)} placeholder={productionTitle} />
        </Field>
        <Field label="Subtitle / tagline">
          <input className={inputCls} value={form.cover_subtitle ?? ""} onChange={(e) => set("cover_subtitle", e.target.value)} />
        </Field>
        <Field label="Show info" hint="Run time, number of acts, setting — shown near the title.">
          <textarea className={inputCls} rows={2} value={form.show_info ?? ""} onChange={(e) => set("show_info", e.target.value)} />
        </Field>
        <Field label="Dedication">
          <input className={inputCls} value={form.dedication ?? ""} onChange={(e) => set("dedication", e.target.value)} />
        </Field>
      </section>

      {/* Auto sections toggles */}
      <section className="mb-8">
        <h2 className="text-body-md font-medium text-brick mb-3">Cast &amp; team</h2>
        <label className="flex items-center gap-2 mb-2 text-body-sm text-ink">
          <input type="checkbox" checked={form.include_cast} onChange={(e) => set("include_cast", e.target.checked)} />
          Include cast page (headshots, names, characters) — {castCount} people
        </label>
        <label className="flex items-center gap-2 text-body-sm text-ink">
          <input type="checkbox" checked={form.include_creative_team} onChange={(e) => set("include_creative_team", e.target.checked)} />
          Include creative &amp; production team — {teamCount} people
        </label>
      </section>

      {/* Director's note */}
      <section className="mb-8">
        <h2 className="text-body-md font-medium text-brick mb-3">Director&rsquo;s note</h2>
        <textarea className={inputCls} rows={8} value={form.directors_note ?? ""} onChange={(e) => set("directors_note", e.target.value)} placeholder="Write your note to the audience…" />
      </section>

      {/* Song / scene list */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-body-md font-medium text-brick">Songs &amp; scenes</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => handlePull("audience")} disabled={!!pulling} className="text-body-sm text-brick hover:underline disabled:opacity-50">
              {pulling === "audience" ? "Pulling…" : "Pull acts & numbers"}
            </button>
            <button onClick={() => handlePull("full")} disabled={!!pulling} className="text-body-sm text-brick hover:underline disabled:opacity-50">
              {pulling === "full" ? "Pulling…" : "Pull full breakdown"}
            </button>
            <button onClick={addAct} className="text-body-sm text-brick hover:underline">+ Add act</button>
          </div>
        </div>
        <p className="text-body-xs text-muted mb-3">
          <span className="font-medium">Acts &amp; numbers</span> gives the front-of-house version: each act headed by its
          setting, with the musical numbers underneath. <span className="font-medium">Full breakdown</span> pulls every
          scene from your stage-management breakdown — trim or rename anything you don&rsquo;t want the audience to see.
          Either way, review and Save.
        </p>
        {form.song_scene_list.length === 0 && <p className="text-body-xs text-muted">No acts yet. Add one to list musical numbers or scenes.</p>}
        {form.song_scene_list.map((act, ai) => (
          <div key={ai} className="border border-bone rounded-card p-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <input className={`${inputCls} font-medium`} value={act.act} onChange={(e) => updateAct(ai, e.target.value)} />
              <button onClick={() => removeAct(ai)} className="text-body-xs text-brick shrink-0">Remove act</button>
            </div>
            {act.items.map((it, ii) => (
              <div key={ii} className="flex items-center gap-2 mb-1.5 pl-2">
                <input className={inputCls} placeholder="Title (e.g. song or scene name)" value={it.title} onChange={(e) => updateItem(ai, ii, "title", e.target.value)} />
                <input className={inputCls} placeholder="Detail (e.g. performed by…)" value={it.detail ?? ""} onChange={(e) => updateItem(ai, ii, "detail", e.target.value)} />
                <button onClick={() => removeItem(ai, ii)} className="text-ash hover:text-brick shrink-0">×</button>
              </div>
            ))}
            <button onClick={() => addItem(ai)} className="text-body-xs text-brick hover:underline mt-1 ml-2">+ Add number / scene</button>
          </div>
        ))}
      </section>

      {/* Special thanks */}
      <section className="mb-8">
        <h2 className="text-body-md font-medium text-brick mb-3">Special thanks &amp; acknowledgments</h2>
        <textarea className={inputCls} rows={4} value={form.special_thanks ?? ""} onChange={(e) => set("special_thanks", e.target.value)} />
      </section>

      {/* Sponsors / ads / partners */}
      <section className="mb-8">
        <h2 className="text-body-md font-medium text-brick mb-3">Sponsors, ads &amp; partners</h2>
        {credits.length > 0 && (
          <div className="mb-4 space-y-2">
            {credits.map((c) => (
              <div key={c.id} className="flex items-center justify-between border border-bone rounded-card px-3 py-2">
                <div>
                  <span className="text-body-xs uppercase tracking-wider text-ash mr-2">{c.credit_type}</span>
                  <span className="text-body-sm text-ink">{c.name}</span>
                  {c.detail && <span className="text-body-xs text-muted ml-2">{c.detail}</span>}
                </div>
                <button onClick={() => handleDeleteCredit(c.id)} className="text-ash hover:text-brick text-body-sm">Remove</button>
              </div>
            ))}
          </div>
        )}
        <div className="border border-bone rounded-card p-3">
          <div className="flex gap-2 mb-2">
            <select className={`${inputCls} w-32`} value={newCredit.credit_type}
              onChange={(e) => setNewCredit({ ...newCredit, credit_type: e.target.value as Credit["credit_type"] })}>
              {CREDIT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <input className={inputCls} placeholder="Name" value={newCredit.name} onChange={(e) => setNewCredit({ ...newCredit, name: e.target.value })} />
          </div>
          <div className="flex gap-2 mb-2">
            <input className={inputCls} placeholder="Detail / tagline (optional)" value={newCredit.detail} onChange={(e) => setNewCredit({ ...newCredit, detail: e.target.value })} />
            <input className={inputCls} placeholder="Link (optional)" value={newCredit.link_url} onChange={(e) => setNewCredit({ ...newCredit, link_url: e.target.value })} />
          </div>
          <button onClick={handleAddCredit} disabled={creditBusy || !newCredit.name.trim()}
            className="px-3 py-1.5 text-body-sm bg-ink text-paper rounded-card disabled:opacity-50">
            {creditBusy ? "Adding…" : "Add"}
          </button>
          <p className="text-body-xs text-muted mt-2">Logo / ad artwork upload comes in the next pass; for now add the name and detail.</p>
        </div>
      </section>

      <div className="border-t border-bone pt-4 flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-body-sm font-medium bg-ink text-paper rounded-card hover:bg-ink/90 disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
