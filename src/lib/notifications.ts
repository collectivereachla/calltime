import { createClient } from "@/lib/supabase/server";

interface CreateNotificationParams {
  personId: string;
  orgId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create an in-app notification for a person.
 * Call this from server actions when events happen (contract signed, etc.)
 */
export async function createNotification(params: CreateNotificationParams) {
  const supabase = await createClient();

  const { error } = await supabase.from("notifications").insert({
    person_id: params.personId,
    org_id: params.orgId,
    type: params.type,
    title: params.title,
    body: params.body || null,
    link: params.link || null,
    metadata: params.metadata || null,
  });

  if (error) {
    console.error("Failed to create notification:", error.message);
  }

  // TODO: Send email notification via Resend when email provider is configured
  // await sendNotificationEmail(params);
}

/**
 * Notify all owners in an org about an event.
 */
export async function notifyOrgOwners(
  orgId: string,
  notification: Omit<CreateNotificationParams, "personId" | "orgId">
) {
  const supabase = await createClient();

  const { data: owners } = await supabase
    .from("org_memberships")
    .select("person_id")
    .eq("org_id", orgId)
    .eq("role", "owner");

  if (!owners || owners.length === 0) return;

  for (const owner of owners) {
    await createNotification({
      personId: owner.person_id,
      orgId,
      ...notification,
    });
  }
}
