import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, buildInvitationEmail } from "@/lib/email";
import { resolveActingOrgId } from "@/lib/membership";

export const dynamic = "force-dynamic";

export async function POST() {
  // Check env vars first
  const hasResend = !!process.env.RESEND_API_KEY;
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!hasResend) {
    return NextResponse.json({ 
      error: `RESEND_API_KEY is not set. Env check: RESEND_API_KEY=${hasResend}, SUPABASE_SERVICE_ROLE_KEY=${hasServiceRole}` 
    }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: person } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, email")
    .eq("user_id", user.id)
    .single();

  if (!person?.email) {
    return NextResponse.json({ error: "No email on your account" }, { status: 400 });
  }

  // Use the caller's actual org + a current production, not hardcoded BTE/TJS.
  const orgId = await resolveActingOrgId(person.id);
  let orgName = "your organization";
  let productionTitle = "your production";
  if (orgId) {
    const { data: org } = await supabase
      .from("organizations").select("name").eq("id", orgId).maybeSingle();
    if (org?.name) orgName = org.name;
    const { data: prod } = await supabase
      .from("productions").select("title")
      .eq("org_id", orgId)
      .not("status", "in", "(closed,archived)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prod?.title) productionTitle = prod.title;
  }

  const html = buildInvitationEmail({
    name: person.preferred_name || person.full_name,
    orgName,
    productionTitle,
    roleTitle: "Member",
    tempPassword: "aB3x7kQ9",
    loginUrl: "https://checkcalltime.art/login",
  });

  const result = await sendEmail({
    to: person.email,
    subject: `Your Calltime account is ready — ${productionTitle}`,
    html,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ message: `Test sent to ${person.email}` });
}
