import assert from "node:assert/strict"
import { after, before, beforeEach, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as reactRouter from "react-router-dom"
import { createServer } from "vite"

// Purchaser vs recipient route separation: the real ProtectedRoute and
// session store, rendered server-side (no browser) like recipient-fields.
let vite
let router
let ProtectedRoute
let auth
let api
const saved = {}

before(async () => {
  for (const key of ["sessionStorage", "localStorage", "window"]) saved[key] = Object.getOwnPropertyDescriptor(globalThis, key)
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage })
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/dashboard" }, localStorage: storage } })
  vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" })
  // Vite externalizes the router for SSR, so this is the instance ProtectedRoute uses.
  router = reactRouter
  ProtectedRoute = (await vite.ssrLoadModule("/src/components/auth/ProtectedRoute.tsx")).ProtectedRoute
  auth = await vite.ssrLoadModule("/src/store/auth-store.ts")
  api = await vite.ssrLoadModule("/src/lib/api.ts")
})

after(async () => {
  await vite?.close()
  for (const [key, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})

const customer = (roles) => ({ id: 7, email: "a@example.com", full_name: "A", phone: "", role: "CUSTOMER", roles, avatar: "", email_verified: true })

beforeEach(() => {
  api.setTokens("access-token", "refresh-token", "customer")
})

function signIn(user) {
  auth.useCustomerSessionStore.setState({ user, hydrated: true })
  // Server rendering reads Zustand's initial-state snapshot (getServerSnapshot),
  // not the live state, so mirror the signed-in session there as well.
  Object.assign(auth.useCustomerSessionStore.getInitialState(), { user, hydrated: true })
}

/** Renders `path` through a recipient-only and a purchaser route group. */
function render(path) {
  const { MemoryRouter, Routes, Route } = router
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [path] },
      createElement(Routes, null,
        createElement(Route, { element: createElement(ProtectedRoute, { role: "CUSTOMER" }) },
          createElement(Route, { element: createElement(ProtectedRoute, { role: "CUSTOMER", requireRecipient: true }) },
            createElement(Route, { path: "/dashboard", element: createElement("p", null, "CUSTOMER-DASHBOARD") }),
            createElement(Route, { path: "/profile", element: createElement("p", null, "DIGITAL-PROFILE") }),
          ),
          createElement(Route, { path: "/orders", element: createElement("p", null, "MY-ORDERS") }),
        ),
      ),
    ),
  )
}

test("role helpers: purchaser-only, recipient-only, both, legacy payload and admin", () => {
  assert.equal(auth.isRecipientUser(customer(["PURCHASER"])), false)
  assert.equal(auth.isRecipientUser(customer(["RECIPIENT"])), true)
  assert.equal(auth.isRecipientUser(customer(["PURCHASER", "RECIPIENT"])), true)
  assert.equal(auth.isRecipientUser(customer(undefined)), false, "fails closed without server roles")
  assert.equal(auth.isRecipientUser({ ...customer(["RECIPIENT"]), role: "ADMIN" }), false)
  assert.equal(auth.isRecipientUser(null), false)
  assert.equal(auth.customerHomePath(customer(["PURCHASER"])), "/purchaser")
  assert.equal(auth.customerHomePath(customer(["PURCHASER", "RECIPIENT"])), "/dashboard")
})

test("purchaser-only account is sent from Customer Dashboard pages to the matching Purchaser Dashboard page", () => {
  assert.equal(auth.purchaserPathFor("/dashboard"), "/purchaser")
  assert.equal(auth.purchaserPathFor("/profile"), "/purchaser")
  assert.equal(auth.purchaserPathFor("/orders"), "/purchaser/orders")
  assert.equal(auth.purchaserPathFor("/orders/"), "/purchaser/orders")
  assert.equal(auth.purchaserPathFor("/addresses"), "/purchaser/addresses")
  assert.equal(auth.purchaserPathFor("/settings"), "/purchaser/settings")
  assert.equal(auth.purchaserPathFor("/testimonials"), "/purchaser/testimonials")
})

test("purchaser-only account is blocked from Customer Dashboard and profile pages but keeps My Orders", () => {
  signIn(customer(["PURCHASER"]))
  assert.ok(!render("/dashboard").includes("CUSTOMER-DASHBOARD"))
  assert.ok(!render("/profile").includes("DIGITAL-PROFILE"))
  assert.ok(render("/orders").includes("MY-ORDERS"))
})

test("recipient account reaches the Customer Dashboard and profile", () => {
  signIn(customer(["RECIPIENT"]))
  assert.ok(render("/dashboard").includes("CUSTOMER-DASHBOARD"))
  assert.ok(render("/profile").includes("DIGITAL-PROFILE"))
  assert.ok(render("/orders").includes("MY-ORDERS"))
})

test("one account holding both roles reaches both dashboards", () => {
  signIn(customer(["PURCHASER", "RECIPIENT"]))
  assert.ok(render("/dashboard").includes("CUSTOMER-DASHBOARD"))
  assert.ok(render("/orders").includes("MY-ORDERS"))
})

test("a session without a token reaches neither", () => {
  signIn(customer(["PURCHASER", "RECIPIENT"]))
  api.clearTokens("customer")
  assert.ok(!render("/dashboard").includes("CUSTOMER-DASHBOARD"))
  assert.ok(!render("/orders").includes("MY-ORDERS"))
})
