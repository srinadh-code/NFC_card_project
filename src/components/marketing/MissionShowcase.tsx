function TargetIllustration() {
  return (
    <div className="relative flex size-56 shrink-0 items-center justify-center sm:size-64">
      {/* decorative corner rings */}
      <span className="absolute left-2 top-0 size-3 rounded-full border-2 border-[#EC4899]/40" />
      <span className="absolute -right-1 top-1/3 size-2.5 rounded-full border-2 border-[#7C3AED]/40" />
      <span className="absolute left-0 bottom-2 size-2.5 rounded-full border-2 border-[#7C3AED]/40" />

      {/* bullseye rings, largest to smallest, each centered via inset-0 + m-auto */}
      <div className="absolute inset-0 m-auto size-56 rounded-full bg-gradient-to-br from-[#EEF2FF] to-[#FCE7F3] shadow-inner sm:size-64" />
      <div className="absolute inset-0 m-auto size-44 rounded-full bg-gradient-to-br from-[#C4B5FD] to-[#F9A8D4] opacity-80 sm:size-48" />
      <div className="absolute inset-0 m-auto size-28 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#EC4899] shadow-lg sm:size-32" />
      <div className="absolute inset-0 m-auto size-14 rounded-full bg-white shadow-md sm:size-16" />
      <div className="absolute inset-0 m-auto size-6 rounded-full bg-gradient-brand shadow-glow-primary sm:size-7" />

      {/* dart piercing the center */}
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 m-auto size-28 -translate-x-1 -translate-y-1 rotate-[-45deg] sm:size-32"
        aria-hidden="true"
      >
        <line x1="8" y1="32" x2="20" y2="20" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M20 20 L26 14 L28 20 L20 20 Z" fill="#1E293B" />
        <path d="M8 32 L4 36 M8 32 L11 33 M8 32 L7 36" stroke="#1E293B" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export default function MissionShowcase() {
  return (
    <section className="relative overflow-hidden bg-[#FAFAFF] px-4 py-16 sm:py-20">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, #C4B5FD 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse 55% 55% at 85% 25%, black, transparent)",
        }}
      />
      <div className="pointer-events-none absolute -left-20 top-10 size-72 rounded-full bg-[#7C3AED]/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 size-64 rounded-full bg-[#EC4899]/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl rounded-[32px] bg-gradient-to-r from-[#6C4DFF] to-[#FF5DA8] p-[1.5px] shadow-[0_25px_70px_rgba(124,58,237,0.18)]">
        <div className="rounded-[30.5px] bg-white/80 px-6 py-10 backdrop-blur-xl sm:px-12 sm:py-14">
          <div className="flex flex-col items-center gap-10 lg:flex-row lg:gap-16">
            <TargetIllustration />

            <div className="text-center lg:text-left">
              <span className="inline-flex items-center rounded-full border border-[#7C3AED]/20 bg-[#7C3AED]/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#7C3AED]">
                OUR MISSION
              </span>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Empowering Connections.
                <br />
                <span className="text-gradient-brand">Every Time.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground lg:mx-0">
                To empower every professional with a networking tool that&apos;s instant,
                sustainable, and endlessly customizable — turning every handshake into a lasting
                digital connection.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
