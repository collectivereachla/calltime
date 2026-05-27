import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, buildInvitationEmail } from "@/lib/email";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Verify caller is an owner
  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  if (!person) return NextResponse.json({ error: "No person record" }, { status: 403 });

  const { data: membership } = await supabase
    .from("org_memberships").select("role, org_id").eq("person_id", person.id).eq("role", "owner").single();
  if (!membership) return NextResponse.json({ error: "Only owners can resend invites" }, { status: 403 });

  const body = await request.json();
  const { personIds } = body as { personIds: string[] };

  if (!personIds || personIds.length === 0) {
    return NextResponse.json({ error: "No personIds provided" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: org } = await supabase.from("organizations").select("name").eq("id", membership.org_id).single();
  const { data: production } = await supabase
    .from("productions").select("title").eq("org_id", membership.org_id).neq("status", "closed").order("created_at", { ascending: false }).limit(1).single();

  const results: { name: string; email: string; status: string; error?: string }[] = [];

  for (const pid of personIds) {
    const { data: p } = await supabase
      .from("people")
      .select("full_name, preferred_name, email, user_id")
      .eq("id", pid)
      .single();

    if (!p || !p.email) {
      results.push({ name: p?.full_name || "Unknown", email: "", status: "skipped", error: "No email" });
      continue;
    }

    const displayName = p.preferred_name || p.full_name.split(" ")[0];
    const tempPassword = generatePassword();

    try {
      if (p.user_id) {
        // Reset existing user's password
        const { error: resetErr } = await admin.auth.admin.updateUserById(p.user_id, {
          password: tempPassword,
        });
        if (resetErr) {
          results.push({ name: p.full_name, email: p.email, status: "error", error: resetErr.message });
          continue;
        }
      } else {
        // Create new account
        const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
          email: p.email,
          password: tempPassword,
          email_confirm: true,
        });
        if (createErr) {
          results.push({ name: p.full_name, email: p.email, status: "error", error: createErr.message });
          continue;
        }
        // Link person to account
        await admin.from("people").update({ user_id: newUser.user.id }).eq("id", pid);
      }

      // Get role title
      const { data: assignment } = await supabase
        .from("production_assignments")
        .select("role_title")
        .eq("person_id", pid)
        .eq("active", true)
        .limit(1)
        .single();

      const html = buildInvitationEmail({
        name: displayName,
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

      if (emailResult.error) {
        results.push({ name: p.full_name, email: p.email, status: "password_reset_email_failed", error: emailResult.error });
      } else {
        results.push({ name: p.full_name, email: p.email, status: "sent" });
      }

      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      results.push({ name: p.full_name, email: p.email, status: "error", error: String(err) });
    }
  }

  const sent = results.filter((r) => r.status === "sent").length;
  return NextResponse.json({ sent, total: results.length, results });
}
