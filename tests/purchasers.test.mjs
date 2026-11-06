import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { createServer } from "vite"

let vite
let api
let Purchasers
let PurchaserDetails
let previousLocalStorage
const originalFetch = globalThis.fetch

before(async () => {
  previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  const storage = new Map()
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  } })
  vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" })
  api = (await vite.ssrLoadModule("/src/lib/purchasers-api.ts")).adminPurchaserApi
  Purchasers = (await vite.ssrLoadModule("/src/pages/admin/Purchasers.tsx")).default
  PurchaserDetails = (await vite.ssrLoadModule("/src/pages/admin/PurchaserDetails.tsx")).default
})

after(async () => {
  await vite?.close()
  globalThis.fetch = originalFetch
  if (previousLocalStorage) Object.defineProperty(globalThis, "localStorage", previousLocalStorage)
  else delete globalThis.localStorage
})

function purchase(id, name = "Srinadh", quantity = 1) {
  return {
    id, order_number: `ORDER-${id}`, customer_id: 73,
    name, email: "same@example.com", phone: "9000000001",
    total_cards_purchased: quantity, total_amount_paid: `${quantity * 100}.00`,
    purchase_date: "2026-11-06T09:00:00Z", total_cards_assigned: 0, total_cards_activated: 0,
  }
}

function order(row) {
  return {
    id: row.id, order_number: row.order_number, customer_id: row.customer_id,
    customer_name: row.name, customer_email: row.email, customer_phone: row.phone,
    items: [{ product_id: "custom", name: "Custom Card", card_type: "CUSTOM", color: "Black", qty: row.total_cards_purchased, price: "100.00" }],
    recipients: Array.from({ length: row.total_cards_purchased }, (_, index) => ({
      id: row.id * 10 + index, name: `Order ${row.id} Recipient ${index + 1}`,
      email: `order${row.id}.recipient${index + 1}@example.com`, phone: "+447700900123",
      assigned_card_id: null, activation_status: "UNASSIGNED", invitation_status: "PENDING",
    })),
    amount: row.total_amount_paid, shipping: "0.00", total: row.total_amount_paid,
    payment_method: "RAZORPAY", payment_status: "PAID", status: "PENDING",
    address: { line1: "Saved address", city: "Hyderabad", state: "Telangana", pincode: "500001", country: "India" },
    tracking: [], assigned_card_id: null, placed_at: row.purchase_date,
  }
}

function respond(data, count = Array.isArray(data) ? data.length : undefined) {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return Response.json({ success: true, data, pagination: count === undefined ? undefined : { count, num_pages: 1 } })
  }
  return calls
}

function render(Page, key, data, path = "/admin/purchasers") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(key, data)
  try {
    return renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(MemoryRouter, { initialEntries: [path] },
        createElement(Routes, null, createElement(Route, {
          path: path === "/admin/purchasers" ? path : "/admin/purchasers/:id",
          element: createElement(Page),
        })),
      ),
    ))
  } finally {
    client.clear()
  }
}

test("same-email purchases keep their own order IDs, names, card quantities and paid totals", async () => {
  const calls = respond([purchase(1001, "Kavya", 1), purchase(1002, "Manideep", 3)])
  const data = await api.list({ page: 1, search: "same@example.com" })
  assert.match(calls[0], /\/admin\/purchasers\/\?page=1&search=same%40example.com$/)
  assert.equal(data.count, 2)
  assert.deepEqual(data.data.map((row) => [row.id, row.customerId, row.name, row.totalCardsPurchased, row.totalAmountPaid]), [
    ["1001", "73", "Kavya", 1, 100], ["1002", "73", "Manideep", 3, 300],
  ])
  const html = render(Purchasers, ["admin-purchasers", 1, ""], data)
  assert.equal((html.match(/<tr\b/g) ?? []).length, 3)
  for (const value of ["Kavya", "Manideep", "1 cards", "3 cards"]) assert.ok(html.includes(value))
  for (const id of [1001, 1002]) assert.ok(html.includes(`href="/admin/purchasers/${id}"`))
  assert.ok(!html.includes('href="/admin/purchasers/73"'))
  const headings = [...html.matchAll(/<th\b[^>]*>(.*?)<\/th>/gs)].map((match) => match[1])
  assert.deepEqual(headings, ["Order ID", "Purchaser Name", "Purchaser Email", "Purchaser Phone", "Cards Purchased", "Total Paid", "Purchase Date", "View Details"])
})

test("identical purchaser names and emails still render three independent purchases", async () => {
  respond([purchase(1001, "Srinadh", 3), purchase(1002, "Srinadh", 1), purchase(1003, "Srinadh", 3)])
  const data = await api.list()
  const html = render(Purchasers, ["admin-purchasers", 1, ""], data)
  assert.equal((html.match(/<tr\b/g) ?? []).length, 4)
  assert.equal(data.count, 3)
  assert.deepEqual(data.data.map((row) => row.totalCardsPurchased), [3, 1, 3])
})

test("detail requests use the order ID and show only that order's recipients", async () => {
  const row = purchase(1002, "Manideep", 2)
  const calls = respond({ ...row, order: order(row) })
  const data = await api.get("1002")
  assert.match(calls[0], /\/admin\/purchasers\/1002\/$/)
  assert.equal(data.order.id, "1002")
  assert.equal(data.order.customerId, "73")
  assert.equal(data.order.recipients.length, 2)
  const html = render(PurchaserDetails, ["admin-purchaser", "1002"], data, "/admin/purchasers/1002")
  assert.ok(html.includes("Manideep"))
  for (const recipient of data.order.recipients) {
    assert.ok(html.includes(recipient.name))
    assert.ok(html.includes(recipient.email))
    assert.ok(html.includes(recipient.phone))
  }
  assert.ok(!html.includes("order1001.recipient"))
  assert.ok(!html.includes("ORDER-1001"))
  assert.ok(html.includes('href="/admin/orders?order=1002"'))
})

test("missing historical purchaser snapshots display Not recorded", async () => {
  const row = { ...purchase(1001), name: "", email: "", phone: "" }
  respond([row])
  const data = await api.list()
  const html = render(Purchasers, ["admin-purchasers", 1, ""], data)
  assert.equal((html.match(/Not recorded/g) ?? []).length, 3)
  assert.ok(!html.includes("Srinadh"))
})
