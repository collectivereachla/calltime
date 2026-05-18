import { createClient } from "@/lib/supabase/server";
import { GreenroomChat } from "./greenroom-chat";

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

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id, role, organizations(name)")
    .eq("person_id", person!.id)
    .limit(1)
    .single();

  if (!membership) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">No organization found.</p>
      </div>
    );
  }

  const orgId = membership.org_id;
  const orgName = (membership.organizations as unknown as { name: string }).name;
  const canManage = membership.role === "owner" || membership.role === "production";

  // Fetch initial messages (most recent 50)
  const { data: initialMessages } = await supabase
    .from("messages")
    .select("id, content, created_at, person_id, people(id, full_name, preferred_name, headshot_url)")
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
        };
      })}
    />
  );
}
