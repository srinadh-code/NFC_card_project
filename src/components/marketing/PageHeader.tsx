import type { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  subtitle?: string
  children?: ReactNode
}

export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary/5 to-background px-4 py-16 sm:py-20">
      <div className="pointer-events-none absolute left-1/2 top-0 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative mx-auto max-w-4xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </section>
  )
}
