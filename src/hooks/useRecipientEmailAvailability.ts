import { useEffect, useState } from "react"
import { ApiError, recipientEmailApi } from "@/lib/api"
import type { CheckoutRecipient } from "@/lib/checkout-recipients"

export type RecipientEmailStatus =
  | { email: string; state: "idle" | "checking" | "available" }
  | { email: string; state: "invalid" | "allocated" | "duplicate" | "network-error"; message: string }

export function recipientEmailsAreAvailable(statuses: RecipientEmailStatus[]): boolean {
  return statuses.length > 0 && statuses.every((status) => status.state === "available")
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function initialStatus(email: string): RecipientEmailStatus {
  if (!email) return { email, state: "idle" }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { email, state: "invalid", message: "Please enter a valid email address." }
  }
  return { email, state: "idle" }
}

export function useRecipientEmailAvailability(recipients: CheckoutRecipient[], buyerEmail = "") {
  const normalizedEmails = recipients.map((recipient) => normalizeEmail(recipient.email))
  const emailKey = JSON.stringify(normalizedEmails)
  const buyerEmailValue = normalizeEmail(buyerEmail)
  const normalizedBuyerEmail = buyerEmailValue.length <= 254 && EMAIL_PATTERN.test(buyerEmailValue)
    ? buyerEmailValue
    : ""
  const validationKey = JSON.stringify([emailKey, normalizedBuyerEmail])
  const [results, setResults] = useState<{ key: string; statuses: RecipientEmailStatus[] }>({
    key: "",
    statuses: [],
  })
  const [retryKey, setRetryKey] = useState(0)
  const requestKey = JSON.stringify([validationKey, retryKey])

  useEffect(() => {
    let cancelled = false
    const emails = JSON.parse(emailKey) as string[]
    const duplicates = new Set(
      emails.filter((email, index) => email && emails.indexOf(email) !== index),
    )
    const timers: ReturnType<typeof setTimeout>[] = []
    emails.forEach((email, index) => {
      if (!email || duplicates.has(email) || initialStatus(email).state === "invalid") return
      const timer = setTimeout(() => {
        setResults((current) => {
          const statuses = current.key === requestKey ? current.statuses : []
          const nextStatuses = [...statuses]
          nextStatuses[index] = { email, state: "checking" }
          return { key: requestKey, statuses: nextStatuses }
        })
        recipientEmailApi.check(email, normalizedBuyerEmail).then(
          (result) => {
            if (cancelled) return
            setResults((current) => {
              const statuses = current.key === requestKey ? current.statuses : []
              const nextStatuses = [...statuses]
              nextStatuses[index] = result.available
                ? { email, state: "available" }
                : { email, state: "allocated", message: result.message }
              return { key: requestKey, statuses: nextStatuses }
            })
          },
          (error: unknown) => {
            if (cancelled) return
            setResults((current) => {
              const statuses = current.key === requestKey ? current.statuses : []
              const nextStatuses = [...statuses]
              nextStatuses[index] = error instanceof ApiError && error.message === "Please enter a valid email address."
                ? { email, state: "invalid", message: error.message }
                : { email, state: "network-error", message: "We couldn't check email availability. Please try again." }
              return { key: requestKey, statuses: nextStatuses }
            })
          },
        )
      }, 450)
      timers.push(timer)
    })

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [emailKey, normalizedBuyerEmail, requestKey])

  const statuses = normalizedEmails.map((email, index) => {
    const duplicate = email && normalizedEmails.indexOf(email) !== normalizedEmails.lastIndexOf(email)
    if (duplicate) {
      return { email, state: "duplicate" as const, message: "Use a different email address for each NFC card." }
    }
    const initial = initialStatus(email)
    const result = results.key === requestKey ? results.statuses[index] : undefined
    return result?.email === email ? result : initial
  })
  const allAvailable = recipientEmailsAreAvailable(statuses)

  return {
    statuses,
    allAvailable,
    retry: () => setRetryKey((value) => value + 1),
  }
}
