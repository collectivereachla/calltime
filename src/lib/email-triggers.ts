import { createClient } from "@/lib/supabase/server";
import {
  sendEmail,
  buildEventCallEmail,
  buildWelcomeEmail,
} from "@/lib/email";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://checkcalltime.art";

/**
 * Send "You've been called" emails to everyone called to an event.
 * Fire-and-forget — logs errors but never throws.
 */
export async function sendEventCallEmails(eventId: string) {
  try {
    const supabase = await createClient();

    // Get event details + all called people with emails
    const { data: calls, error } = await supabase
      .from("event_calls")
      .select(
        `
        id,
        person_id,
        email_sent_at,
        people!inner ( id, full_name, preferred_name, email ),
        schedule_events!inner (
          title, event_type, event_date, start_time, end_time, location,
          productions!inner ( title ),
          organizations!inner ( name )
        )
      `
      )
      .eq("event_id", eventId)
      .is("email_sent_at", null);

    if (error) {
      console.error("Failed to fetch event calls for email:", error.message);
      return;
    }

    if (!calls || calls.length === 0) return;

    const sentIds: string[] = [];

    for (const call of calls) {
      const person = call.people as unknown as {
        id: string;
        full_name: string;
        preferred_name: string | null;
        email: string | null;
      };
      const event = call.schedule_events as unknown as {
        title: string;
        event_type: string;
        event_date: string;
        start_time: string | null;
        end_time: string | null;
        location: string | null;
        productions: { title: string };
        organizations: { name: string };
      };

      if (!person.email) continue;

      const html = buildEventCallEmail({
        name: person.preferred_name || person.full_name.split(" ")[0],
        orgName: event.organizations.name,
        eventTitle: event.title,
        eventType: event.event_type,
        eventDate: event.event_date,
        startTime: event.start_time,
        endTime: event.end_time,
        location: event.location,
        productionTitle: event.productions.title,
        callboardUrl: `${APP_URL}/callboard`,
      });

      const result = await sendEmail({
        to: person.email,
        subject: `Call: ${event.title} — ${new Date(event.event_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`,
        html,
      });

      if (result.success) {
        sentIds.push(call.id);
      }
    }

    // Mark emails as sent
    if (sentIds.length > 0) {
      await supabase
        .from("event_calls")
        .update({ email_sent_at: new Date().toISOString() })
        .in("id", sentIds);
    }

    console.log(
      `Event call emails: ${sentIds.length}/${calls.length} sent for event ${eventId}`
    );
  } catch (err) {
    console.error("sendEventCallEmails error:", err);
  }
}

/**
 * Send a welcome email when someone is added to a production.
 * Fire-and-forget.
 */
export async function sendWelcomeEmail({
  personId,
  productionId,
  roleTitle,
  department,
}: {
  personId: string;
  productionId: string;
  roleTitle: string;
  department: string;
}) {
  try {
    const supabase = await createClient();

    const [personResult, prodResult] = await Promise.all([
      supabase
        .from("people")
        .select("full_name, preferred_name, email")
        .eq("id", personId)
        .single(),
      supabase
        .from("productions")
        .select("title, organizations!inner ( name )")
        .eq("id", productionId)
        .single(),
    ]);

    if (personResult.error || prodResult.error) {
      console.error(
        "Welcome email lookup failed:",
        personResult.error?.message,
        prodResult.error?.message
      );
      return;
    }

    const person = personResult.data;
    const production = prodResult.data as unknown as {
      title: string;
      organizations: { name: string };
    };

    if (!person.email) return;

    const html = buildWelcomeEmail({
      name: person.preferred_name || person.full_name.split(" ")[0],
      orgName: production.organizations.name,
      productionTitle: production.title,
      roleTitle,
      department,
      appUrl: `${APP_URL}/home`,
    });

    const result = await sendEmail({
      to: person.email,
      subject: `Welcome to ${production.title}`,
      html,
    });

    if (result.success) {
      console.log(`Welcome email sent to ${person.email}`);
    }
  } catch (err) {
    console.error("sendWelcomeEmail error:", err);
  }
}
