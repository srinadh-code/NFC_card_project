import { Badge } from "@/components/ui/badge"
import type { AccountStatus } from "@/lib/api"

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  PENDING_PROCESSING: "Pending Processing",
  EMAIL_SENT: "Activation Email Sent",
  EMAIL_FAILED: "Activation Email Failed",
  ACTIVATED: "Account Activated",
}

const VARIANT = {
  PENDING_PROCESSING: "secondary",
  EMAIL_SENT: "warning",
  EMAIL_FAILED: "destructive",
  ACTIVATED: "success",
} as const

/** Customer account status for an order-created account (accounts.
 * CustomerOnboarding.account_status). */
export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return <Badge variant={VARIANT[status]}>{ACCOUNT_STATUS_LABEL[status]}</Badge>
}
