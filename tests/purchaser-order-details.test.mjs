import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { createServer } from "vite"
import { customerOrderKeys } from "../src/lib/customer-order-queries.ts"

let vite
let api
let Dashboard
let Orders
let OrderDetailsView
const identityKey = "__purchaserOrderDetailsIdentity"
const originalFetch = globalThis.fetch
const saved = {}

before(async () => {
  globalThis[identityKey] = null
  for (const key of ["localStorage", "window"]) saved[key] = Object.getOwnPropertyDescriptor(globalThis, key)
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })
  vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    ssr: { external: true },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    plugins: [{
      name: "purchaser-order-details-ssr",
      enforce: "pre",
      resolveId(id) {
        const normalized = id.replaceAll("\\", "/")
        if (/\/store\/auth-store(?:\.ts)?$/.test(normalized)) return "\0purchaser-details-auth"
        if (/\/components\/ui\/dialog(?:\.tsx)?$/.test(normalized)) return "\0purchaser-details-dialog"
      },
      load(id) {
        if (id === "\0purchaser-details-auth") {
          return `export const useCustomerAuthStore = (selector) => selector({ customer: globalThis.${identityKey} });`
        }
        if (id === "\0purchaser-details-dialog") {
          // Radix portals do not render on the server. Keep their open/closed
          // behavior while allowing the actual page/query/content to render.
          return `import { createElement } from "react";
            export const Dialog = ({ open, children }) => open ? createElement("section", { "data-test-dialog": true }, children) : null;
            export const DialogContent = ({ children, className }) => createElement("div", { className }, children);
            export const DialogHeader = DialogContent;
            export const DialogFooter = DialogContent;
            export const DialogTitle = ({ children }) => createElement("h2", null, children);
            export const DialogDescription = ({ children }) => createElement("p", null, children);`
        }
      },
    }],
  })
  api = await vite.ssrLoadModule("/src/lib/api.ts")
  Dashboard = (await vite.ssrLoadModule("/src/pages/purchaser/PurchaserDashboard.tsx")).default
  Orders = (await vite.ssrLoadModule("/src/pages/customer/Orders.tsx")).default
  OrderDetailsView = (await vite.ssrLoadModule("/src/components/orders/OrderDetailsView.tsx")).OrderDetailsView
})

after(async () => {
  await vite?.close()
  globalThis.fetch = originalFetch
  delete globalThis[identityKey]
  for (const [key, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})

const purchaser = (id = "73") => ({ id, name: "Srinadh", email: "srinadh@example.com", phone: "9000000001" })
const recipient = (id, name, email, fields = {}) => ({
  id, name, email, phone: `9000000${String(id).slice(-3)}`,
  user_id: id + 200, assigned_card_id: null, activation_status: "UNASSIGNED", invitation_status: "PENDING",
  ...fields,
})
const kavya = recipient(101, "Kavya", "kavya@example.com", {
  assigned_card_id: 501, assigned_card_uid: "FIRST-ORDER-CARD", assigned_card_serial: "SN-501",
  assigned_card_status: "ACTIVE", activation_status: "ACTIVE", profile_username: "kavya",
})
const lakshmi = recipient(102, "Lakshmi", "lakshmi@example.com", {
  assigned_card_id: 502, assigned_card_uid: "PENDING-CARD", assigned_card_status: "ASSIGNED", activation_status: "PENDING",
})
const srinadh = recipient(103, "Srinadh", "srinadh@example.com")
const deepika = recipient(202, "Deepika", "deepika@example.com", { phone: null })
const order = (id, code, recipients, fields = {}) => ({
  id, order_number: code, customer_id: 73,
  customer_name: "Srinadh at purchase", customer_email: "purchase-snapshot@example.com", customer_phone: "9000000001",
  items: [{ product_id: "custom", name: "Custom Card", card_type: "CUSTOM", color: "Black", qty: recipients.length, price: "100.00" }],
  recipients,
  amount: `${100 * recipients.length}.00`, shipping: "0.00", total: `${100 * recipients.length}.00`,
  payment_method: "RAZORPAY", payment_status: "PAID", status: "PROCESSING",
  address: { line1: "Saved address", city: "Hyderabad", state: "Telangana", pincode: "500001", country: "India" },
  tracking: [], assigned_card_id: null, placed_at: "2026-11-09T09:00:00Z",
  ...fields,
})
const firstOrder = () => order(1001, "NXTRK382130", [kavya, lakshmi, srinadh])
// Repeated names and emails belong to independent recipient records.
const secondOrder = () => order(1002, "NXTRK941666", [recipient(201, "Kavya", "kavya@example.com"), deepika])
const history = (...items) => ({ items, pagination: { count: items.length, page: 1, num_pages: 1, page_size: 100 } })
const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } })

