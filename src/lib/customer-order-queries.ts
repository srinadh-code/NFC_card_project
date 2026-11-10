// All order-history consumers share a cache only within one login identity.
// The null key is used by disabled queries after logout.
export const customerOrderKeys = {
  customer: (customerId: string | null | undefined) => ["customer-orders", customerId ?? null] as const,
  page: (customerId: string | null | undefined, page = 1) => ["customer-orders", customerId ?? null, page] as const,
}
