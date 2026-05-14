import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Calltime <onboarding@resend.dev>";

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
    const { data, error } = await resend.emails.send({
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
    .map((e) => {
      const date = new Date(e.date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const time = e.startTime
        ? formatTime12(e.startTime) + (e.endTime ? `–${formatTime12(e.endTime)}` : "")
        : "TBD";
      return `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E8E1D2; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #1A1A1B;">${date}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E8E1D2; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #7A726A;">${time}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E8E1D2; font-size: 14px; color: #1A1A1B;">${e.title}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E8E1D2; font-size: 13px; color: #7A726A;">${e.location || ""}</td>
        </tr>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background-color: #FAF7F1; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 20px;">
    <p style="font-family: Georgia, 'Newsreader', serif; font-size: 20px; color: #1A1A1B; margin: 0 0 4px 0;">
      Calltime<span style="color: #C4522D;">.</span>
    </p>
    <p style="font-size: 12px; color: #7A726A; margin: 0 0 24px 0;">${orgName}</p>

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

    <div style="margin: 24px 0; text-align: center;">
      <a href="${callboardUrl}" style="display: inline-block; padding: 10px 24px; background-color: #1A1A1B; color: #FAF7F1; font-size: 14px; font-weight: 500; text-decoration: none; border-radius: 8px;">
        Confirm on Callboard
      </a>
    </div>

    <p style="font-size: 12px; color: #A39E96; margin: 24px 0 0 0;">
      This is an automated reminder from Calltime. If you have a conflict, respond on the Callboard before rehearsal.
    </p>
  </div>
</body>
</html>`;
}

function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}
