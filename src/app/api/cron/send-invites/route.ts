import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, buildInvitationEmail } from "@/lib/email";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this header automatically)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find all people who need accounts: have email, no user_id, in an active production
  const { data: pending, error: fetchErr } = await admin
    .from("people")
    .select(`
      id, full_name, preferred_name, email,
      production_assignments!inner (
        production_id, role_title, department, active,
        productions!inner ( title, org_id, status, organizations!inner ( name ) )
      )
    `)
    .is("user_id", null)
    .not("email", "is", null);

  if (fetchErr || !pending || pending.length === 0) {
    return NextResponse.json({ message: "No pending invites", invited: 0 });
  }

  // Filter to active assignments in non-closed productions
  type PersonRow = typeof pending[0];
  const eligible = pending.filter((p) => {
    const assignments = p.production_assignments as unknown as {
      active: boolean;
      productions: { status: string };
    }[];
    return assignments.some((a) => a.active && a.productions.status !== "closed");
  });

  if (eligible.length === 0) {
    return NextResponse.json({ message: "No pending invites", invited: 0 });
  }

  // Group by email (handles shared accounts)
  const byEmail: Record<string, PersonRow[]> = {};
  for (const p of eligible) {
    const email = p.email!.toLowerCase().trim();
    if (!byEmail[email]) byEmail[email] = [];
    byEmail[email].push(p);
  }

  let invited = 0;
  let failed = 0;

  for (const [email, people] of Object.entries(byEmail)) {
    try {
      // Check if auth user already exists
      const { data: existingUsers } = await admin.auth.admin.listUsers();
      const existing = existingUsers?.users?.find(
        (u) => u.email?.toLowerCase() === email
      );

      let userId: string;
      let tempPassword: string | null = null;

      if (existing) {
        userId = existing.id;
      } else {
        tempPassword = generatePassword();
        const { data: newUser, error: authErr } = await admin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
        });
        if (authErr || !newUser) {
          console.error(`Failed to create user for ${email}:`, authErr?.message);
          failed++;
          continue;
        }
        userId = newUser.user.id;
      }

      // Link people records
      for (const p of people) {
        await admin.from("people").update({ user_id: userId }).eq("id", p.id);
      }

      // Only send email for NEW accounts (not already existing)
      if (tempPassword) {
        const names = people.map((p) => p.preferred_name || p.full_name.split(" ")[0]);
        const assignment = (people[0].production_assignments as unknown as {
          role_title: string;
          productions: { title: string; organizations: { name: string } };
        }[])[0];

        const roles = people.map((p) => {
          const a = (p.production_assignments as unknown as { role_title: string }[])[0];
          return a?.role_title || "Company Member";
        });

        const html = buildInvitationEmail({
          name: names.join(" & "),
          orgName: assignment.productions.organizations.name,
          productionTitle: assignment.productions.title,
          roleTitle: roles.join(" / "),
          tempPassword,
          loginUrl: "https://checkcalltime.art/login",
        });

        const result = await sendEmail({
          to: email,
          subject: `Your Calltime account is ready — ${assignment.productions.title}`,
          html,
        });

        if (result.error) {
          console.error(`Email failed for ${email}:`, result.error);
          failed++;
        } else {
          invited++;
        }
      }

      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`Invite error for ${email}:`, err);
      failed++;
    }
  }

  console.log(`Cron invite: ${invited} invited, ${failed} failed`);
  return NextResponse.json({ invited, failed, total: Object.keys(byEmail).length });
}
