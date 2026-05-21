import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend() {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not set");
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM_ADDRESS =
  process.env.RESEND_FROM_EMAIL || "Calltime <onboarding@resend.dev>";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Email send failed:", error);
      return { error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error("Email error:", err);
    return { error: "Failed to send email" };
  }
}

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------

function emailWrapper(orgName: string, content: string, footer?: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #FAF7F1; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 20px;">
    <p style="font-family: Georgia, 'Newsreader', serif; font-size: 20px; color: #1A1A1B; margin: 0 0 4px 0;">
      Calltime<span style="color: #C4522D;">.</span>
    </p>
    <p style="font-size: 12px; color: #7A726A; margin: 0 0 24px 0;">${orgName}</p>

    ${content}

    <p style="font-size: 12px; color: #A39E96; margin: 24px 0 0 0;">
      ${footer || "This is an automated message from Calltime."}
    </p>
  </div>
</body>
</html>`;
}

function ctaButton(label: string, url: string) {
  return `<div style="margin: 24px 0; text-align: center;">
  <a href="${url}" style="display: inline-block; padding: 10px 24px; background-color: #1A1A1B; color: #FAF7F1; font-size: 14px; font-weight: 500; text-decoration: none; border-radius: 8px;">
    ${label}
  </a>
</div>`;
}

function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function timeRange(
  startTime: string | null,
  endTime: string | null
): string {
  if (!startTime) return "Time TBD";
  const start = formatTime12(startTime);
  return endTime ? `${start} – ${formatTime12(endTime)}` : start;
}

// ---------------------------------------------------------------------------
// 1. Event Call — "You've been called"
// ---------------------------------------------------------------------------

export function buildEventCallEmail({
  name,
  orgName,
  eventTitle,
  eventType,
  eventDate,
  startTime,
  endTime,
  location,
  productionTitle,
  callboardUrl,
}: {
  name: string;
  orgName: string;
  eventTitle: string;
  eventType: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  productionTitle: string;
  callboardUrl: string;
}) {
  const content = `
    <p style="font-size: 15px; color: #1A1A1B; margin: 0 0 20px 0;">
      ${name}, you've been called.
    </p>

    <div style="background: #FFFFFF; border: 1px solid #E8E1D2; border-radius: 8px; padding: 20px; margin-bottom: 8px;">
      <p style="font-size: 11px; color: #7A726A; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 4px 0;">${productionTitle}</p>
      <p style="font-size: 17px; color: #1A1A1B; font-weight: 600; margin: 0 0 12px 0;">${eventTitle}</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; font-size: 13px; color: #7A726A; width: 70px;">Type</td>
          <td style="padding: 4px 0; font-size: 14px; color: #1A1A1B;">${eventType}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-size: 13px; color: #7A726A;">Date</td>
          <td style="padding: 4px 0; font-size: 14px; color: #1A1A1B;">${formatDate(eventDate)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-size: 13px; color: #7A726A;">Time</td>
          <td style="padding: 4px 0; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #1A1A1B;">${timeRange(startTime, endTime)}</td>
        </tr>
        ${location ? `<tr>
          <td style="padding: 4px 0; font-size: 13px; color: #7A726A;">Where</td>
          <td style="padding: 4px 0; font-size: 14px; color: #1A1A1B;">${location}</td>
        </tr>` : ""}
      </table>
    </div>

    ${ctaButton("Respond on Callboard", callboardUrl)}`;

  return emailWrapper(
    orgName,
    content,
    "Please confirm, mark tentative, or report a conflict on the Callboard before the call."
  );
}

// ---------------------------------------------------------------------------
// 2. Nudge — "You haven't responded"
// ---------------------------------------------------------------------------

export function buildNudgeEmail({
  name,
  orgName,
  events,
  callboardUrl,
}: {
  name: string;
  orgName: string;
  events: {
    title: string;
    date: string;
    startTime: string | null;
    productionTitle: string;
  }[];
  callboardUrl: string;
}) {
  const count = events.length;
  const eventList = events
    .map(
      (e) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #E8E1D2; font-size: 14px; color: #1A1A1B;">${e.title}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #E8E1D2; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #7A726A;">${formatDateShort(e.date)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #E8E1D2; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #7A726A;">${e.startTime ? formatTime12(e.startTime) : "TBD"}</td>
    </tr>`
    )
    .join("");

  const content = `
    <p style="font-size: 15px; color: #1A1A1B; margin: 0 0 6px 0;">
      ${name}, you have ${count} call${count === 1 ? "" : "s"} waiting for a response.
    </p>
    <p style="font-size: 13px; color: #7A726A; margin: 0 0 20px 0;">
      Your stage manager needs to know if you'll be there.
    </p>

    <table style="width: 100%; border-collapse: collapse; background: #FFFFFF; border: 1px solid #E8E1D2; border-radius: 8px;">
      <thead>
        <tr>
          <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #7A726A; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E8E1D2;">Call</th>
          <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #7A726A; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E8E1D2;">Date</th>
          <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #7A726A; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E8E1D2;">Time</th>
        </tr>
      </thead>
      <tbody>
        ${eventList}
      </tbody>
    </table>

    ${ctaButton("Respond Now", callboardUrl)}`;

  return emailWrapper(
    orgName,
    content,
    "Confirm, mark tentative, or report a conflict on the Callboard. This is the only nudge you'll receive for these calls."
  );
}

