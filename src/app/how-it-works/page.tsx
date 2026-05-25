import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

export default function HowItWorksPage() {
  const steps = [
    {
      num: "01",
      title: "Create your company",
      desc: "Sign up, name your company, and set your home city. Calltime creates your workspace in seconds. Free for community companies, scaled pricing for larger organizations.",
    },
    {
      num: "02",
      title: "Add a production",
      desc: "Title, playwright, venue, dates. Calltime generates contract templates, a callboard, a company roster, and every room your team needs — all scoped to this production.",
    },
    {
      num: "03",
      title: "Invite your people",
      desc: "Add your cast, crew, and creative team by email. Each person gets a login, their contract, and access to the callboard. Shared emails work for parent-child pairs.",
    },
    {
      num: "04",
      title: "Post your schedule",
      desc: "Create events on the Callboard — rehearsals, fittings, tech, performances. Select who's called. Everyone gets notified by email and can respond: confirmed, tentative, or conflict.",
    },
    {
      num: "05",
      title: "Run your show",
      desc: "Your company uses Calltime every day: checking the callboard, reading the script, signing contracts, filing conflicts, sending messages. The director sees a health dashboard showing what's on track and what needs attention.",
    },
  ];

  const rooms = [
    { name: "Callboard", desc: "Schedule, calls, responses. The daily pulse of the production." },
    { name: "Company", desc: "Roster, roles, departments. Who's in the room." },
    { name: "Spine", desc: "Script, blocking notes, line-learning tools. The interpretive layer." },
    { name: "Booth", desc: "Costumes, props, SM reports, design tracking. Every department's workspace." },
    { name: "Ledger", desc: "Contracts, budget, revenue. Everyone gets paid — structurally, not rhetorically." },
    { name: "Greenroom", desc: "Company group chat. Quick questions, shared updates." },
    { name: "Run", desc: "Run sheets, line notes, rehearsal work logs. The SM's command center." },
    { name: "Archive", desc: "Every past production. Roster, press, programs. The company's history." },
  ];

  return (
    <div className="min-h-screen bg-paper">
      <PublicHeader />

      <section className="max-w-3xl mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-12">
        <h1 className="font-display text-display-lg tracking-tight mb-4">
          How it works<span className="text-brick">.</span>
        </h1>
        <p className="text-body-md text-ash max-w-xl leading-relaxed">
          Calltime is organized like a theatre building. Each room maps to a real workflow — scheduling, scripts, contracts, communication. One platform, every department.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 md:px-10 pb-16 md:pb-24">
        <div className="space-y-10">
          {steps.map((step) => (
            <div key={step.num} className="flex gap-6">
              <span className="font-mono text-data-md text-bone shrink-0 pt-1">{step.num}</span>
              <div>
                <h3 className="font-display text-display-sm text-ink mb-2">{step.title}</h3>
                <p className="text-body-md text-ash leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-ink">
        <div className="max-w-3xl mx-auto px-6 md:px-10 py-16 md:py-24">
          <h2 className="font-display text-display-md text-paper mb-10">
            The rooms<span className="text-brick">.</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {rooms.map((room) => (
              <div key={room.name} className="border-l-2 border-paper/20 pl-4">
                <p className="font-display text-body-lg text-paper mb-1">{room.name}</p>
                <p className="text-body-sm text-paper/60">{room.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 md:px-10 py-16 md:py-20 text-center">
        <h2 className="font-display text-display-md mb-4">
          Built for the companies that need it most<span className="text-brick">.</span>
        </h2>
        <p className="text-body-md text-ash mb-8 max-w-md mx-auto">
          Free for community companies. No ads, no data selling, no access barriers. Artists never pay.
        </p>
        <Link href="/start" className="inline-block px-8 py-3 bg-ink text-paper text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors">
          Start your company
        </Link>
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
