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
let cartStore
let sanitizeCartLines

before(async () => {
  // Load the real TSX component and project aliases without a browser or
  // a listening development server; no extra test dependency is needed.
  previousSessionStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage")
  previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  const values = new Map()
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  } })
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: globalThis.sessionStorage })
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
  RecipientFields = (await vite.ssrLoadModule("/src/components/checkout/BulkRecipientFields.tsx")).BulkRecipientFields
  checkoutStore = (await vite.ssrLoadModule("/src/store/checkout-verification-store.ts")).useCheckoutVerificationStore
  const cart = await vite.ssrLoadModule("/src/store/cart-store.ts")
  cartStore = cart.useCartStore
  sanitizeCartLines = cart.sanitizeCartLines
})
after(async () => {
  await vite?.close()
  if (previousSessionStorage) Object.defineProperty(globalThis, "sessionStorage", previousSessionStorage)
  else delete globalThis.sessionStorage
  if (previousLocalStorage) Object.defineProperty(globalThis, "localStorage", previousLocalStorage)
  else delete globalThis.localStorage
})

function render(count, recipients = [], errors = []) {
  return renderToStaticMarkup(createElement(RecipientFields, { count, recipients, errors, onChange() {} }))
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
