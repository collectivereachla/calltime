import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

export const metadata = { title: "Terms of Service — Calltime." };

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <article className="max-w-2xl mx-auto px-6 md:px-10 py-10 md:py-16">
        <h1 className="font-display text-display-md mb-2">Terms of Service</h1>
        <p className="text-body-sm text-muted mb-10">Last updated: May 22, 2026</p>

        <div className="space-y-8 text-body-md text-ink leading-relaxed">
          <section>
            <h2 className="font-display text-display-sm mb-3">What Calltime is</h2>
            <p>
              Calltime is a production management platform for theatre companies, operated by 
              Creative Reach LLC. It provides scheduling, communication, script management, 
              contract signing, and organizational tools for theatre artists and the companies 
              they work with.
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Your account</h2>
            <p className="mb-3">
              You own your Calltime account. It follows you across every company you work with. 
              If you leave a company, your account stays — your personal profile, calendar, and 
              login remain yours. Companies cannot delete your account.
            </p>
            <p>
              You are responsible for keeping your login credentials secure. If you believe your 
              account has been compromised, contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">How companies and artists relate</h2>
            <p>
              Companies create organizations and productions on Calltime. Artists join companies 
              through invitations, open calls, or direct signup. Each company manages its own 
              data — schedules, contracts, budgets, scripts — and controls who within the company 
              can see what through role-based access tiers (owner, production staff, member, guest).
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Electronic signatures</h2>
            <p className="mb-3">
              Calltime offers electronic signature functionality for production contracts. By typing 
              your legal name or drawing your signature in the Ledger room, you are providing your 
              consent to sign the document electronically. This constitutes your electronic signature 
              under applicable law.
            </p>
            <p className="mb-3">
              Each signature is recorded with a timestamp, the signer&apos;s name, and the content of the 
              contract at the time of signing. Countersigning by the company owner follows the same process.
            </p>
            <p>
              Calltime stores signed contracts as records but is not a law firm and does not provide 
              legal advice. If you have questions about a contract&apos;s terms, consult an attorney.
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Content and data</h2>
            <p className="mb-3">
              You retain ownership of all content you create on Calltime — scripts, notes, reports, 
              designs, and other materials. Creative Reach does not claim ownership of your content.
            </p>
            <p>
              Company owners retain ownership of organizational data including schedules, budgets, 
              contract templates, and production records. When an artist leaves a company, the 
              company retains production data created during the engagement.
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Acceptable use</h2>
            <p>
              You agree not to use Calltime to harass, discriminate against, or harm other users; 
              to upload malicious content; to attempt to access other companies&apos; data; or to use 
              the platform for purposes unrelated to theatre production management.
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Pricing</h2>
            <p>
              Artists never pay. Companies pay on a published sliding scale based on organizational 
              budget. Pricing details are available upon request. We will never surprise you with fees.
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Availability</h2>
            <p>
              We strive to keep Calltime available and reliable, but we cannot guarantee uninterrupted 
              service. We are not liable for data loss, missed notifications, or service interruptions. 
              Critical production information should not rely solely on any single platform.
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Changes to these terms</h2>
            <p>
              We may update these terms as the platform evolves. Significant changes will be communicated 
              through the platform. Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="font-display text-display-sm mb-3">Contact</h2>
            <p>
              Questions about these terms? Reach us at{" "}
              <a href="mailto:inspire@heritageparc.org" className="text-brick hover:underline">
                inspire@heritageparc.org
              </a>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-bone text-body-sm text-muted">
          <Link href="/privacy" className="hover:text-ink transition-colors">Privacy Policy →</Link>
        </div>
      </article>
    </div>
  );
}
