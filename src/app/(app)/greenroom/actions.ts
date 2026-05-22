"use server";

import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";

/**
 * Notify all org members (except sender) about a new Greenroom message.
 * Called fire-and-forget from the client after a successful insert.
 */
export async function notifyGreenroomMessage(
  orgId: string,
  senderPersonId: string,
  senderName: string,
  content: string,
) {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("org_memberships")
    .select("person_id")
    .eq("org_id", orgId)
    .eq("status", "active");

  if (!members || members.length === 0) return;

  const preview = content.length > 80 ? content.slice(0, 77) + "…" : content;

  for (const member of members) {
    if (member.person_id === senderPersonId) continue;

    createNotification({
      personId: member.person_id,
      orgId,
      type: "greenroom_message",
      title: `${senderName} in Greenroom`,
      body: preview,
      link: "/greenroom",
    }).catch(() => {});
  }
}
