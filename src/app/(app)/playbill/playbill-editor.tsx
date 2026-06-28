"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { extractDominantColor } from "@/lib/extract-color";
import { savePlaybill, addCredit, deleteCredit, pullSongsScenes, setCreditImage } from "./actions";

interface Playbill {
  id: string;
  cover_title: string | null;
  accent_color?: string | null;
  cover_subtitle: string | null;
  cover_image_path: string | null;
  poster_path?: string | null;
  dedication: string | null;
  show_info: string | null;
  directors_note: string | null;
  song_scene_list: { act: string; items: { title: string; detail?: string }[] }[];
  special_thanks: string | null;
  include_cast: boolean;
  include_creative_team: boolean;
  section_config?: { key: string; visible?: boolean }[];
  custom_sections?: { id: string; title?: string; body?: string }[];
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

// Per-sponsor logo: uploads to promo-assets (private), stores the path on the
// credit, and shows a signed preview. PNG/SVG keep transparency for clean logos.
function CreditLogo({ credit, orgId, playbillId }: { credit: Credit; orgId: string; playbillId: string }) {
  const [path, setPath] = useState<string | null>(credit.image_path);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    if (!path) { setPreview(null); return; }
    (async () => {
      const { data } = await createClient().storage.from("promo-assets").createSignedUrl(path, 3600);
      if (active && data?.signedUrl) setPreview(data.signedUrl);
    })();
    return () => { active = false; };
  }, [path]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Pick an image. PNG or SVG with a transparent background looks best."); return; }
    if (file.size > 5 * 1024 * 1024) { setErr("Logo must be under 5MB."); return; }
    setErr(null); setBusy(true);
    const supabase = createClient();
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const newPath = `${orgId}/playbill-logos/${playbillId}/${credit.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("promo-assets").upload(newPath, file, { contentType: file.type, upsert: true });
    if (upErr) { setErr(upErr.message); setBusy(false); return; }
    const res = await setCreditImage(credit.id, orgId, newPath);
    if (res?.error) { setErr(res.error); setBusy(false); return; }
    if (path && path !== newPath) { await supabase.storage.from("promo-assets").remove([path]); }
    setPath(newPath); setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function removeLogo() {
    setBusy(true); setErr(null);
    const res = await setCreditImage(credit.id, orgId, null);
    if (res?.error) { setErr(res.error); setBusy(false); return; }
    if (path) await createClient().storage.from("promo-assets").remove([path]);
    setPath(null); setPreview(null); setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      {preview
        ? <img loading="lazy" decoding="async" src={preview} alt="" className="h-8 max-w-[88px] object-contain" />
        : <span className="text-body-xs text-muted">No logo</span>}
      <button onClick={() => fileRef.current?.click()} disabled={busy} className="text-body-xs text-brick hover:underline disabled:opacity-50">
        {busy ? "…" : path ? "Replace" : "Add logo"}
      </button>
      {path && <button onClick={removeLogo} disabled={busy} className="text-body-xs text-ash hover:text-brick">Clear</button>}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onFile} className="hidden" />
      {err && <span className="text-body-xs text-brick">{err}</span>}
    </div>
  );
}

type SectionRow = { key: string; label: string; visible: boolean };
const SECTION_DEFS: { key: string; label: string }[] = [
  { key: "directors_note", label: "Director\u2019s Note" },
  { key: "songs_scenes", label: "Musical Numbers & Scenes" },
  { key: "cast", label: "Cast" },
  { key: "creative_team", label: "Creative & Production Team" },
  { key: "special_thanks", label: "Special Thanks" },
  { key: "sponsors", label: "Sponsors & Partners" },
  { key: "ads", label: "With Support From (ads)" },
  { key: "gallery", label: "Gallery" },
];
function buildSections(pb: Playbill): SectionRow[] {
  const saved = Array.isArray(pb.section_config) ? pb.section_config : [];
  const customs = (Array.isArray(pb.custom_sections) ? pb.custom_sections : []) as { id: string; title?: string; body?: string }[];
  const customByKey = new Map(customs.map((c) => ["custom:" + c.id, c]));
  const allKeys = [...SECTION_DEFS.map((d) => d.key), ...customs.map((c) => "custom:" + c.id)];
  const byKey = new Map(saved.map((x) => [x.key, x]));
  const order = saved.length
    ? saved.map((x) => x.key).filter((k) => allKeys.includes(k))
    : SECTION_DEFS.map((d) => d.key);
  for (const k of allKeys) if (!order.includes(k)) order.push(k);
  return order.map((key) => {
    const sv = byKey.get(key);
    let visible = sv ? sv.visible !== false : true;
    if (!sv && key === "cast") visible = pb.include_cast;
    if (!sv && key === "creative_team") visible = pb.include_creative_team;
    const builtin = SECTION_DEFS.find((d) => d.key === key);
    const label = builtin ? builtin.label : (customByKey.get(key)?.title || "Custom section");
    return { key, label, visible };
  });
}

export function PlaybillEditor({
  productionId, productionTitle, orgId, playbill, credits, castCount, teamCount, orgAccentDefault,
}: {
  productionId: string; productionTitle: string; orgId: string;
  playbill: Playbill; credits: Credit[]; castCount: number; teamCount: number; orgAccentDefault?: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Playbill>({
    ...playbill,
    song_scene_list: Array.isArray(playbill.song_scene_list) ? playbill.song_scene_list : [],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<SectionRow[]>(() => buildSections(playbill));

  function moveSection(i: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSaved(false);
  }
  function toggleSection(i: number) {
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, visible: !s.visible } : s)));
    setSaved(false);
  }
  const [customSections, setCustomSections] = useState<{ id: string; title: string; body: string }[]>(
    () => (Array.isArray(playbill.custom_sections) ? playbill.custom_sections.map((c) => ({ id: c.id, title: c.title || "", body: c.body || "" })) : [])
  );
  function addCustomSection() {
    const id = crypto.randomUUID();
    setCustomSections((prev) => [...prev, { id, title: "", body: "" }]);
    setSections((prev) => [...prev, { key: "custom:" + id, label: "Custom section", visible: true }]);
    setSaved(false);
  }
  function updateCustom(id: string, patch: { title?: string; body?: string }) {
    setCustomSections((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    if (patch.title !== undefined) {
      setSections((prev) => prev.map((s) => (s.key === "custom:" + id ? { ...s, label: patch.title!.trim() || "Custom section" } : s)));
    }
    setSaved(false);
  }
  function removeCustom(id: string) {
    setCustomSections((prev) => prev.filter((c) => c.id !== id));
    setSections((prev) => prev.filter((s) => s.key !== "custom:" + id));
    setSaved(false);
  }
  const flyerSrc = (playbill.poster_path as string | null) || (playbill.cover_image_path as string | null) || null;
  const [pullingFlyer, setPullingFlyer] = useState(false);
  async function pullFromFlyer() {
    if (!flyerSrc) return;
    setPullingFlyer(true);
    setError(null);
    try {
      let url = flyerSrc;
      if (!url.startsWith("http") && !url.startsWith("/")) {
        const { data } = await createClient().storage.from("promo-assets").createSignedUrl(url, 600);
        if (!data?.signedUrl) throw new Error("Couldn't load the flyer image.");
        url = data.signedUrl;
      }
      const hex = await extractDominantColor(url);
      set("accent_color", hex);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the flyer.");
    } finally {
      setPullingFlyer(false);
    }
  }

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
      include_cast: sections.find((x) => x.key === "cast")?.visible ?? form.include_cast,
      include_creative_team: sections.find((x) => x.key === "creative_team")?.visible ?? form.include_creative_team,
      section_config: sections.map(({ key, visible }) => ({ key, visible })),
      custom_sections: customSections,
      accent_color: form.accent_color || null,
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
        <Field label="Brand color" hint={`Colors the cover title and section headings. Pull it from this show\u2019s flyer, or leave it on your organization default${orgAccentDefault ? ` (${orgAccentDefault})` : ""}.`}>
          <div className="flex items-center gap-3 flex-wrap">
            <input type="color" value={form.accent_color || orgAccentDefault || "#C4522D"} onChange={(e) => set("accent_color", e.target.value)} className="h-9 w-12 rounded border border-bone bg-paper p-0.5" />
            <span className="text-body-xs text-ash font-mono">{form.accent_color || "using default"}</span>
            {flyerSrc && (
              <button type="button" onClick={pullFromFlyer} disabled={pullingFlyer}
                className="px-3 py-1.5 text-body-xs font-medium rounded-card border border-bone text-ink hover:border-ink transition-colors disabled:opacity-50">
                {pullingFlyer ? "Reading flyer\u2026" : "Pull from flyer"}
              </button>
            )}
            {form.accent_color && (
              <button type="button" onClick={() => set("accent_color", null)} className="text-body-xs text-muted hover:text-brick">Use default</button>
            )}
          </div>
        </Field>
      </section>

      {/* Custom text sections */}
      <section className="mb-8">
        <h2 className="text-body-md font-medium text-brick mb-1">Custom sections</h2>
        <p className="text-body-xs text-ash mb-3">
          Add your own titled blocks &mdash; a welcome letter, land acknowledgment, sponsor copy.
          Set their order and visibility in Sections below.
        </p>
        <div className="space-y-4">
          {customSections.map((cs) => (
            <div key={cs.id} className="border border-bone rounded-card p-3">
              <div className="flex items-center gap-2 mb-2">
                <input className={inputCls} placeholder="Section title (e.g. A Note of Thanks)" value={cs.title} onChange={(e) => updateCustom(cs.id, { title: e.target.value })} />
                <button type="button" onClick={() => removeCustom(cs.id)} className="text-body-xs text-muted hover:text-brick shrink-0">Remove</button>
              </div>
              <textarea className={inputCls} rows={4} placeholder="Section text&hellip;" value={cs.body} onChange={(e) => updateCustom(cs.id, { body: e.target.value })} />
            </div>
          ))}
        </div>
        <button type="button" onClick={addCustomSection} className="mt-3 px-3 py-1.5 text-body-xs font-medium rounded-card border border-bone text-ink hover:border-ink transition-colors">
          + Add custom section
        </button>
      </section>

      {/* Sections: show/hide + reorder */}
      <section className="mb-8">
        <h2 className="text-body-md font-medium text-brick mb-1">Sections</h2>
        <p className="text-body-xs text-ash mb-3">
          Turn program sections on or off and set their order. The cover stays first.
          Empty sections won&rsquo;t print even if left on.
        </p>
        <div className="border border-bone rounded-card divide-y divide-bone">
          {sections.map((sec, i) => {
            const count = sec.key === "cast" ? castCount : sec.key === "creative_team" ? teamCount : null;
            return (
              <div key={sec.key} className="flex items-center gap-3 px-3 py-2">
                <div className="flex flex-col">
                  <button type="button" onClick={() => moveSection(i, -1)} disabled={i === 0}
                    className="text-ash hover:text-ink disabled:opacity-25 leading-none text-xs">▲</button>
                  <button type="button" onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1}
                    className="text-ash hover:text-ink disabled:opacity-25 leading-none text-xs">▼</button>
                </div>
                <span className="text-body-xs text-muted w-5 text-center font-mono">{i + 1}</span>
                <span className={`flex-1 text-body-sm ${sec.visible ? "text-ink" : "text-muted line-through"}`}>
                  {sec.label}{count !== null ? ` — ${count} people` : ""}
                </span>
                <button type="button" onClick={() => toggleSection(i)}
                  className={`px-2.5 py-1 text-body-xs font-medium rounded-card border transition-colors ${
                    sec.visible ? "bg-confirmed/10 border-confirmed/30 text-confirmed" : "bg-bone/30 border-bone text-muted"
                  }`}>
                  {sec.visible ? "On" : "Off"}
                </button>
              </div>
            );
          })}
        </div>
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
              <div key={c.id} className="flex items-center justify-between border border-bone rounded-card px-3 py-2 gap-3">
                <div className="min-w-0">
                  <span className="text-body-xs uppercase tracking-wider text-ash mr-2">{c.credit_type}</span>
                  <span className="text-body-sm text-ink">{c.name}</span>
                  {c.detail && <span className="text-body-xs text-muted ml-2">{c.detail}</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <CreditLogo credit={c} orgId={orgId} playbillId={playbill.id} />
                  <button onClick={() => handleDeleteCredit(c.id)} className="text-ash hover:text-brick text-body-sm">Remove</button>
                </div>
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
          <p className="text-body-xs text-muted mt-2">Add the sponsor, then attach its logo with &ldquo;Add logo&rdquo; on its row. PNG or SVG with a transparent background prints cleanest.</p>
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
