"use server";

import { createClient } from "@/lib/supabase/server";

interface LogActivityParams {
  productionId: string;
  orgId: string;
  actorPersonId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record a production activity. Fire-and-forget — never throws.
 * Call this from any server action where something changes.
 */
export async function logActivity(params: LogActivityParams) {
  try {
    const supabase = await createClient();

    // If no actorPersonId provided, try to get it from the session
    let actorId = params.actorPersonId;
    if (!actorId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: person } = await supabase
          .from("people")
          .select("id")
          .eq("user_id", user.id)
          .single();
        actorId = person?.id || undefined;
      }
    }

    await supabase.from("activity_log").insert({
      production_id: params.productionId,
      org_id: params.orgId,
      actor_person_id: actorId || null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      summary: params.summary,
      metadata: params.metadata || {},
    });
  } catch (err) {
    console.error("logActivity failed:", err);
  }
}
