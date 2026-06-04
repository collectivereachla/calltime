"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import {
  PREVIEW_COOKIE,
  getViewer,
  targetIsInOwnerOrgs,
} from "@/lib/viewer";

// NOTE: these two actions are deliberately NOT guarded by assertNotPreviewing —
// exiting must always work, and entering re-validates from scratch.

export async function enterPreview(targetPersonId: string) {
  const supabase = await createClient();
  const viewer = await getViewer(supabase);

  // Only an owner may preview, and only people inside their own orgs.
  if (!viewer.canPreview || !viewer.realPersonId) {
    throw new Error("Not authorized to preview.");
  }
  if (targetPersonId === viewer.realPersonId) {
    redirect("/home");
  }
  const allowed = await targetIsInOwnerOrgs(
    supabase,
    targetPersonId,
    viewer.ownerOrgIds
  );
  if (!allowed) {
    throw new Error("That person is not in one of your organizations.");
  }

  await logAudit({
    action: "enter_preview",
    entityType: "person",
    targetPersonId,
    metadata: { realPersonId: viewer.realPersonId },
  });

  const jar = await cookies();
  jar.set(PREVIEW_COOKIE, targetPersonId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // 4h safety expiry
  });

  redirect("/home");
}

export async function exitPreview() {
  const jar = await cookies();
  jar.delete(PREVIEW_COOKIE);
  redirect("/home");
}