function render(Page, client, path = "/purchaser/orders", identity = purchaser(), props = {}) {
  globalThis[identityKey] = identity
  return renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(Page, props)),
  ))
}

function details(row) {
  const client = queryClient()
  try {
    return render(OrderDetailsView, client, "/purchaser/orders", purchaser(), { order: api.toFrontendOrder(row) })
  } finally {
    client.clear()
  }
}

const bodyRows = (html) => [...html.matchAll(/<tbody\b[^>]*>(.*?)<\/tbody>/gs)]
  .flatMap((match) => [...match[1].matchAll(/<tr\b[^>]*>(.*?)<\/tr>/gs)].map((row) => row[1]))

test("customer detail API requests each parent order ID and keeps its own recipient records", async () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/purchaser/orders" } } })
  api.setTokens("purchaser-access", "purchaser-refresh", "customer")
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), authorization: options.headers.Authorization })
    return Response.json({ success: true, data: String(url).endsWith("/1001/") ? firstOrder() : secondOrder() })
  }
  const first = api.toFrontendOrder(await api.ordersApi.getById("1001"))
  const second = api.toFrontendOrder(await api.ordersApi.getById("1002"))
  assert.match(calls[0].url, /\/customer\/orders\/1001\/$/)
  assert.match(calls[1].url, /\/customer\/orders\/1002\/$/)
  assert.ok(calls.every((call) => call.authorization === "Bearer purchaser-access"))
  assert.deepEqual(first.recipients.map((row) => row.id), ["101", "102", "103"])
  assert.deepEqual(second.recipients.map((row) => row.id), ["201", "202"])
  assert.equal(first.recipients[0].assignedCardUid, "FIRST-ORDER-CARD")
  assert.equal(second.recipients[0].assignedCardId, null)
  assert.equal(second.recipients[1].phone, "")
})

test("dashboard keeps two orders, five cards, paid totals, and links to My Orders and each purchase", () => {
  const client = queryClient()
  try {
    client.setQueryData(customerOrderKeys.page("73"), history(firstOrder(), secondOrder()))
    const html = render(Dashboard, client, "/purchaser")
    assert.match(html, /Total Orders<\/p><p[^>]*>2<\/p>/)
    assert.match(html, /Cards Purchased<\/p><p[^>]*>5<\/p>/)
    assert.match(html, /Amount Paid<\/p><p[^>]*>[^<]*500[^<]*<\/p>/)
    assert.match(html, /Orders In Progress<\/p><p[^>]*>2<\/p>/)
    const links = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs)]
    assert.ok(links.some(([, href, content]) => href === "/purchaser/orders" && content.includes("Total Orders")))
    assert.ok(links.some(([, href, content]) => href === "/purchaser/orders" && /View all/i.test(content)))
    for (const id of [1001, 1002]) assert.ok(html.includes(`href="/purchaser/orders?order=${id}"`))
    for (const code of ["NXTRK382130", "NXTRK941666"]) assert.ok(html.includes(code))
  } finally {
    client.clear()
  }
})

test("My Orders still renders two independent cards with their existing tracking and cancellation actions", () => {
  const client = queryClient()
  try {
    client.setQueryData(customerOrderKeys.page("73"), history(firstOrder(), secondOrder()))
    const html = render(Orders, client)
    assert.ok(html.includes("NXTRK382130"))
    assert.ok(html.includes("NXTRK941666"))
    assert.ok(html.includes("Qty: 3"))
    assert.ok(html.includes("Qty: 2"))
    assert.equal((html.match(/Track Order</g) ?? []).length, 2)
    assert.equal((html.match(/View Details</g) ?? []).length, 2)
    assert.equal((html.match(/Cancel Order</g) ?? []).length, 2)
  } finally {
    client.clear()
  }
})

test("three-card order shows all three recipients including its purchaser and card states", () => {
  const html = details(firstOrder())
  const rows = bodyRows(html)
  assert.equal(rows.length, 3)
  for (const row of [kavya, lakshmi, srinadh]) {
    assert.ok(rows.some((content) => content.includes(row.name) && content.includes(row.email) && content.includes(row.phone)))
  }
  for (const label of ["Order ID", "Purchase Date", "Card Quantity", "Total Amount", "Payment Status", "Order Status"]) assert.ok(html.includes(label))
  assert.ok(html.includes("NXTRK382130"))
  assert.ok(html.includes("Srinadh at purchase"))
  assert.ok(html.includes("purchase-snapshot@example.com"))
  assert.ok(rows[0].includes("Active"))
  assert.ok(rows[0].includes("SN-501"))
  assert.ok(rows[1].includes("Assigned"))
  assert.ok(rows[1].includes("Pending"))
  assert.ok(rows[2].includes("Unassigned"))
  assert.ok(!html.includes('href="/admin/'))
  assert.ok(!html.includes('href="/u/'))
  assert.ok(!html.includes("deepika@example.com"))
})

