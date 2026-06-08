"use server";
import { assertNotPreviewing, getViewer } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";

// Notify the Stage Manager and Director of a production. Uses the admin client
// to resolve leads so RLS can never hide them from the fan-out.
async function notifyLeads(
  productionId: string,
  actorPersonId: string,
  actorName: string,
  body: string,
  isReply: boolean,
  alsoNotify: string[] = []
) {
  const admin = createAdminClient();
  const { data: prod } = await admin
    .from("productions")
    .select("org_id")
    .eq("id", productionId)
    .single();
  if (!prod) return;

  const { data: leads } = await admin
    .from("production_assignments")
    .select("person_id, department")
    .eq("production_id", productionId)
    .eq("active", true)
    .in("department", ["stage_management", "directing"]);

  const recipients = new Set<string>([
    ...(leads || []).map((l) => l.person_id as string),
    ...alsoNotify,
  ]);
  recipients.delete(actorPersonId);

  const preview = body.length > 90 ? body.slice(0, 87) + "…" : body;
  const title = isReply ? `${actorName} replied: design Q&A` : `${actorName}: design question`;

  for (const personId of recipients) {
    createNotification({
      personId,
      orgId: prod.org_id as string,
      type: "design_question",
      title,
      body: preview,
      link: "/booth",
    }).catch(() => {});
  }
}

export async function createDesignQuestion(data: {
  production_id: string;
  scene_id?: string | null;
  script_line_id?: string | null;
  department?: string | null;
  body: string;
}) {
  await assertNotPreviewing();
  if (!data.body.trim()) return { error: "Question can't be empty" };
  const supabase = await createClient();
  const viewer = await getViewer(supabase);
  if (!viewer.personId) return { error: "Not signed in" };

  const { data: row, error } = await supabase
    .from("design_questions")
    .insert({
      production_id: data.production_id,
      scene_id: data.scene_id || null,
      script_line_id: data.script_line_id || null,
      department: data.department || null,
      author_person_id: viewer.personId,
      body: data.body.trim(),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const name = viewer.person?.preferred_name || viewer.person?.full_name || "A teammate";
  await notifyLeads(data.production_id, viewer.personId, name, data.body.trim(), false);

  revalidatePath("/booth");
  return { success: true, id: row.id };
}

export async function addDesignReply(data: { question_id: string; body: string }) {
  await assertNotPreviewing();
  if (!data.body.trim()) return { error: "Reply can't be empty" };
  const supabase = await createClient();
  const viewer = await getViewer(supabase);
  if (!viewer.personId) return { error: "Not signed in" };

  const { error } = await supabase.from("design_question_replies").insert({
    question_id: data.question_id,
    author_person_id: viewer.personId,
    body: data.body.trim(),
  });
  if (error) return { error: error.message };

  // Resolve the parent question's production + author so we notify leads + asker.
  const admin = createAdminClient();
  const { data: q } = await admin
    .from("design_questions")
    .select("production_id, author_person_id")
    .eq("id", data.question_id)
    .single();
  if (q) {
    const name = viewer.person?.preferred_name || viewer.person?.full_name || "A teammate";
    await notifyLeads(q.production_id, viewer.personId, name, data.body.trim(), true, [q.author_person_id]);
  }

  revalidatePath("/booth");
  return { success: true };
}

// Status change. RLS restricts this to the author and to SM/director/leadership.
export async function setDesignQuestionStatus(id: string, status: "open" | "answered" | "resolved") {
  await assertNotPreviewing();
  const supabase = await createClient();
  const viewer = await getViewer(supabase);

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "resolved") {
    patch.resolved_by = viewer.personId;
    patch.resolved_at = new Date().toISOString();
  } else {
    patch.resolved_by = null;
    patch.resolved_at = null;
  }

  const { error } = await supabase.from("design_questions").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function deleteDesignQuestion(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.from("design_questions").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function deleteDesignReply(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.from("design_question_replies").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}
