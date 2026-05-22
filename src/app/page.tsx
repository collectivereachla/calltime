import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/home");

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-10 py-5">
        <span className="font-display text-display-sm tracking-tight">
          Calltime<span className="text-brick">.</span>
        </span>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-body-sm text-ash hover:text-ink transition-colors">
            Sign in
          </Link>
          <Link href="/onboarding" className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 md:px-10 pt-16 md:pt-28 pb-20 md:pb-32 text-center">
        <h1 className="font-display text-[2.75rem] md:text-[3.5rem] leading-[1.1] tracking-tight mb-6">
          Production management<br />
          for theatre artists<span className="text-brick">.</span>
        </h1>
        <p className="text-body-lg text-ash max-w-xl mx-auto mb-10 leading-relaxed">
          One account across every company you work with. Schedule, script, contracts, 
          design, and communication — organized the way a theatre actually runs.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/onboarding" className="px-6 py-3 bg-ink text-paper text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors">
            Start a company
          </Link>
          <Link href="/directory" className="px-6 py-3 bg-card border border-bone text-body-md text-ink rounded-card hover:border-ash transition-colors">
            Browse companies
          </Link>
        </div>
      </section>

      {/* Rooms */}
      <section className="max-w-4xl mx-auto px-6 md:px-10 pb-20 md:pb-28">
        <p className="text-body-xs text-muted uppercase tracking-wider text-center mb-8">The rooms</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { name: "Callboard", desc: "Schedule rehearsals, tech, performances. Call your people. Track responses." },
            { name: "Company", desc: "Your directory. Everyone's contact info, roles, assignments, headshots." },
            { name: "Spine", desc: "The script, line by line. SM blocking notes. Line Lab for memorization. Reports." },
            { name: "Booth", desc: "Costume, lighting, sound, set, props. Each designer gets a real workspace." },
            { name: "Ledger", desc: "Contracts with e-signatures. Budget tracking. Compensation by role." },
            { name: "Greenroom", desc: "Company chat. Announcements, updates, and conversation in one place." },
          ].map((room) => (
            <div key={room.name} className="bg-card border border-bone rounded-card p-5">
              <p className="font-display text-body-lg text-ink mb-1.5">{room.name}</p>
              <p className="text-body-sm text-ash leading-relaxed">{room.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section className="bg-card border-y border-bone">
        <div className="max-w-4xl mx-auto px-6 md:px-10 py-16 md:py-24">
          <h2 className="font-display text-display-md text-center mb-4">
            Built for everyone in the building<span className="text-brick">.</span>
          </h2>
          <p className="text-body-md text-ash text-center max-w-2xl mx-auto mb-12">
            Not just stage managers. Not just directors. Every person who makes the production happen.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {[
              { role: "Actors", what: "See your schedule, confirm calls, learn lines with Line Lab, sign your contract, get blocking notes pushed to you." },
              { role: "Stage Managers", what: "Build the call, track responses, file reports, manage props, add blocking notes that sync to everyone's script in real time." },
              { role: "Directors", what: "One view across your whole production. Script reports, casting, schedule, contracts, budget — no spreadsheet switching." },
              { role: "Designers", what: "Costume plots, cue lists, scene breakdowns, reference images, milestone tracking. Your department, your workspace." },
              { role: "Producers & Board", what: "Contracts, compensation, budget, revenue tracking. See what's signed, what's outstanding, what's overdue." },
              { role: "Parents & Volunteers", what: "Clear schedule, easy conflict reporting, emergency contact on file. No confusion about when and where to be." },
            ].map((item) => (
              <div key={item.role}>
                <p className="font-display text-body-lg text-ink mb-1">{item.role}</p>
                <p className="text-body-sm text-ash leading-relaxed">{item.what}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-3xl mx-auto px-6 md:px-10 py-16 md:py-24">
        <h2 className="font-display text-display-md text-center mb-12">
          How it works<span className="text-brick">.</span>
        </h2>
        <div className="space-y-10">
          {[
            { step: "1", title: "Create your company", desc: "Set up your organization in under a minute. Add your name, city, and you're the owner." },
            { step: "2", title: "Add a production", desc: "Title, dates, venue. Open an audition call or invite people directly. Calltime generates contracts from your templates." },
            { step: "3", title: "Run your show", desc: "Post the schedule, call your people, track responses, manage blocking, file reports. Everyone works from the same source of truth." },
          ].map((item) => (
            <div key={item.step} className="flex gap-5">
              <span className="font-display text-display-md text-bone leading-none mt-0.5 shrink-0 w-8">{item.step}</span>
              <div>
                <p className="font-display text-body-lg text-ink mb-1">{item.title}</p>
                <p className="text-body-md text-ash leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Principles */}
      <section className="bg-ink text-paper">
        <div className="max-w-3xl mx-auto px-6 md:px-10 py-16 md:py-24">
          <h2 className="font-display text-display-md text-center mb-4">
            Three principles<span className="text-brick">.</span>
          </h2>
          <p className="text-body-md text-paper/60 text-center max-w-xl mx-auto mb-12">
            Inherited from the Free Southern Theater through Creative Reach.
          </p>
          <div className="space-y-8">
            {[
              { title: "No access barriers", desc: "Pricing, design, and infrastructure must not exclude under-resourced companies. Artists never pay. Companies pay on a published sliding scale." },
              { title: "No exploitation", desc: "Artists get paid — structurally, not rhetorically. Contracts, compensation tracking, and budget transparency are built into the platform, not bolted on." },
              { title: "No résumé gatekeeping", desc: "Talent and professionalism are not proxy language for exclusion. The platform serves community theatre, educational programs, and professional companies equally." },
            ].map((item) => (
              <div key={item.title}>
                <p className="font-display text-body-lg text-paper mb-1">{item.title}</p>
                <p className="text-body-md text-paper/60 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="max-w-3xl mx-auto px-6 md:px-10 py-16 md:py-24">
        <h2 className="font-display text-display-md text-center mb-4">
          Your data stays yours<span className="text-brick">.</span>
        </h2>
        <p className="text-body-md text-ash text-center max-w-xl mx-auto mb-10">
          Calltime is built on the same infrastructure trusted by healthcare and finance: Supabase (PostgreSQL), 
          Vercel, and row-level security that ensures no company can see another company's data.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          {[
            { label: "Org-scoped access", desc: "Every query checks your membership. No cross-company data leaks." },
            { label: "Encrypted at rest", desc: "All data encrypted in transit and at rest. Hosted in US-East." },
            { label: "Artist-owned accounts", desc: "You own your account. Leave a company, keep your profile." },
          ].map((item) => (
            <div key={item.label}>
              <p className="font-display text-body-lg text-ink mb-1">{item.label}</p>
              <p className="text-body-sm text-ash">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-card border-t border-bone">
        <div className="max-w-3xl mx-auto px-6 md:px-10 py-16 md:py-20 text-center">
          <h2 className="font-display text-display-md mb-4">
            Ready to run your production<span className="text-brick">?</span>
          </h2>
          <p className="text-body-md text-ash mb-8 max-w-md mx-auto">
            Create your company for free. Add your first production. Invite your people.
          </p>
          <Link href="/onboarding" className="inline-block px-8 py-3 bg-ink text-paper text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors">
            Get started
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-bone">
        <div className="max-w-4xl mx-auto px-6 md:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <span className="font-display text-body-md">Calltime<span className="text-brick">.</span></span>
            <span className="text-body-xs text-muted">Built by Creative Reach</span>
          </div>
          <div className="flex items-center gap-6 text-body-xs text-muted">
            <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
            <a href="mailto:inspire@heritageparc.org" className="hover:text-ink transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
