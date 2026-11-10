import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

let vite
let RecipientFields
let checkoutStore
let previousSessionStorage
let previousLocalStorage
let previousWindow
let cartStore
let sanitizeCartLines
let recipientEmailApi
let NetworkError
let ApiError
let recipientEmailsAreAvailable
let addressValidation

before(async () => {
  // Load the real TSX component and project aliases without a browser or
  // a listening development server; no extra test dependency is needed.
  previousSessionStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage")
  previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  const values = new Map()
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  } })
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: globalThis.sessionStorage })
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/checkout" }, localStorage: globalThis.localStorage } })
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
  RecipientFields = (await vite.ssrLoadModule("/src/components/checkout/BulkRecipientFields.tsx")).BulkRecipientFields
  checkoutStore = (await vite.ssrLoadModule("/src/store/checkout-verification-store.ts")).useCheckoutVerificationStore
  const cart = await vite.ssrLoadModule("/src/store/cart-store.ts")
  cartStore = cart.useCartStore
  sanitizeCartLines = cart.sanitizeCartLines
  const api = await vite.ssrLoadModule("/src/lib/api.ts")
  recipientEmailApi = api.recipientEmailApi
  NetworkError = api.NetworkError
  ApiError = api.ApiError
  recipientEmailsAreAvailable = (await vite.ssrLoadModule("/src/hooks/useRecipientEmailAvailability.ts")).recipientEmailsAreAvailable
  addressValidation = await vite.ssrLoadModule("/src/lib/address-validation.ts")
})
after(async () => {
  await vite?.close()
  if (previousSessionStorage) Object.defineProperty(globalThis, "sessionStorage", previousSessionStorage)
  else delete globalThis.sessionStorage
  if (previousLocalStorage) Object.defineProperty(globalThis, "localStorage", previousLocalStorage)
  else delete globalThis.localStorage
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow)
  else delete globalThis.window
})

function render(count, recipients = [], errors = [], emailStatuses = [], onRetryEmailCheck) {
  return renderToStaticMarkup(createElement(RecipientFields, { count, recipients, errors, emailStatuses, onRetryEmailCheck, onChange() {} }))
}

for (const quantity of [1, 2, 3, 5, 10]) {
  test(`${quantity} cards render exactly ${quantity} complete required recipient forms`, () => {
    const html = render(quantity)
    assert.equal((html.match(/<input\b/g) ?? []).length, quantity * 3)
    assert.equal((html.match(/required=""/g) ?? []).length, quantity * 3)
    assert.equal((html.match(/type="email"/g) ?? []).length, quantity)
    assert.equal((html.match(/type="tel"/g) ?? []).length, quantity)
    const ids = [...html.matchAll(/<input[^>]*\bid="([^"]+)"/g)].map((match) => match[1])
    assert.equal(new Set(ids).size, quantity * 3)
    for (let index = 0; index < quantity; index++) {
      for (const field of ["name", "email", "phone"]) assert.ok(ids.includes(`bulk-recipient-${field}-${index}`))
      assert.ok(html.includes(`Recipient ${index + 1}`))
    }
  })
}

test("remaining slots keep their input identifiers and values when quantity grows", () => {
  const recipients = [{ full_name: "Priya", email: "priya@example.com", phone: "+447700900123" }]
  const first = render(1, recipients)
  const grown = render(3, recipients)
  for (const value of ["Priya", "priya@example.com", "+447700900123"]) {
    assert.ok(first.includes(`value="${value}"`))
    assert.ok(grown.includes(`value="${value}"`))
  }
  assert.ok(grown.includes('id="bulk-recipient-phone-0"'))
})

test("field validation errors are visible on the correct recipient", () => {
  const html = render(2, [], [{}, { email: "Enter a valid email address.", phone: "Phone Number is required." }])
  assert.ok(html.includes("Enter a valid email address."))
  assert.ok(html.includes("Phone Number is required."))
  assert.equal((html.match(/aria-invalid="true"/g) ?? []).length, 2)
})

