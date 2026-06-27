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

/**
 * Notify people @mentioned in a Greenroom message (high-signal, any room).
 * Fire-and-forget from the client after a successful insert. createNotification
 * inserts under the caller's RLS (notifications.org_id in user_org_ids()), so a
 * caller can only notify within their own org.
 */
export async function notifyMentions(
  orgId: string,
  senderName: string,
  content: string,
  mentionedPersonIds: string[],
  _productionId: string | null,
) {
  if (!mentionedPersonIds || mentionedPersonIds.length === 0) return;
  const preview = content.length > 80 ? content.slice(0, 77) + "…" : content;
  const unique = [...new Set(mentionedPersonIds)];
  for (const personId of unique) {
    createNotification({
      personId,
      orgId,
      type: "mention",
      title: `${senderName} mentioned you`,
      body: preview,
      link: "/greenroom",
    }).catch(() => {});
  }
}

/**
 * Notify the OTHER participants of a conversation about a new direct message.
 * createNotification inserts under the sender's RLS (org-scoped), and the sender
 * is a participant so they can read the participant list.
 */
export async function notifyDM(conversationId: string, senderName: string, content: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  const { data: conv } = await supabase.from("conversations").select("org_id").eq("id", conversationId).maybeSingle();
  if (!conv) return;
  const { data: parts } = await supabase
    .from("conversation_participants").select("person_id").eq("conversation_id", conversationId);
  const preview = content.length > 80 ? content.slice(0, 77) + "…" : content;
  for (const pp of parts || []) {
    if (pp.person_id === me?.id) continue;
    createNotification({
      personId: pp.person_id,
      orgId: conv.org_id as string,
      type: "dm",
      title: `${senderName} messaged you`,
      body: preview,
      link: "/greenroom",
    }).catch(() => {});
  }
}
