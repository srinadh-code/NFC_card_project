import * as React from "react"
import { Check, Eye, EyeOff, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { PASSWORD_MAX_LENGTH, cn, evaluatePassword } from "@/lib/utils"

/**
 * Password field with a visibility toggle. Each instance owns its own
 * show/hide state, so multiple fields on the same form (e.g. New Password +
 * Confirm New Password) always toggle independently of one another.
 */
function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn("pr-9", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center rounded-md px-2.5 text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

/** One row of the checklist — icon + label, never colour alone, so the
 *  met/unmet state survives greyscale and colour-blindness. */
function RequirementRow({ label, valid }: { label: string; valid: boolean }) {
  const Icon = valid ? Check : X
  return (
    <li
      className={cn(
        "flex items-start gap-1.5 text-xs leading-5",
        valid ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">
        <span className="sr-only">{valid ? "Requirement met: " : "Requirement not met: "}</span>
        {label}
      </span>
    </li>
  )
}

/**
 * Live password-requirements checklist, rendered directly under a password
 * field. Re-evaluates on every render from the current value, so the ticks
 * and crosses track what the user is typing with no state of its own.
 *
 * The rules themselves live in evaluatePassword() (src/lib/utils.ts) — the
 * same helper the submit guard uses, so what the list shows and what the
 * form accepts can never disagree.
 *
 * Accessibility: the list is static (announcing six rows per keystroke would
 * be unusable); a single visually-hidden status line carries the live
 * "n of m requirements met" update instead.
 */
function PasswordRequirements({
  password,
  id,
  className,
}: {
  password: string
  id?: string
  className?: string
}) {
  const { results, metCount } = evaluatePassword(password)

  return (
    <div id={id} className={cn("space-y-1.5 rounded-md bg-muted/40 p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <p className="text-xs font-medium">Password requirements</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {password.length} / {PASSWORD_MAX_LENGTH} characters
        </p>
      </div>
      <ul className="space-y-0.5">
        {results.map((rule) => (
          <RequirementRow key={rule.id} label={rule.label} valid={rule.valid} />
        ))}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">
        {metCount} of {results.length} password requirements met.
      </p>
    </div>
  )
}

export { PasswordInput, PasswordRequirements }
