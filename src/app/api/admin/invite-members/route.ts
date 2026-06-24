import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, buildInvitationEmail } from "@/lib/email";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // allow up to 60s for batch processing

function generatePassword(): string {
  // 12-char alphanumeric, easy to type
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

export async function POST(request: Request) {
  // Verify caller is an authenticated org owner
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!caller) {
    return NextResponse.json({ error: "No person record" }, { status: 403 });
  }

  const { data: ownership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("person_id", caller.id)
    .eq("role", "owner");

  if (!ownership || ownership.length === 0) {
    return NextResponse.json({ error: "Not an org owner" }, { status: 403 });
  }

  const ownedOrgIds = ownership.map((o) => o.org_id);

  // Parse optional filters from request body
  const body = await request.json().catch(() => ({}));
  const productionId = body.productionId as string | undefined;
  const orgId = body.orgId as string | undefined;

  // A body orgId must be one the caller actually owns — never trust it blindly.
  if (orgId && !ownedOrgIds.includes(orgId)) {
    return NextResponse.json({ error: "You don't own that organization" }, { status: 403 });
  }

  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://checkcalltime.art";

  // Find people who need accounts: have email, no user_id, in caller's org
  const query = admin
    .from("people")
    .select(
      `
      id, full_name, preferred_name, email,
      production_assignments!inner (
        production_id, role_title, department,
        productions!inner ( title, org_id, organizations!inner ( name ) )
      )
    `
    )
    .is("user_id", null)
    .not("email", "is", null)
    .in(
      "production_assignments.productions.org_id",
      orgId ? [orgId] : ownedOrgIds
    );

  if (productionId) {
    query.eq("production_assignments.production_id", productionId);
  }

  const { data: people, error: fetchErr } = await query;

  if (fetchErr) {
    console.error("Invite fetch error:", fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!people || people.length === 0) {
    return NextResponse.json({
      message: "No members need invitations",
      invited: 0,
    });
  }

  // Check for existing auth users with these emails to avoid duplicates
  const results: {
    name: string;
    email: string;
    status: "invited" | "skipped" | "failed";
    reason?: string;
  }[] = [];

  for (const person of people) {
    const email = person.email!;
    const name =
      person.preferred_name || person.full_name.split(" ")[0];

    // Check if auth user already exists with this email
    const { data: existingUsers } =
      await admin.auth.admin.listUsers();

    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (existingUser) {
      // Link existing auth user to this person record
      await admin
        .from("people")
        .update({ user_id: existingUser.id })
        .eq("id", person.id);

      results.push({
        name: person.full_name,
        email,
        status: "skipped",
        reason: "Auth user already exists, linked to person record",
      });
      continue;
    }

    // Generate temp password and create auth user
    const tempPassword = generatePassword();

    const { data: newUser, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });

    if (createErr) {
      console.error(`Failed to create user for ${email}:`, createErr.message);
      results.push({
        name: person.full_name,
        email,
        status: "failed",
        reason: createErr.message,
      });
      continue;
    }

    // Link auth user to person record
    await admin
      .from("people")
      .update({ user_id: newUser.user.id })
      .eq("id", person.id);

    // Ensure org membership exists
    const assignment = (
      person.production_assignments as unknown as {
        production_id: string;
        role_title: string;
        department: string;
        productions: {
          title: string;
          org_id: string;
          organizations: { name: string };
        };
      }[]
    )[0];

    if (assignment) {
      await admin.from("org_memberships").upsert(
        {
          person_id: person.id,
          org_id: assignment.productions.org_id,
          role: "member",
          status: "active",
        },
        { onConflict: "org_id,person_id" }
      );
    }

    // Send invitation email
    const html = buildInvitationEmail({
      name,
      orgName: assignment?.productions.organizations.name || "Your organization",
      productionTitle: assignment?.productions.title || "your production",
      roleTitle: assignment?.role_title || "Member",
      tempPassword,
      loginUrl: `${appUrl}/login`,
    });

    const emailResult = await sendEmail({
      to: email,
      subject: `Your Calltime account is ready — ${assignment?.productions.title || ""}`,
      html,
    });

    if (emailResult.error) {
      console.error(`Invitation email failed for ${email}:`, emailResult.error);
      results.push({
        name: person.full_name,
        email,
        status: "failed",
        reason: `Account created but email failed: ${emailResult.error}`,
      });
    } else {
      results.push({
        name: person.full_name,
        email,
        status: "invited",
      });
    }
  }

  const invited = results.filter((r) => r.status === "invited").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return NextResponse.json({
    message: `Invited ${invited}, skipped ${skipped}, failed ${failed}`,
    invited,
    skipped,
    failed,
    details: results,
  });
}
