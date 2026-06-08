import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, buildInvitationEmail } from "@/lib/email";
import { getActiveProductionId } from "@/lib/active-production";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  if (!person) return NextResponse.json({ error: "No person record" }, { status: 403 });

  const admin = createAdminClient();

  // A person can own multiple orgs, so never collapse owner memberships with
  // .single(). Scope to the production the caller is working in and confirm
  // they own that org.
  const activeProductionId = await getActiveProductionId();
  let orgId: string | null = null;
  let production: { id: string; title: string } | null = null;

  if (activeProductionId) {
    const { data: prod } = await admin
      .from("productions").select("id, title, org_id").eq("id", activeProductionId).maybeSingle();
    if (prod) { orgId = prod.org_id as string; production = { id: prod.id as string, title: prod.title as string }; }
  }

  if (!orgId) {
    const { data: owned } = await supabase
      .from("org_memberships").select("org_id").eq("person_id", person.id).eq("role", "owner");
    if ((owned?.length || 0) === 1) {
      orgId = owned![0].org_id as string;
      const { data: prod } = await admin
        .from("productions").select("id, title").eq("org_id", orgId).neq("status", "closed")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (prod) production = { id: prod.id as string, title: prod.title as string };
    } else if ((owned?.length || 0) > 1) {
      return NextResponse.json({ error: "You own more than one organization. Open the production you want to resend invites for, then try again." }, { status: 400 });
    }
  }

  if (!orgId) return NextResponse.json({ error: "Only owners can resend invites" }, { status: 403 });

  const { data: ownerMembership } = await supabase
    .from("org_memberships").select("role").eq("person_id", person.id).eq("org_id", orgId).eq("role", "owner").maybeSingle();
  if (!ownerMembership) return NextResponse.json({ error: "Only owners can resend invites" }, { status: 403 });

  // Get org info
  const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();

  // Find people with accounts who haven't logged in (scoped to this org)
  const { data: members } = await supabase
    .from("org_memberships")
    .select("person_id, people!inner(id, full_name, preferred_name, email, user_id)")
    .eq("org_id", orgId);

  if (!members) return NextResponse.json({ error: "Could not fetch members" }, { status: 500 });

  // Filter to people with user_id but no last_sign_in_at
  const needsResend: { id: string; name: string; displayName: string; email: string; userId: string }[] = [];

  for (const m of members) {
    const p = m.people as unknown as { id: string; full_name: string; preferred_name: string | null; email: string | null; user_id: string | null };
    if (!p.user_id || !p.email) continue;

    // Check if they've ever logged in
    const { data: authUser } = await admin.auth.admin.getUserById(p.user_id);
    if (authUser?.user?.last_sign_in_at) continue;

    needsResend.push({
      id: p.id,
      name: p.full_name,
      displayName: p.preferred_name || p.full_name.split(" ")[0],
      email: p.email,
      userId: p.user_id,
    });
  }

  if (needsResend.length === 0) {
    return NextResponse.json({ message: "Everyone has logged in", sent: 0, skipped: 0 });
  }

  let sent = 0;
  let failed = 0;

  for (const p of needsResend) {
    const tempPassword = generatePassword();

    try {
      // Reset password
      const { error: resetErr } = await admin.auth.admin.updateUserById(p.userId, { password: tempPassword });
      if (resetErr) { failed++; continue; }

      // Get role
      const { data: assignment } = await supabase
        .from("production_assignments")
        .select("role_title")
        .eq("person_id", p.id)
        .eq("production_id", production?.id || "")
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      const html = buildInvitationEmail({
        name: p.displayName,
        orgName: org?.name || "Your Company",
        productionTitle: production?.title || "Your Production",
        roleTitle: assignment?.role_title || "Company Member",
        tempPassword,
        loginUrl: "https://checkcalltime.art/login",
      });

      const emailResult = await sendEmail({
        to: p.email,
        subject: `Your Calltime login — ${production?.title || ""}`,
        html,
      });

      if (emailResult.error) { failed++; } else { sent++; }
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, total: needsResend.length });
}