test("two-card order shows its actual two recipients without borrowing repeated-email assignments", () => {
  const html = details(secondOrder())
  const rows = bodyRows(html)
  assert.equal(rows.length, 2)
  assert.ok(rows[0].includes("kavya@example.com"))
  assert.ok(rows[0].includes("Unassigned"))
  assert.ok(rows[1].includes("deepika@example.com"))
  assert.ok(rows[1].includes("Not recorded"))
  assert.ok(!html.includes("FIRST-ORDER-CARD"))
  assert.ok(!html.includes("SN-501"))
  assert.ok(!html.includes("lakshmi@example.com"))
  assert.ok(!html.includes("srinadh@example.com"))
  assert.ok(!html.includes("NXTRK382130"))
})

test("a self-only order retains the purchaser's recipient record, and an others-only order retains all others", () => {
  const self = details(order(1003, "SELF-ORDER", [srinadh]))
  assert.equal(bodyRows(self).length, 1)
  assert.ok(bodyRows(self)[0].includes("srinadh@example.com"))
  const others = details(order(1004, "OTHERS-ORDER", [kavya, lakshmi, deepika]))
  assert.equal(bodyRows(others).length, 3)
  for (const email of [kavya.email, lakshmi.email, deepika.email]) assert.ok(others.includes(email))
  assert.ok(!others.includes("srinadh@example.com"))
})

test("historical orders without recipients show the existing empty message instead of synthetic recipients", () => {
  const row = { ...firstOrder(), recipients: [] }
  const html = details(row)
  assert.ok(html.includes("Recipient details were not recorded for this historical order."))
  assert.ok(!html.includes("kavya@example.com"))
  assert.ok(!html.includes("srinadh@example.com"))
  assert.match(html, /colSpan="5"|colspan="5"/)
})

test("selected-order dialog uses its detail cache instead of merging the purchaser's list recipients", () => {
  const client = queryClient()
  try {
    client.setQueryData(customerOrderKeys.page("73"), history(firstOrder(), secondOrder()))
    client.setQueryData(customerOrderKeys.detail("73", "1001"), firstOrder())
    client.setQueryData(customerOrderKeys.detail("73", "1002"), secondOrder())
    const first = render(Orders, client, "/purchaser/orders?order=1001")
    const second = render(Orders, client, "/purchaser/orders?order=1002")
    assert.equal(bodyRows(first).length, 3)
    assert.equal(bodyRows(second).length, 2)
    assert.ok(bodyRows(first).some((row) => row.includes("srinadh@example.com")))
    assert.ok(!bodyRows(second).some((row) => row.includes("srinadh@example.com")))
    assert.ok(!second.includes("FIRST-ORDER-CARD"))
  } finally {
    client.clear()
  }
})

test("selected-order loading and account switching never reuse another order's or purchaser's recipients", () => {
  const client = queryClient()
  try {
    client.setQueryData(customerOrderKeys.page("73"), history(firstOrder(), secondOrder()))
    client.setQueryData(customerOrderKeys.detail("73", "1001"), firstOrder())
    const loading = render(Orders, client, "/purchaser/orders?order=1002")
    assert.equal(bodyRows(loading).length, 0)
    assert.ok(!loading.includes("FIRST-ORDER-CARD"))
    assert.ok(!loading.includes("Recipient details were not recorded"))
    assert.ok(loading.includes('data-slot="skeleton"'))
    const switched = render(Orders, client, "/purchaser/orders?order=1001", purchaser("99"))
    assert.equal(bodyRows(switched).length, 0)
    assert.ok(!switched.includes("FIRST-ORDER-CARD"))
    assert.ok(!switched.includes("NXTRK382130"))
  } finally {
    client.clear()
  }
})

test("selected-order API errors show a retry state without falling back to list recipients", async () => {
  const client = queryClient()
  try {
    client.setQueryData(customerOrderKeys.page("73"), history(firstOrder()))
    await assert.rejects(client.fetchQuery({
      queryKey: customerOrderKeys.detail("73", "1001"),
      queryFn: async () => { throw new api.ApiError("Order not found.", 404) },
    }))
    const html = render(Orders, client, "/purchaser/orders?order=1001")
    assert.ok(html.includes("Not found"))
    assert.ok(html.includes("Try Again"))
    assert.equal(bodyRows(html).length, 0)
    assert.ok(!html.includes("FIRST-ORDER-CARD"))
  } finally {
    client.clear()
  }
})