test("recipient warning and not-checked email state are shown", () => {
  const html = render(1)
  assert.ok(html.includes("Important: Please double-check the recipient&#x27;s full name, email address and phone number before continuing. These details will be used for NFC card allocation and digital profile creation."))
  assert.ok(html.includes("bg-blue-50"))
  assert.ok(html.includes("Email availability not checked yet."))
  assert.ok(!html.includes("Email not verified"))
})

test("email checking, availability, allocation errors, and network retry render inline", () => {
  const checking = render(1, [{ full_name: "Priya", email: "priya@example.com", phone: "1234567890" }], [], [
    { email: "priya@example.com", state: "checking" },
  ])
  assert.ok(checking.includes("Checking email availability..."))
  assert.ok(checking.includes('role="status"'))

  const available = render(1, [], [], [{ email: "priya@example.com", state: "available" }])
  assert.ok(!available.includes("Email Available"))
  assert.ok(!available.includes("text-success"))

  const allocated = render(1, [], [], [{
    email: "priya@example.com",
    state: "allocated",
    message: "This email is already assigned to another NFC card. Please enter a different email.",
  }])
  assert.ok(allocated.includes("Email Already Assigned"))
  assert.ok(allocated.includes("This email is already assigned to another NFC card. Please enter a different email."))
  assert.ok(allocated.includes('aria-invalid="true"'))

  const networkError = render(1, [], [], [{
    email: "priya@example.com",
    state: "network-error",
    message: "We couldn't check email availability. Please try again.",
  }], () => {})
  assert.ok(networkError.includes("Check Failed"))
  assert.ok(networkError.includes("Retry"))

  const invalid = render(1, [], [], [{
    email: "not-an-email",
    state: "invalid",
    message: "Please enter a valid email address.",
  }])
  assert.ok(invalid.includes("Please enter a valid email address."))
  assert.ok(invalid.includes('aria-invalid="true"'))
})

