import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { Zap } from "lucide-react"
import { BrandMark } from "@/components/layout/BrandMark"
import { cn } from "@/lib/utils"

/**
 * Centered, branded card for the single-purpose auth pages reached from an
 * emailed link (Verify Email, Reset Password) — same brand mark and colours
 * as Login/Sign Up, without their two-panel marketing layout.
 */
export function AuthStatusCard({
  icon,
  tone = "primary",
  title,
  description,
  children,
}: {
  icon: ReactNode
  tone?: "primary" | "success" | "destructive"
  title: string
  description?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-40 flex overflow-y-auto bg-gradient-to-br from-background via-background to-primary/5">
      <div className="m-auto w-full max-w-md px-4 py-10 sm:px-6">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <BrandMark
            className="size-9 rounded-xl"
            fallback={
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Zap className="size-5" fill="currentColor" />
              </div>
            }
          />
          <span className="text-lg font-bold tracking-tight text-foreground">VR's GATEWAY</span>
        </Link>

        <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-xl shadow-primary/5 sm:p-8">
          <div className="space-y-3 text-center">
            <span
              className={cn(
                "mx-auto flex size-14 items-center justify-center rounded-full",
                tone === "primary" && "bg-primary/10 text-primary",
                tone === "success" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                tone === "destructive" && "bg-destructive/10 text-destructive"
              )}
            >
              {icon}
            </span>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
