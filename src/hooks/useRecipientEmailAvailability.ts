import { useEffect, useRef, useState } from "react"
import { ApiError, recipientEmailApi } from "@/lib/api"
import { recipientAllocationFamily, type CheckoutRecipient, type CheckoutCardType } from "@/lib/checkout-recipients"

export type RecipientEmailStatus =
  | { email: string; state: "idle" | "checking" | "available" }
  | { email: string; state: "invalid" | "allocated" | "duplicate" | "network-error"; message: string }
  | { email: string; state: "rate-limited"; message: string; retryAt: number }

export function recipientEmailsAreAvailable(statuses: RecipientEmailStatus[]): boolean {
  return statuses.length > 0 && statuses.every((status) => status.state === "available")
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DEBOUNCE_MS = 600
const ELIGIBILITY_FRESH_MS = 30_000

type EmailCheck = {
  status: RecipientEmailStatus
  promise: Promise<RecipientEmailStatus>
  expiresAt: number
}

function cacheKey(email: string, buyerEmail: string, cardType: CheckoutCardType): string {
  return JSON.stringify([email, buyerEmail, cardType])
}

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
  const cardTypes = recipients.map((recipient) => recipient.card_type ?? "CUSTOM")
  const emailKey = JSON.stringify(normalizedEmails.map((email, index) => ({ email, cardType: cardTypes[index] })))
  const buyerEmailValue = normalizeEmail(buyerEmail)
  const normalizedBuyerEmail = buyerEmailValue.length <= 254 && EMAIL_PATTERN.test(buyerEmailValue)
    ? buyerEmailValue
    : ""
  // Share requests across unchanged rows, but recheck eligibility after a
  // short interval because allocations and reservations can be released.
  const checks = useRef(new Map<string, EmailCheck>())
  const rateLimitUntil = useRef(0)
  const [results, setResults] = useState<Record<string, RecipientEmailStatus>>({})
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const slots = JSON.parse(emailKey) as { email: string; cardType: CheckoutCardType }[]
    const identityKeys = slots.map(({ email, cardType }) => JSON.stringify([email, recipientAllocationFamily(cardType)]))
    const duplicates = new Set(identityKeys.filter((key, index) => identityKeys.indexOf(key) !== index))
    const timers: ReturnType<typeof setTimeout>[] = []
    function publish(key: string, status: RecipientEmailStatus) {
      if (cancelled) return
      setResults((current) => current[key] === status ? current : { ...current, [key]: status })
    }

    function subscribe(key: string, check: EmailCheck) {
      publish(key, check.status)
      void check.promise.then((status) => {
        if (cancelled) return
        publish(key, status)
        if (!Number.isFinite(check.expiresAt)) return
        timers.push(setTimeout(() => {
          if (cancelled || checks.current.get(key) !== check) return
          checks.current.delete(key)
          setResults((current) => Object.fromEntries(Object.entries(current).filter(([entry]) => entry !== key)))
          setRetryKey((value) => value + 1)
        }, Math.max(0, check.expiresAt - Date.now())))
      })
    }

    slots.forEach(({ email, cardType }, index) => {
      if (!email || duplicates.has(identityKeys[index]) || initialStatus(email).state === "invalid") return
      const key = cacheKey(email, normalizedBuyerEmail, cardType)
      const previous = checks.current.get(key)
      if (previous && previous.expiresAt > Date.now()) {
        subscribe(key, previous)
        return
      }
      if (previous) {
        checks.current.delete(key)
        setResults((current) => Object.fromEntries(Object.entries(current).filter(([entry]) => entry !== key)))
      }

      const timer = setTimeout(() => {
        if (Date.now() < rateLimitUntil.current) {
          publish(key, { email, state: "rate-limited", message: "Too many email checks. Please wait and retry.", retryAt: rateLimitUntil.current })
          return
        }

        const check: EmailCheck = {
          status: { email, state: "checking" },
          expiresAt: Infinity,
          promise: recipientEmailApi.check(email, normalizedBuyerEmail, cardType).then(
            (result): RecipientEmailStatus => result.available
              ? { email, state: "available" }
              : { email, state: "allocated", message: result.message },
            (error: unknown): RecipientEmailStatus => {
              if (error instanceof ApiError && error.status === 429) {
                const retryAt = Date.now() + (error.retryAfterSeconds ?? 60) * 1000
                rateLimitUntil.current = Math.max(rateLimitUntil.current, retryAt)
                return { email, state: "rate-limited", message: "Too many email checks. Please wait and retry.", retryAt: rateLimitUntil.current }
              }
              return error instanceof ApiError && error.message === "Please enter a valid email address."
                ? { email, state: "invalid", message: error.message }
                : { email, state: "network-error", message: "We couldn't check email availability. Please try again." }
            },
          ),
        }
        checks.current.set(key, check)
        // Complete the cache even if this effect was cleaned up while the
        // request was pending; the current effect can share the same promise.
        void check.promise.then((status) => {
          check.status = status
          check.expiresAt = status.state === "available" || status.state === "allocated" ? Date.now() + ELIGIBILITY_FRESH_MS : Infinity
        })
        subscribe(key, check)
      }, DEBOUNCE_MS)
      timers.push(timer)
    })

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [emailKey, normalizedBuyerEmail, retryKey])

  const statuses = normalizedEmails.map((email, index) => {
    const family = recipientAllocationFamily(cardTypes[index])
    const duplicate = email && normalizedEmails.some((other, slot) => slot !== index && other === email && recipientAllocationFamily(cardTypes[slot]) === family)
    if (duplicate) {
      return { email, state: "duplicate" as const, message: "Use a different email address for each NFC card." }
    }
    const initial = initialStatus(email)
    const key = cacheKey(email, normalizedBuyerEmail, cardTypes[index])
    const result = results[key]
    return result?.email === email ? result : initial
  })
  const allAvailable = recipientEmailsAreAvailable(statuses)

  return {
    statuses,
    allAvailable,
    retry: (email?: string) => {
      // Checkout errors must invalidate stale eligibility even during a
      // cooldown. Row retries wait; the effect also enforces the IP cooldown.
      if (email !== undefined && Date.now() < rateLimitUntil.current) return
      const keys = normalizedEmails
        .map((value, index) => ({ email: value, cardType: cardTypes[index] }))
        .filter((value) => email === undefined || value.email === normalizeEmail(email))
        .map((value) => cacheKey(value.email, normalizedBuyerEmail, value.cardType))
        .filter((key) => checks.current.get(key)?.status.state !== "checking")
      if (!keys.length) return
      keys.forEach((key) => checks.current.delete(key))
      setResults((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
      setRetryKey((value) => value + 1)
    },
  }
}