test("availability API surfaces network failures for inline retry handling", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error("offline") }
  try {
    await assert.rejects(recipientEmailApi.check("user@example.com"), NetworkError)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("rate-limited email checks show a paused check and disabled retry countdown", () => {
  const html = render(1, [], [], [{
    email: "priya@example.com",
    state: "rate-limited",
    message: "Too many email checks. Please wait and retry.",
    retryAt: Date.now() + 60_000,
  }], () => {})
  assert.ok(html.includes("Check Paused"))
  assert.ok(html.includes("Retry in 60s"))
  assert.ok(html.includes('disabled=""'))
  assert.ok(!html.includes("Check Failed"))

  const expired = render(1, [], [], [{
    email: "priya@example.com",
    state: "rate-limited",
    message: "Too many email checks. Please wait and retry.",
    retryAt: Date.now() - 1,
  }], () => {})
  assert.ok(expired.includes(">Retry</button>"))
  assert.ok(!expired.includes('disabled=""'))
})

test("availability API preserves Retry-After seconds, dates and missing headers on HTTP 429", async () => {
  const originalFetch = globalThis.fetch
  try {
    for (const [header, expected] of [["12", 12], ["0", 0], [null, null], ["invalid", null]]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: "Throttled" }), {
        status: 429,
        headers: header === null ? {} : { "Retry-After": header },
      })
      await assert.rejects(recipientEmailApi.check("user@example.com"), (error) => {
        assert.ok(error instanceof ApiError)
        assert.equal(error.status, 429)
        assert.equal(error.retryAfterSeconds, expected)
        return true
      })
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: "Throttled" }), {
      status: 429,
      headers: { "Retry-After": new Date(Date.now() + 120_000).toUTCString() },
    })
    await assert.rejects(recipientEmailApi.check("user@example.com"), (error) => {
      assert.equal(error.status, 429)
      assert.ok(error.retryAfterSeconds >= 119 && error.retryAfterSeconds <= 120)
      return true
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("recipient checkout gate fails closed until every email is confirmed available", () => {
  const status = (state) => ({ email: "user@example.com", state, ...(state === "available" ? {} : { message: "Unavailable" }) })
  assert.equal(recipientEmailsAreAvailable([status("available")]), true)
  for (const blocked of ["idle", "checking", "allocated", "duplicate", "invalid", "network-error", "rate-limited"]) {
    assert.equal(recipientEmailsAreAvailable([status(blocked)]), false, blocked)
  }
  assert.equal(recipientEmailsAreAvailable([]), false)
  assert.equal(recipientEmailsAreAvailable([status("available"), status("allocated")]), false)
})


test("actual persisted checkout store preserves remaining recipient slots through quantity changes", () => {
  checkoutStore.getState().clear()
  checkoutStore.getState().beginBulkCheckout(3)
  const entries = Array.from({ length: 3 }, (_, index) => ({ full_name: `Recipient ${index}`, email: `person${index}@example.com`, phone: "+447700900123" }))
  checkoutStore.getState().setRecipients(entries)
  checkoutStore.getState().confirmRecipients()
  checkoutStore.getState().beginBulkCheckout(5)
  assert.deepEqual(checkoutStore.getState().recipients.slice(0, 3), entries)
  assert.equal(checkoutStore.getState().recipients.length, 5)
  assert.equal(checkoutStore.getState().recipientDetailsConfirmed, false)
  checkoutStore.getState().beginBulkCheckout(2)
  assert.deepEqual(checkoutStore.getState().recipients, entries.slice(0, 2))
  assert.equal(checkoutStore.getState().bulkRecipientCount, 2)
  checkoutStore.getState().clear()
  assert.deepEqual(checkoutStore.getState().recipients, [])
  assert.equal(checkoutStore.getState().contact, null)
})

test("manual address fields still satisfy existing checkout validation without location detection", () => {
  assert.equal(addressValidation.validateAddressLine1("Flat 12, Main Road"), null)
  assert.equal(addressValidation.validateCity("Hyderabad"), null)
  assert.equal(addressValidation.validateDistrict("Hyderabad"), null)
  assert.equal(addressValidation.validateState("Telangana"), null)
  assert.equal(addressValidation.validatePincode("500001"), null)
})

test("actual cart store enforces quantity bounds and the total across lines", () => {
  cartStore.getState().clearCart()
  const card = { productId: "PRD-NEXORA-CUSTOM", name: "Custom", cardType: "Custom", color: { name: "Black", hex: "#000" }, qty: 10, price: 999 }
  cartStore.getState().addLine(card)
  const lineId = cartStore.getState().lines[0].lineId
  cartStore.getState().updateQty(lineId, 11)
  assert.equal(cartStore.getState().lines[0].qty, 10)
  cartStore.getState().updateQty(lineId, 0)
  assert.equal(cartStore.getState().lines[0].qty, 1)
  cartStore.getState().clearCart()
  cartStore.getState().addLine({ ...card, qty: 6 })
  cartStore.getState().addLine({ ...card, color: { name: "White", hex: "#fff" }, qty: 4 })
  assert.throws(() => cartStore.getState().addLine({ ...card, qty: 1 }), /1 to 10/)
  const first = cartStore.getState().lines[0]
  cartStore.getState().updateQty(first.lineId, 7)
  assert.equal(cartStore.getState().lines.reduce((sum, line) => sum + line.qty, 0), 10)
  cartStore.getState().clearCart()
})

test("legacy oversized cart quantities remain visible for correction instead of truncating checkout counts", () => {
  const lines = [{ lineId: "legacy", productId: "PRD-NEXORA-CUSTOM", cardType: "Custom", qty: 11 }]
  assert.equal(sanitizeCartLines(lines)[0].qty, 11)
})
