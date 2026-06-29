export const dynamic = "force-static";

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-10 md:py-14">
      <div className="flex flex-col items-center text-center mb-8">
        <svg viewBox="0 0 240 240" width="76" height="76" aria-hidden="true">
          <path d="M86 138 Q96 56 120 50 Q144 56 154 138" fill="none" stroke="var(--color-ash)" strokeWidth="6" strokeLinecap="round" />
          <circle cx="120" cy="92" r="14" fill="var(--color-brick)" />
          <line x1="120" y1="104" x2="120" y2="186" stroke="var(--color-ink)" strokeWidth="6" strokeLinecap="round" />
          <ellipse cx="120" cy="190" rx="40" ry="9" fill="none" stroke="var(--color-ink)" strokeWidth="5" />
        </svg>
        <h1 className="font-marquee text-display-lg text-ink mt-4">Calltime<span className="text-brick">.</span></h1>
        <p className="text-body-md text-ash mt-2">Production management, actor-first.</p>
      </div>

      <p className="text-body-lg text-ink leading-relaxed mb-10">
        Calltime is built on <span className="font-medium">ubuntu</span> &mdash; I am because we are. The people own their accounts; the company exists because of its people. A company can remove someone from a show, but it can never delete the person. The work belongs to the artists who make it.
      </p>

      <h2 className="font-display text-display-sm text-ink mb-2">The ghost light</h2>
      <p className="text-body-md text-ink leading-relaxed mb-4">
        The ghost light is the single bare bulb left burning on a stage when the theatre is dark and empty. Practically, it keeps anyone who enters from crossing a black stage in the dark. In the lore, it is company for the spirits of the house, a light so the stage is never truly alone. Either way it is an act of care: the theatre looking after whoever comes next.
      </p>
      <blockquote className="border-l-2 border-brick pl-4 py-1 my-6">
        <p className="text-body-md text-ink leading-relaxed">
          Calltime&rsquo;s ghost light is for Andrew Lee Vincent: Josiah&rsquo;s muse, friend, collaborator, teacher, and director. After he took his own life, his community lit ghost lights in his favorite places, the theatre spaces around Lafayette, in his memory. We keep one here too, so the light is always on for him, and for anyone in this work who needs to know they are not alone in the dark.
        </p>
      </blockquote>

      <div className="bg-card border border-bone rounded-card px-5 py-4 my-8">
        <p className="text-body-md text-ink leading-relaxed">
          If you&rsquo;re carrying something heavy, you don&rsquo;t have to carry it alone. The 988 Suicide &amp; Crisis Lifeline is free and confidential, 24/7 &mdash; call or text{" "}
          <a href="tel:988" className="font-medium text-brick hover:underline">988</a>, or chat at{" "}
          <a href="https://988lifeline.org" target="_blank" rel="noopener noreferrer" className="font-medium text-brick hover:underline">988lifeline.org</a>.
        </p>
      </div>

      <h2 className="font-display text-display-sm text-ink mb-3 mt-10">The words</h2>
      <div className="space-y-3">
        <div>
          <p className="text-body-md text-ink"><span className="font-medium">Àṣẹ</span> <span className="font-mono text-data-sm text-ash">ah-SHAY</span> <span className="text-ash">· Yoruba</span></p>
          <p className="text-body-sm text-ash">Life force; the energy that makes things happen. Calltime&rsquo;s bright mode.</p>
        </div>
        <div>
          <p className="text-body-md text-ink"><span className="font-medium">Tulia</span> <span className="font-mono text-data-sm text-ash">too-LEE-ah</span> <span className="text-ash">· Swahili</span></p>
          <p className="text-body-sm text-ash">Be calm, settle, rest. Calltime&rsquo;s dark mode.</p>
        </div>
        <div>
          <p className="text-body-md text-ink"><span className="font-medium">Ubuntu</span> <span className="font-mono text-data-sm text-ash">oo-BOON-too</span> <span className="text-ash">· Nguni Bantu</span></p>
          <p className="text-body-sm text-ash">I am because we are.</p>
        </div>
      </div>
    </div>
  );
}
