import { createClient } from "@/lib/supabase/server";
import { getActiveProductionId } from "@/lib/active-production";
import { MarqueeRoom } from "./marquee-room";

export default async function MarqueePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: person } = await supabase
    .from("people").select("id, full_name, preferred_name").eq("user_id", user!.id).single();

  const { data: membership } = await supabase
    .from("org_memberships").select("org_id, role").eq("person_id", person!.id).limit(1).single();

  if (!membership) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">No organization found.</p>
      </div>
    );
  }

  const orgId = membership.org_id;
  const canManage = membership.role === "owner" || membership.role === "production";
  const pid = await getActiveProductionId();

  let prodTitle = "";
  type Asset = {
    id: string; file_name: string; mime_type: string | null; size_bytes: number | null;
    caption: string | null; created_at: string; uploaded_by: string | null; file_path: string;
    uploaderName: string; isImage: boolean; previewUrl: string | null;
  };
  let assets: Asset[] = [];

  if (pid) {
    const { data: prod } = await supabase.from("productions").select("title").eq("id", pid).single();
    prodTitle = prod?.title || "";

    const { data: rows } = await supabase
      .from("promo_assets")
      .select("id, file_name, mime_type, size_bytes, caption, created_at, uploaded_by, file_path, people(full_name, preferred_name)")
      .eq("production_id", pid)
      .order("created_at", { ascending: false });

    const list = rows || [];
    const imagePaths = list.filter((r) => (r.mime_type || "").startsWith("image/")).map((r) => r.file_path);
    const signed = new Map<string, string>();
    if (imagePaths.length > 0) {
      const { data: signedList } = await supabase.storage.from("promo-assets").createSignedUrls(imagePaths, 3600);
      for (const s of signedList || []) {
        if (s.signedUrl && s.path) signed.set(s.path, s.signedUrl);
      }
    }

    assets = list.map((r) => {
      const p = r.people as unknown as { full_name: string; preferred_name: string | null } | null;
      const isImage = (r.mime_type || "").startsWith("image/");
      return {
        id: r.id,
        file_name: r.file_name,
        mime_type: r.mime_type,
        size_bytes: r.size_bytes,
        caption: r.caption,
        created_at: r.created_at,
        uploaded_by: r.uploaded_by,
        file_path: r.file_path,
        uploaderName: p ? p.preferred_name || p.full_name : "—",
        isImage,
        previewUrl: isImage ? signed.get(r.file_path) || null : null,
      };
    });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <h1 className="font-display text-display-lg text-ink mb-1">Marquee</h1>
      <p className="text-body-sm text-ash mb-6">
        Shared promo photos and flyers{prodTitle ? ` for ${prodTitle}` : ""}. Everyone can upload and download the originals.
      </p>

      {!pid ? (
        <p className="text-body-md text-ash">Select a production to see its promo materials.</p>
      ) : (
        <MarqueeRoom
          productionId={pid}
          orgId={orgId}
          myPersonId={person!.id}
          canManage={canManage}
          assets={assets}
        />
      )}
    </div>
  );
}
