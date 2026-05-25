import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

export default function StartPage() {
  const tiers = [
    {
      name: "Community",
      price: "Free",
      desc: "For community theatres, school programs, and emerging companies.",
      features: ["Unlimited productions", "Unlimited people", "All rooms", "Email notifications", "Contract signing"],
    },
    {
      name: "Established",
      price: "$25/month",
      desc: "For companies with regular seasons and larger teams.",
      features: ["Everything in Community", "Priority support", "Custom contract templates", "SMS notifications", "Advanced analytics"],
    },
    {
      name: "Custom",
      price: "Let's talk",
      desc: "For regional theatres, LORT houses, and multi-venue organizations.",
      features: ["Everything in Established", "Custom integrations", "Dedicated onboarding", "Multi-venue support", "SLA"],
    },
  ];

  return (
    <div className="min-h-screen bg-paper">
      <PublicHeader />

      <section className="max-w-3xl mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-12">
        <h1 className="font-display text-display-lg tracking-tight mb-4">
          Start your company<span className="text-brick">.</span>
        </h1>
        <p className="text-body-md text-ash max-w-xl leading-relaxed">
          Calltime is in early access. We're onboarding companies one at a time to ensure every team gets a solid setup. Request access and we'll be in touch within 48 hours.
        </p>
      </section>

      {/* Request access */}
      <section className="max-w-3xl mx-auto px-6 md:px-10 pb-16">
        <div className="bg-card border border-bone rounded-card p-6 md:p-8">
          <h2 className="font-display text-display-sm mb-2">Request early access</h2>
          <p className="text-body-sm text-ash mb-6">Tell us about your company and we'll set you up.</p>
          <a href="mailto:calltime@creativereach.art?subject=Calltime%20Early%20Access%20Request&body=Company%20name:%0ACity/State:%0AWebsite%20(if%20any):%0AUpcoming%20production:%0ATeam%20size%20(approximate):%0AAnything%20else%20we%20should%20know:%0A"
            className="inline-block px-6 py-3 bg-ink text-paper text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors">
            Email us to get started
          </a>
          <p className="text-body-xs text-muted mt-3">
            Or email <a href="mailto:calltime@creativereach.art" className="text-brick hover:underline">calltime@creativereach.art</a> directly.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-3xl mx-auto px-6 md:px-10 pb-16 md:pb-24">
        <h2 className="font-display text-display-md mb-8">
          Pricing<span className="text-brick">.</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tiers.map((tier) => (
            <div key={tier.name} className="bg-card border border-bone rounded-card p-5">
              <p className="font-display text-display-sm text-ink">{tier.name}</p>
              <p className="font-mono text-data-md text-brick mt-1 mb-2">{tier.price}</p>
              <p className="text-body-xs text-ash mb-4">{tier.desc}</p>
              <ul className="space-y-1.5">
                {tier.features.map((f) => (
                  <li key={f} className="text-body-xs text-ash flex items-start gap-2">
                    <span className="text-confirmed mt-0.5 shrink-0">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-body-xs text-muted text-center mt-6">
          Artists never pay. Pricing is for companies only. No credit card required to start.
        </p>
      </section>

      {/* Principles */}
      <section className="bg-ink">
        <div className="max-w-3xl mx-auto px-6 md:px-10 py-16 md:py-20">
          <h2 className="font-display text-display-md text-paper mb-8">
            What we believe<span className="text-brick">.</span>
          </h2>
          <div className="space-y-6">
            {[
              { title: "No access barriers", desc: "Pricing, design, and infrastructure must not exclude under-resourced companies." },
              { title: "No exploitation", desc: "Artists get paid — structurally, not rhetorically. Calltime tracks contracts and compensation as first-class features." },
              { title: "No résumé gatekeeping", desc: "Talent and professionalism are not proxy language for exclusion." },
            ].map((p) => (
              <div key={p.title} className="border-l-2 border-paper/20 pl-4">
                <p className="font-display text-body-lg text-paper mb-1">{p.title}</p>
                <p className="text-body-sm text-paper/60">{p.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-body-xs text-paper/40 mt-8">
            Inherited from the Free Southern Theater through Creative Reach.
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
            <Link href="/contact" className="hover:text-ink transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
