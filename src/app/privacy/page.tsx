import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

export const metadata = { title: "Privacy Policy — Calltime." };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <article className="max-w-2xl mx-auto px-6 md:px-10 py-10 md:py-16">
        <h1 className="font-display text-display-md mb-2">Privacy Policy</h1>
        <p className="text-body-sm text-muted mb-10">Last updated: May 22, 2026</p>

        <div className="space-y-8 text-body-md text-ink leading-relaxed">
          <section>
            <h2 className="font-display text-display-sm mb-3">What we collect</h2>
            <p className="mb-3">
              Calltime collects only the information needed to run theatre productions. Here is 
              exactly what we store and why.
            </p>

            <div className="space-y-4 mt-4">
              <div className="bg-card border border-bone rounded-card p-4">
                <p className="font-medium text-body-sm mb-1">Profile information</p>
                <p className="text-body-sm text-ash">
                  Full name, preferred name, pronouns, email, phone, headshot, city, state. 
                  Visible to members of companies you belong to.
                </p>
              </div>
              <div className="bg-card border border-bone rounded-card p-4">
                <p className="font-medium text-body-sm mb-1">Birthday</p>
                <p className="text-body-sm text-ash">
                  Month and day may be shared with your company. Birth year is stored privately 
                  and used only to determine minor status for safety compliance.
                </p>
              </div>
              <div className="bg-card border border-bone rounded-card p-4">
                <p className="font-medium text-body-sm mb-1">Emergency contact</p>
                <p className="text-body-sm text-ash">
                  Name, phone, and relationship of your emergency contact. Visible only to company 
                  owners and production staff — not to other members or the public.
                </p>
              </div>
              <div className="bg-card border border-bone rounded-card p-4">
                <p className="font-medium text-body-sm mb-1">Measurements</p>
                <p className="text-body-sm text-ash">
                  Body measurements for costume fitting. Visible only to company owners and 
                  production staff within the specific production.
                </p>
              </div>
              <div className="bg-card border border-bone rounded-card p-4">
                <p className="font-medium text-body-sm mb-1">Contracts and compensation</p>
                <p className="text-body-sm text-ash">
                  Contract text, signature, and compensation amounts. Your contract is visible to 
                  you and to company owners. Production staff can see signing status but not 
                  contract content or compensation amounts.
                </p>
              </div>
              <div className="bg-card border border-bone rounded-card p-4">
                <p className="font-medium text-body-sm mb-1">Schedule and responses</p>
                <p className="text-body-sm text-ash">
                  Your call schedule, confirmation/conflict responses, and conflict reasons. 
                  Visible to production staff and company owners.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">How your data is protected</h2>
            <p className="mb-3">
              Every database query checks your organization membership before returning data. 
              A member of Company A cannot see Company B&apos;s schedules, contracts, scripts, or 
              people — even if both companies use Calltime.
            </p>
            <p className="mb-3">
              All data is encrypted in transit (TLS) and at rest. Our database is hosted in 
              the United States (us-east-1) on Supabase, a PostgreSQL platform with row-level 
              security. The application is hosted on Vercel.
            </p>
            <p>
              Sensitive fields — emergency contacts, measurements, compensation, birth year — have 
              additional access restrictions beyond basic organization membership. Only users with 
              owner or production-staff roles can view these fields.
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Third-party services</h2>
            <p>We use the following services to operate Calltime. Each processes only the minimum data required.</p>
            <div className="mt-3 space-y-2 text-body-sm">
              <p><span className="font-medium">Supabase</span> — Database, authentication, file storage. Hosts all Calltime data.</p>
              <p><span className="font-medium">Vercel</span> — Application hosting and deployment.</p>
              <p><span className="font-medium">Resend</span> — Transactional email delivery (call notifications, invites, reminders).</p>
              <p><span className="font-medium">Twilio</span> — SMS text reminders for members who opt in. We do not sell or share mobile information with third parties for their own marketing. Reply STOP to opt out, HELP for help. See our <a href="/sms" className="text-brick hover:underline">SMS terms</a>.</p>
              <p><span className="font-medium">Google Fonts</span> — Typography loading. No user data is transmitted.</p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Email communications</h2>
            <p>
              Calltime sends transactional emails for call notifications, schedule reminders, 
              contract signing alerts, and account invitations. These are not marketing emails. 
              We do not sell your email address or send promotional content.
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Data retention</h2>
            <p className="mb-3">
              Your profile data persists as long as your account exists. Production data 
              (schedules, contracts, scripts, reports) is retained by the company for the 
              life of the organization. If you delete your account, your personal profile is 
              removed. Production records you participated in are retained by the company 
              with your name de-identified where possible.
            </p>
            <p>
              Companies can archive closed productions. Archived production data is retained 
              but no longer actively displayed.
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Your rights</h2>
            <p className="mb-3">You can:</p>
            <div className="space-y-1 text-body-sm ml-4">
              <p>• View all data Calltime stores about you through your profile and the rooms you have access to.</p>
              <p>• Edit your profile information at any time through Settings.</p>
              <p>• Request a complete export of your personal data by contacting us.</p>
              <p>• Request deletion of your account and personal data by contacting us.</p>
              <p>• Leave any company at any time without losing your account.</p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Minors</h2>
            <p>
              Calltime is used by youth theatre programs. Users under 18 are flagged as minors 
              in the system. Guardian contact information can be stored alongside emergency 
              contacts. Minors&apos; birth years are never shared with other users. Company owners 
              are responsible for obtaining appropriate parental consent for minor participants.
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Changes to this policy</h2>
            <p>
              We may update this policy as our practices evolve. Significant changes will be 
              communicated through the platform.
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Contact</h2>
            <p>
              Questions about your data or this policy? Reach us at{" "}
              <a href="mailto:collectivereachla@gmail.com" className="text-brick hover:underline">
                collectivereachla@gmail.com
              </a>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-bone text-body-sm text-muted">
          <Link href="/terms" className="hover:text-ink transition-colors">Terms of Service →</Link>
        </div>
      </article>
    </div>
  );
}
