import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-paper">
      <PublicHeader />

      <section className="max-w-2xl mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-20 md:pb-32">
        <h1 className="font-display text-display-lg tracking-tight mb-4">
          Contact<span className="text-brick">.</span>
        </h1>
        <p className="text-body-md text-ash mb-10 leading-relaxed">
          Calltime is built and maintained by Creative Reach LLC. We respond to every message.
        </p>

        <div className="space-y-8">
          <div>
            <h2 className="font-display text-display-sm mb-2">General inquiries</h2>
            <p className="text-body-md text-ash mb-1">Questions about Calltime, partnerships, or press.</p>
            <a href="mailto:collectivereachla@gmail.com" className="text-body-md text-brick hover:underline">
              collectivereachla@gmail.com
            </a>
          </div>

          <div>
            <h2 className="font-display text-display-sm mb-2">Technical support</h2>
            <p className="text-body-md text-ash mb-1">Login issues, bugs, or feature requests.</p>
            <a href="mailto:calltime@creativereach.art" className="text-body-md text-brick hover:underline">
              calltime@creativereach.art
            </a>
          </div>

          <div>
            <h2 className="font-display text-display-sm mb-2">Mailing address</h2>
            <p className="text-body-md text-ash">
              Creative Reach LLC<br />
              Lafayette, Louisiana
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-bone">
          <p className="text-body-sm text-ash">
            Want to bring Calltime to your company?{" "}
            <Link href="/start" className="text-brick hover:underline">Start here →</Link>
          </p>
        </div>
      </section>

      <footer className="border-t border-bone">
        <div className="max-w-4xl mx-auto px-6 md:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="font-display text-body-md">Calltime<span className="text-brick">.</span></span>
          <div className="flex items-center gap-6 text-body-xs text-muted">
            <Link href="/how-it-works" className="hover:text-ink transition-colors">How it works</Link>
            <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
