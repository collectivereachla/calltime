import { createClient } from "@/lib/supabase/server";
import { getActiveProductionId } from "@/lib/active-production";

const CATEGORY_LABELS: Record<string, string> = {
  men: "Men", women: "Women", girls: "Girls", boys: "Boys",
  accessories: "Accessories", shoes: "Shoes", hats: "Hats", other: "Other",
};

const PROP_CATEGORY_LABELS: Record<string, string> = {
  hand: "Hand prop", set_dressing: "Set dressing", furniture: "Furniture",
  consumable: "Consumable", weapon: "Weapon", paper: "Paper & docs", other: "Other",
};

type Piece = {
  id: string; item_name: string; category: string;
  size: string | null; thumbnail_url: string | null;
};

type MicInfo = { pack_number: string; element: string | null; channel: string | null };

type Look = {
  scene_id: string; character_name: string | null;
  costume_description: string | null; change_notes: string | null;
  change_location: string | null; status: string | null;
  scenes: { act: number; scene_number: number; title: string | null } | null;
};

export default async function DressingRoomPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: person } = await supabase
    .from("people")
    .select("id, full_name, preferred_name")
    .eq("user_id", user!.id)
    .single();

  if (!person) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <h1 className="font-display text-display-md text-ink mb-2">Dressing Room</h1>
        <p className="text-body-md text-ash">No profile found.</p>
      </div>
    );
  }

  // Resolve the active production from this person's own active assignments.
  const { data: assignmentRows } = await supabase
    .from("production_assignments")
    .select("productions(id, title, status)")
    .eq("person_id", person.id)
    .eq("active", true);

  const prods = (assignmentRows || [])
    .map((a) => a.productions as unknown as { id: string; title: string; status: string } | null)
    .filter(
      (p): p is { id: string; title: string; status: string } =>
        !!p && p.status !== "archived" && p.status !== "closed"
    );

  const cookieProd = await getActiveProductionId();
  const activeProduction = prods.find((p) => p.id === cookieProd) || prods[0] || null;

  let pieces: Piece[] = [];
  let props: Piece[] = [];
  let looks: Look[] = [];
  let myMic: MicInfo | null = null;

  if (activeProduction) {
    const [assignRes, propsRes, looksRes, micRes] = await Promise.all([
      supabase
        .from("costume_assignments")
        .select("costume_inventory(id, item_name, category, size, thumbnail_url)")
        .eq("person_id", person.id)
        .eq("production_id", activeProduction.id),
      supabase
        .from("prop_assignments")
        .select("props_inventory(id, item_name, category, size, thumbnail_url)")
        .eq("person_id", person.id)
        .eq("production_id", activeProduction.id),
      supabase
        .from("costume_plot")
        .select(
          "scene_id, character_name, costume_description, change_notes, change_location, status, scenes(act, scene_number, title)"
        )
        .eq("production_id", activeProduction.id)
        .eq("person_id", person.id),
      supabase
        .from("mic_assignments")
        .select("wireless_mics(pack_number, element, channel)")
        .eq("person_id", person.id)
        .eq("production_id", activeProduction.id)
        .maybeSingle(),
    ]);

    myMic = (micRes.data as unknown as { wireless_mics: MicInfo | null } | null)?.wireless_mics || null;

    pieces = ((assignRes.data || [])
      .map((r) => (r as unknown as { costume_inventory: Piece | null }).costume_inventory)
      .filter((p): p is Piece => !!p))
      .sort((a, b) => a.category.localeCompare(b.category));

    props = ((propsRes.data || [])
      .map((r) => (r as unknown as { props_inventory: Piece | null }).props_inventory)
      .filter((p): p is Piece => !!p))
      .sort((a, b) => a.category.localeCompare(b.category));
    looks = ((looksRes.data || []) as unknown as Look[]).sort((a, b) => {
      const actA = a.scenes?.act ?? 0;
      const actB = b.scenes?.act ?? 0;
      if (actA !== actB) return actA - actB;
      return (a.scenes?.scene_number ?? 0) - (b.scenes?.scene_number ?? 0);
    });
  }

  const displayName = person.preferred_name || person.full_name;
  const isEmpty = pieces.length === 0 && props.length === 0 && looks.length === 0 && !myMic;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-6">
        <h1 className="font-display text-display-md text-ink">Dressing Room</h1>
        <p className="text-body-md text-ash mt-1">
          {activeProduction ? (
            <>
              <span className="font-display italic">{activeProduction.title}</span>
              <span className="text-muted"> · {displayName}</span>
            </>
          ) : (
            "No active production."
          )}
        </p>
      </div>

      {myMic && (
        <div className="mb-6 inline-flex items-center gap-2 bg-brick/5 border border-brick/20 rounded-card px-3 py-2">
          <span className="text-body-xs text-muted uppercase tracking-wider">Mic</span>
          <span className="font-mono text-body-md font-semibold text-brick">{myMic.pack_number}</span>
          {(myMic.element || myMic.channel) && (
            <span className="text-body-xs text-ash">
              {[myMic.element, myMic.channel && `ch ${myMic.channel}`].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      )}

      {isEmpty ? (
        <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
          <p className="text-body-md text-ash">Nothing here yet.</p>
          <p className="text-body-xs text-muted mt-1">
            When wardrobe assigns your costumes and props, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {pieces.length > 0 && (
            <div>
              <p className="text-body-xs text-muted uppercase tracking-wider mb-2">Your costumes</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {pieces.map((item) => (
                  <div key={item.id} className="rounded-card overflow-hidden border border-bone bg-card">
                    {item.thumbnail_url ? (
                      <div className="aspect-square bg-bone/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.thumbnail_url}
                          alt={item.item_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="aspect-square bg-bone/20 flex items-center justify-center">
                        <span className="text-ash opacity-40 text-lg">◨</span>
                      </div>
                    )}
                    <div className="px-2 py-1.5">
                      <p className="text-body-xs font-medium text-ink truncate">{item.item_name}</p>
                      {item.size && <p className="font-mono text-[10px] text-ash">{item.size}</p>}
                      <p className="text-[9px] text-muted uppercase tracking-wider mt-0.5">
                        {CATEGORY_LABELS[item.category] || item.category}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {props.length > 0 && (
            <div>
              <p className="text-body-xs text-muted uppercase tracking-wider mb-2">Your props</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {props.map((item) => (
                  <div key={item.id} className="rounded-card overflow-hidden border border-bone bg-card">
                    {item.thumbnail_url ? (
                      <div className="aspect-square bg-bone/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.thumbnail_url}
                          alt={item.item_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="aspect-square bg-bone/20 flex items-center justify-center">
                        <span className="text-ash opacity-40 text-lg">◇</span>
                      </div>
                    )}
                    <div className="px-2 py-1.5">
                      <p className="text-body-xs font-medium text-ink truncate">{item.item_name}</p>
                      {item.size && <p className="font-mono text-[10px] text-ash">{item.size}</p>}
                      <p className="text-[9px] text-muted uppercase tracking-wider mt-0.5">
                        {PROP_CATEGORY_LABELS[item.category] || item.category}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {looks.length > 0 && (
            <div>
              <p className="text-body-xs text-muted uppercase tracking-wider mb-2">Your looks by scene</p>
              <div className="space-y-2">
                {looks.map((look, i) => (
                  <div key={`${look.scene_id}-${i}`} className="bg-card border border-bone rounded-card px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-body-sm font-medium text-ink">
                        {look.scenes
                          ? `Act ${look.scenes.act}, Sc ${look.scenes.scene_number}`
                          : "Scene"}
                        {look.scenes?.title && (
                          <span className="text-ash font-normal"> — {look.scenes.title}</span>
                        )}
                      </p>
                      {look.character_name && (
                        <span className="text-body-xs text-muted shrink-0">{look.character_name}</span>
                      )}
                    </div>
                    {look.costume_description && (
                      <p className="text-body-sm text-ash mt-1">{look.costume_description}</p>
                    )}
                    {(look.change_notes || look.change_location) && (
                      <p className="text-body-xs text-muted mt-1">
                        {look.change_notes}
                        {look.change_notes && look.change_location ? " · " : ""}
                        {look.change_location && <span className="font-mono">{look.change_location}</span>}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-body-xs text-muted">Wardrobe manages your costume assignments and changes.</p>
        </div>
      )}
    </div>
  );
}
