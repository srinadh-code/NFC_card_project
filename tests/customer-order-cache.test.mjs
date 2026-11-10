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
let Orders
const identityKey = "__customerOrderCacheTestIdentity"

before(async () => {
  globalThis[identityKey] = null
  vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    ssr: { external: true },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    plugins: [{
      name: "customer-order-cache-test-identity",
      enforce: "pre",
      resolveId(id) {
        if (id.replaceAll("\\", "/").match(/\/store\/auth-store(?:\.ts)?$/)) return "\0customer-order-test-auth"
      },
      load(id) {
        if (id === "\0customer-order-test-auth") {
          return `export const useCustomerAuthStore = (selector) => selector({ customer: globalThis.${identityKey} });`
        }
      },
    }],
  })
  Orders = (await vite.ssrLoadModule("/src/pages/customer/Orders.tsx")).default
})

after(async () => {
  await vite?.close()
  delete globalThis[identityKey]
})

const customer = (id) => ({ id, name: `Purchaser ${id}`, email: `${id}@example.com`, phone: "9000000001" })
const order = (id, customerId, quantity = 1) => ({
  id, order_number: `PRIVATE-ORDER-${id}`, customer_id: Number(customerId),
  customer_name: `Purchaser ${customerId}`, customer_email: `${customerId}@example.com`, customer_phone: "9000000001",
  items: [{ product_id: "custom", name: "Custom Card", card_type: "CUSTOM", color: "Black", qty: quantity, price: "100.00" }],
  amount: `${100 * quantity}.00`, shipping: "0.00", total: `${100 * quantity}.00`,
  payment_method: "RAZORPAY", payment_status: "PAID", status: "PENDING",
  address: { line1: "Saved address", city: "Hyderabad", state: "Telangana", pincode: "500001", country: "India" },
  tracking: [], tracking_token: `tracking-${id}`, assigned_card_id: null, placed_at: "2026-11-09T09:00:00Z",
})
const history = (...orders) => ({ items: orders, pagination: { count: orders.length, page: 1, num_pages: 1, page_size: 100 } })
function render(client, identity) {
  globalThis[identityKey] = identity
  return renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(MemoryRouter, { initialEntries: ["/orders"] }, createElement(Orders)),
  ))
}

test("My Orders never shows the previous purchaser's fresh cache after logout and account switching", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  try {
    client.setQueryData(customerOrderKeys.page("101"), history(order(1001, "101")))
    client.setQueryData(customerOrderKeys.page("202"), history(order(2001, "202")))

    const firstLogin = render(client, customer("101"))
    assert.ok(firstLogin.includes("PRIVATE-ORDER-1001"))
    assert.ok(!firstLogin.includes("PRIVATE-ORDER-2001"))

    assert.equal(render(client, null), "")

    const secondLogin = render(client, customer("202"))
    assert.ok(secondLogin.includes("PRIVATE-ORDER-2001"))
    assert.ok(!secondLogin.includes("PRIVATE-ORDER-1001"))

    // A third account without cached history gets its own loading state.
    const uncachedLogin = render(client, customer("303"))
    assert.ok(!uncachedLogin.includes("PRIVATE-ORDER-1001"))
    assert.ok(!uncachedLogin.includes("PRIVATE-ORDER-2001"))
    assert.ok(!uncachedLogin.includes("No orders yet"))
  } finally {
    client.clear()
  }
})

test("a purchaser without an NFC card or profile sees both purchases as separate orders", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  try {
    client.setQueryData(customerOrderKeys.page("101"), history(order(1001, "101", 3), order(1002, "101", 1)))
    const html = render(client, customer("101"))
    assert.ok(html.includes("PRIVATE-ORDER-1001"))
    assert.ok(html.includes("PRIVATE-ORDER-1002"))
    assert.ok(html.includes("Qty: 3"))
    assert.ok(html.includes("Qty: 1"))
    assert.equal((html.match(/Track Order</g) ?? []).length, 2)
  } finally {
    client.clear()
  }
})

test("cancellation invalidates all pages for its purchaser without invalidating another account", async () => {
  const client = new QueryClient()
  try {
    client.setQueryData(customerOrderKeys.page("101", 1), history(order(1001, "101")))
    client.setQueryData(customerOrderKeys.page("101", 2), history(order(1002, "101")))
    client.setQueryData(customerOrderKeys.page("202", 1), history(order(2001, "202")))
    await client.invalidateQueries({ queryKey: customerOrderKeys.customer("101") })
    assert.equal(client.getQueryState(customerOrderKeys.page("101", 1)).isInvalidated, true)
    assert.equal(client.getQueryState(customerOrderKeys.page("101", 2)).isInvalidated, true)
    assert.equal(client.getQueryState(customerOrderKeys.page("202", 1)).isInvalidated, false)
  } finally {
    client.clear()
  }
})
