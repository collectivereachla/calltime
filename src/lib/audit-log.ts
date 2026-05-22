"use server";

import { createClient } from "@/lib/supabase/server";

interface AuditParams {
  action: string;
  entityType: string;
  entityId?: string;
  targetPersonId?: string;
  orgId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record an audit event for sensitive data access or changes.
 * Fire-and-forget — never throws, never blocks.
 *
 * Actions:
 *   view_contract, sign_contract, countersign_contract, void_contract
 *   view_measurements, update_measurements
 *   view_emergency_contact
 *   view_compensation
 *   export_data
 *   update_member_role, remove_member
 */
export async function logAudit(params: AuditParams) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    let actorPersonId: string | null = null;

    if (user) {
      const { data: person } = await supabase
        .from("people")
        .select("id")
        .eq("user_id", user.id)
        .single();
      actorPersonId = person?.id || null;
    }

    await supabase.from("audit_log").insert({
      actor_person_id: actorPersonId,
      actor_user_id: user?.id || null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      target_person_id: params.targetPersonId || null,
      org_id: params.orgId || null,
      metadata: params.metadata || {},
    });
  } catch (err) {
    console.error("logAudit failed:", err);
  }
}