// ---------------------------------------------------------------------------
// 3. Welcome — "You've been added to a production"
// ---------------------------------------------------------------------------

export function buildWelcomeEmail({
  name,
  orgName,
  productionTitle,
  roleTitle,
  department,
  appUrl,
}: {
  name: string;
  orgName: string;
  productionTitle: string;
  roleTitle: string;
  department: string;
  appUrl: string;
}) {
  const content = `
    <p style="font-size: 15px; color: #1A1A1B; margin: 0 0 20px 0;">
      ${name}, welcome to <strong>${productionTitle}</strong>.
    </p>

    <div style="background: #FFFFFF; border: 1px solid #E8E1D2; border-radius: 8px; padding: 20px; margin-bottom: 8px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; font-size: 13px; color: #7A726A; width: 90px;">Role</td>
          <td style="padding: 4px 0; font-size: 14px; color: #1A1A1B; font-weight: 500;">${roleTitle}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-size: 13px; color: #7A726A;">Department</td>
          <td style="padding: 4px 0; font-size: 14px; color: #1A1A1B;">${department}</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; color: #7A726A; margin: 16px 0 0 0;">
      You'll receive schedule notifications and weekly reminders here. Check the Callboard for your upcoming calls.
    </p>

    ${ctaButton("Open Calltime", appUrl)}`;

  return emailWrapper(
    orgName,
    content,
    "You're receiving this because you were added to a production on Calltime."
  );
}

// ---------------------------------------------------------------------------
// 4. Weekly Reminder (existing, refactored to use shared layout)
// ---------------------------------------------------------------------------

export function buildWeeklyReminderEmail({
  name,
  orgName,
  events,
  callboardUrl,
}: {
  name: string;
  orgName: string;
  events: {
    title: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    location: string | null;
    productionTitle: string;
  }[];
  callboardUrl: string;
}) {
  const eventRows = events
    .map(
      (e) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E8E1D2; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #1A1A1B;">${formatDateShort(e.date)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E8E1D2; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #7A726A;">${timeRange(e.startTime, e.endTime)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E8E1D2; font-size: 14px; color: #1A1A1B;">${e.title}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E8E1D2; font-size: 13px; color: #7A726A;">${e.location || ""}</td>
        </tr>`
    )
    .join("");

  const content = `
    <p style="font-size: 15px; color: #1A1A1B; margin: 0 0 20px 0;">
      ${name}, here's your week.
    </p>

    <table style="width: 100%; border-collapse: collapse; background: #FFFFFF; border: 1px solid #E8E1D2; border-radius: 8px;">
      <thead>
        <tr>
          <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #7A726A; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E8E1D2;">Date</th>
          <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #7A726A; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E8E1D2;">Time</th>
          <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #7A726A; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E8E1D2;">Call</th>
          <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #7A726A; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E8E1D2;">Location</th>
        </tr>
      </thead>
      <tbody>
        ${eventRows}
      </tbody>
    </table>

    ${ctaButton("Confirm on Callboard", callboardUrl)}`;

  return emailWrapper(
    orgName,
    content,
    "This is your weekly reminder from Calltime. If you have a conflict, respond on the Callboard before rehearsal."
  );
}

// ---------------------------------------------------------------------------
// 5. Account Invitation — "Your account is ready"
// ---------------------------------------------------------------------------

export function buildInvitationEmail({
  name,
  orgName,
  productionTitle,
  roleTitle,
  tempPassword,
  loginUrl,
}: {
  name: string;
  orgName: string;
  productionTitle: string;
  roleTitle: string;
  tempPassword: string;
  loginUrl: string;
}) {
  const content = `
    <p style="font-size: 15px; color: #1A1A1B; margin: 0 0 20px 0;">
      ${name}, your Calltime account is ready.
    </p>

    <p style="font-size: 14px; color: #7A726A; margin: 0 0 20px 0;">
      You've been added to <strong style="color: #1A1A1B;">${productionTitle}</strong> as <strong style="color: #1A1A1B;">${roleTitle}</strong>. Calltime is where you'll find your schedule, respond to calls, and sign your contract.
    </p>

    <div style="background: #FFFFFF; border: 1px solid #E8E1D2; border-radius: 8px; padding: 20px; margin-bottom: 8px;">
      <p style="font-size: 11px; color: #7A726A; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px 0;">Your login</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; font-size: 13px; color: #7A726A; width: 90px;">Email</td>
          <td style="padding: 4px 0; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #1A1A1B;">Use the email this was sent to</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-size: 13px; color: #7A726A;">Password</td>
          <td style="padding: 4px 0; font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #C4522D; font-weight: 600;">${tempPassword}</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 13px; color: #7A726A; margin: 16px 0 0 0;">
      After you log in, go to <strong style="color: #1A1A1B;">Settings</strong> to change your password and complete your profile.
    </p>

    ${ctaButton("Log in to Calltime", loginUrl)}`;

  return emailWrapper(
    orgName,
    content,
    "This is a one-time invitation. Please change your password after logging in."
  );
}
