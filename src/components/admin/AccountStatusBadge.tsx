import { Badge } from "@/components/ui/badge"
import type { AccountStatus, EmailDeliveryStatus } from "@/lib/api"

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  PENDING_PROCESSING: "Pending Processing",
  EMAIL_QUEUED: "Email queued",
  EMAIL_SENT: "Email accepted; delivery unverified",
  EMAIL_FAILED: "Activation Email Failed",
  ACTIVATED: "Account Activated",
}

const VARIANT = {
  PENDING_PROCESSING: "secondary",
  EMAIL_QUEUED: "warning",
  EMAIL_SENT: "warning",
  EMAIL_FAILED: "destructive",
  ACTIVATED: "success",
} as const

/** Customer account status for an order-created account (accounts.
 * CustomerOnboarding.account_status). */
export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return <Badge variant={VARIANT[status]}>{ACCOUNT_STATUS_LABEL[status]}</Badge>
}

const DELIVERY_LABEL: Record<EmailDeliveryStatus, string> = {
  NOT_QUEUED: "Email not queued",
  QUEUED: "Email queued",
  ACCEPTED: "Accepted by email service; delivery unverified",
  FAILED: "Email failed",
  BOUNCED: "Email bounced",
  UNVERIFIED: "Outcome unverified; check provider records before retrying",
}
const DELIVERY_VARIANT = { NOT_QUEUED: "secondary", QUEUED: "warning", ACCEPTED: "warning", FAILED: "destructive", BOUNCED: "destructive", UNVERIFIED: "warning" } as const

export function EmailDeliveryBadge({ status, label }: { status: EmailDeliveryStatus; label?: string }) {
  return <Badge variant={DELIVERY_VARIANT[status]}>{label || DELIVERY_LABEL[status]}</Badge>
}
