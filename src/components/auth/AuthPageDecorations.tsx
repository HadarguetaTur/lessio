/** Shared marketing background (login / signup / onboarding). */
export function AuthPageDecorations() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,rgba(251,191,36,0.09),transparent_50%)] lg:bg-[radial-gradient(ellipse_90%_60%_at_80%_-10%,rgba(251,191,36,0.08),transparent_45%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_20%_100%,rgba(167,139,250,0.08),transparent_50%)] lg:bg-[radial-gradient(ellipse_80%_50%_at_10%_90%,rgba(167,139,250,0.07),transparent_50%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_80%_80%,rgba(20,184,166,0.07),transparent_55%)] lg:bg-[radial-gradient(ellipse_70%_45%_at_50%_50%,rgba(20,184,166,0.06),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute start-[6%] top-[14%] size-16 rotate-12 rounded-2xl border border-amber-400/15 bg-amber-400/5 blur-[0.5px] lg:start-[8%] lg:top-[18%] lg:size-20 lg:rounded-3xl lg:bg-gradient-to-br lg:from-amber-400/10 lg:to-transparent lg:blur-[1px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute end-[8%] top-[20%] size-12 -rotate-6 rounded-xl border border-violet-400/20 bg-violet-500/10 lg:end-[12%] lg:top-[22%] lg:size-14"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[18%] start-[10%] size-10 rotate-45 rounded-lg border border-teal-400/20 bg-teal-500/10 lg:bottom-[20%] lg:start-[15%] lg:size-11"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[24%] end-[15%] size-20 rounded-full border border-rose-400/10 bg-rose-400/5 blur-sm lg:bottom-[28%] lg:end-[20%] lg:size-24"
        aria-hidden
      />
    </>
  )
}
