import { createClient } from "@/lib/supabase/server";
import { GreenroomChat } from "./greenroom-chat";
import { resolveActingOrgId, getRoleInOrg, isLeadershipRole } from "@/lib/membership";

export default async function GreenroomPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: person } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, headshot_url")
    .eq("user_id", user!.id)
    .single();

  // Resolve the org from the SELECTED show (active production), never an
  // arbitrary membership. A person works across orgs; the old
  // limit(1).single() silently picked one (BTE) and leaked its greenroom into
  // every other org's context.
  const orgId = await resolveActingOrgId(person!.id);

  if (!orgId) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">Select a production to open its greenroom.</p>
      </div>
    );
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();
  const orgName = org?.name ?? "";
  const canManage = isLeadershipRole(await getRoleInOrg(person!.id, orgId));

  // Fetch initial messages (most recent 50)
  const { data: initialMessages } = await supabase
    .from("messages")
    .select("id, content, created_at, person_id, attachment_url, attachment_name, attachment_type, people(id, full_name, preferred_name, headshot_url)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  // Reverse so oldest is first (chat order)
  const messages = (initialMessages || []).reverse();

  return (
    <GreenroomChat
      orgId={orgId}
      orgName={orgName}
      personId={person!.id}
      personName={person!.preferred_name || person!.full_name}
      personHeadshot={person!.headshot_url}
      canManage={canManage}
      initialMessages={messages.map((m) => {
        const p = m.people as unknown as {
          id: string; full_name: string; preferred_name: string | null; headshot_url: string | null;
        };
        return {
          id: m.id,
          content: m.content,
          created_at: m.created_at,
          person_id: m.person_id,
          author_name: p?.preferred_name || p?.full_name || "Unknown",
          author_headshot: p?.headshot_url || null,
          attachment_url: m.attachment_url || null,
          attachment_name: m.attachment_name || null,
          attachment_type: m.attachment_type || null,
        };
      })}
    />
  );
}
