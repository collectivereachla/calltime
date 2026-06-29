export const metadata = { title: "SMS Terms — Calltime" };

export default function SmsTermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-12">
      <h1 className="font-display text-display-lg text-ink mb-1">Calltime SMS terms</h1>
      <p className="text-body-sm text-ash mb-8">How text reminders work, and how to stop them.</p>

      <div className="space-y-5 text-body-md text-ink leading-relaxed">
        <p><span className="font-medium">Program.</span> Calltime sends production text reminders &mdash; call times, schedule changes, and confirm-by-reply requests &mdash; to members of a theatre company who turn on text reminders in their Calltime account settings.</p>
        <p><span className="font-medium">Opt-in.</span> You opt in by checking &ldquo;Text me call times and reminders&rdquo; in Settings inside the Calltime app, after adding your mobile number to your profile. Consent is not required to use Calltime or to be part of a production.</p>
        <p><span className="font-medium">Frequency.</span> Recurring messages, about 4&ndash;6 per month depending on your rehearsal and performance schedule.</p>
        <p><span className="font-medium">Cost.</span> Message and data rates may apply.</p>
        <p><span className="font-medium">HELP and STOP.</span> Reply <strong>HELP</strong> for help. Reply <strong>STOP</strong> to cancel text reminders at any time; you will receive one confirmation and no further texts.</p>
        <p><span className="font-medium">Support.</span> Questions? Contact your stage manager, or email <a href="mailto:josiahmprice@gmail.com" className="text-brick hover:underline">josiahmprice@gmail.com</a>.</p>
        <p><span className="font-medium">Privacy.</span> See our <a href="/privacy" className="text-brick hover:underline">privacy policy</a>. We do not sell or share your mobile information with third parties for their marketing.</p>
        <p className="text-body-sm text-ash">Carriers are not liable for delayed or undelivered messages.</p>
      </div>
    </div>
  );
}
