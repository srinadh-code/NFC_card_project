import assert from "node:assert/strict"
import { after, before, beforeEach, test } from "node:test"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"
import { toCsv } from "../src/components/admin/export-csv.ts"
import { sanitizeRedirect } from "../src/lib/utils.ts"

let vite, api, auth, queryClient, cart
const originals = new Map()
const storage = new Map()
const listeners = new Map()
const user = (id, role = "CUSTOMER") => ({ id, role, full_name: `Person ${id}`, email: `${id}@example.com`, roles: ["RECIPIENT", "PURCHASER"] })
const response = (data, status = 200) => new Response(JSON.stringify({ success: status < 400, data }), { status })
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
const tokenFor = (id, suffix = "signature") => `header.${Buffer.from(JSON.stringify({ user_id: id })).toString("base64url")}.${suffix}`
function facade() {
  let result
  function Probe() { result = auth.useCustomerAuthStore((state) => state); return null }
  renderToStaticMarkup(createElement(Probe))
  return result
}

before(async () => {
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  }
  for (const [key, value] of Object.entries({
    localStorage, sessionStorage: localStorage,
    window: { location: { pathname: "/dashboard" }, localStorage, addEventListener: (name, handler) => listeners.set(name, handler) },
    fetch: () => { throw new Error("Unexpected network request in security test") },
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  vite = await createServer({
    configFile: false, appType: "custom", server: { middlewareMode: true, hmr: false },
    ssr: { external: ["react", "zustand", "zustand/middleware", "@tanstack/react-query"] }, optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  })
  api = await vite.ssrLoadModule("/src/lib/api.ts")
  auth = await vite.ssrLoadModule("/src/store/auth-store.ts")
  queryClient = (await vite.ssrLoadModule("/src/lib/query-client.ts")).queryClient
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } })
  cart = (await vite.ssrLoadModule("/src/store/cart-store.ts")).useCartStore
})

beforeEach(() => {
  api.clearTokens("customer")
  api.clearTokens("admin")
  auth.useCustomerSessionStore.setState({ user: null, hydrated: true })
  auth.useAdminSessionStore.setState({ user: null, hydrated: true })
  storage.clear()
  queryClient.clear()
  cart.getState().clearCart()
  globalThis.fetch = () => { throw new Error("Unexpected network request in security test") }
})

after(async () => {
  queryClient?.clear()
  await vite?.close()
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})

test("logout clears private queries/mutations and keeps the other portal's credentials", () => {
  api.setTokens("a-access", "a-refresh", "customer")
  api.setTokens("admin-access", "admin-refresh", "admin")
  auth.useCustomerSessionStore.getState().setUser(user(1))
  queryClient.setQueryData(["profile-me"], { private: "Person A profile" })
  queryClient.setQueryData(["customer-addresses"], [{ address: "Person A address" }])
  queryClient.getMutationCache().build(queryClient, { mutationKey: ["private-mutation"], gcTime: 0 })
  globalThis.fetch = async () => response(null)
  facade().logout()
  assert.equal(queryClient.getQueryCache().getAll().length, 0)
  assert.equal(queryClient.getMutationCache().getAll().length, 0)
  assert.equal(auth.useCustomerSessionStore.getState().user, null)
  assert.equal(api.getAccessToken("customer"), null)
  assert.equal(api.getAccessToken("admin"), "admin-access")
})

test("changing identity clears all private cache keys before the new user renders", () => {
  auth.useCustomerSessionStore.getState().setUser(user(1))
  for (const key of ["profile-me", "customer-addresses", "customer-notifications", "admin-dashboard"]) {
    queryClient.setQueryData([key], { private: "Person A" })
  }
  auth.useCustomerSessionStore.getState().setUser(user(2))
  assert.equal(queryClient.getQueryCache().getAll().length, 0)
  assert.equal(auth.useCustomerSessionStore.getState().user.id, 2)
})

test("a query finishing after cache clearing cannot repopulate Person A's data", async () => {
  auth.useCustomerSessionStore.getState().setUser(user(1))
  const task = deferred()
  const result = queryClient.fetchQuery({ queryKey: ["profile-me"], queryFn: () => task.promise, retry: false }).catch((error) => error)
  auth.useCustomerSessionStore.getState().setUser(user(2))
  task.resolve({ private: "Person A" })
  await result
  assert.equal(queryClient.getQueryData(["profile-me"]), undefined)
})

for (const status of [200, 401]) {
  test(`a delayed ${status} authenticated response cannot affect the next login`, async () => {
    api.setTokens("a-access", "a-refresh", "customer")
    const task = deferred()
    globalThis.fetch = () => task.promise
    const pending = api.request("/customer/profile/", { method: "PATCH", body: { bio: "A edit" }, area: "customer" })
    const rejection = assert.rejects(pending, api.SessionChangedError)
    api.setTokens("b-access", "b-refresh", "customer")
    task.resolve(response({ private: "Person A" }, status))
    await rejection
    assert.equal(api.getAccessToken("customer"), "b-access")
  })
}

for (const nextSession of ["logout", "different login"]) {
  test(`in-flight refresh cannot restore Person A's tokens after ${nextSession}`, async () => {
    api.setTokens("expired-a", "a-refresh", "customer")
    const refreshing = deferred()
    const started = deferred()
    globalThis.fetch = async (url) => {
      if (url.endsWith("/auth/token/refresh/")) { started.resolve(); return refreshing.promise }
      return response(null, 401)
    }
    const pending = api.request("/customer/profile/", { area: "customer" })
    const rejection = assert.rejects(pending, api.SessionChangedError)
    await started.promise
    if (nextSession === "logout") api.clearTokens("customer")
    else api.setTokens("b-access", "b-refresh", "customer")
    refreshing.resolve(new Response(JSON.stringify({ access: "renewed-a", refresh: "rotated-a" })))
    await rejection
    assert.equal(api.getAccessToken("customer"), nextSession === "logout" ? null : "b-access")
  })
}

test("a valid refresh still retries the original portal and updates its tokens", async () => {
  api.setTokens(tokenFor(1, "expired"), "a-refresh", "customer")
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/auth/token/refresh/")) return new Response(JSON.stringify({ access: tokenFor(1, "renewed"), refresh: "rotated-a" }))
    return options.headers.Authorization === `Bearer ${tokenFor(1, "renewed")}` ? response({ id: 1 }) : response(null, 401)
  }
  assert.deepEqual(await api.request("/auth/me/", { area: "customer" }), { id: 1 })
  assert.equal(api.getRefreshToken("customer"), "rotated-a")
})

test("an invalid session clears private data and finishes startup hydration", async () => {
  api.setTokens("invalid-a", "invalid-refresh", "customer")
  queryClient.setQueryData(["profile-me"], { private: "A" })
  auth.useCustomerSessionStore.setState({ user: user(1), hydrated: false })
  globalThis.fetch = async () => response(null, 401)
  await auth.useCustomerSessionStore.getState().bootstrap()
  assert.equal(auth.useCustomerSessionStore.getState().hydrated, true)
  assert.equal(auth.useCustomerSessionStore.getState().user, null)
  assert.equal(queryClient.getQueryCache().getAll().length, 0)
})

test("a delayed bootstrap cannot reinstate the previous account", async () => {
  api.setTokens("a-access", "a-refresh", "customer")
  const task = deferred()
  globalThis.fetch = () => task.promise
  const pending = auth.useCustomerSessionStore.getState().bootstrap()
  api.setTokens("b-access", "b-refresh", "customer")
  auth.useCustomerSessionStore.getState().setUser(user(2))
  task.resolve(response(user(1)))
  await pending
  assert.equal(auth.useCustomerSessionStore.getState().user.id, 2)
})

test("a pending login cannot sign the user back in after logout", async () => {
  const task = deferred()
  globalThis.fetch = () => task.promise
  const customerAuth = facade()
  const pending = customerAuth.login("1@example.com", "test-only-password")
  customerAuth.logout()
  task.resolve(response({ user: user(1), access: "a-access", refresh: "a-refresh" }))
  assert.equal((await pending).success, false)
  assert.equal(api.getAccessToken("customer"), null)
})

test("normal login preserves the guest cart for its existing merge workflow", async () => {
  const line = { lineId: "guest-line", productId: "custom", cardType: "Custom", qty: 1, price: 100, color: { name: "Black", hex: "#000" } }
  cart.setState({ lines: [line] })
  globalThis.fetch = async () => response({ user: user(1), access: "a-access", refresh: "a-refresh" })
  assert.equal((await facade().login("1@example.com", "test-only-password")).success, true)
  assert.equal(cart.getState().lines.length, 1)
})

test("another tab's account switch clears private caches and revalidates identity", async () => {
  api.setTokens("a-access", "a-refresh", "customer")
  auth.useCustomerSessionStore.getState().setUser(user(1))
  queryClient.setQueryData(["profile-me"], { private: "A" })
  storage.set("nexora_customer_access_token", "b-access")
  storage.set("nexora_customer_refresh_token", "b-refresh")
  globalThis.fetch = async () => response(user(2))
  listeners.get("storage")({ key: "nexora_customer_access_token" })
  assert.equal(queryClient.getQueryCache().getAll().length, 0)
  assert.equal(auth.useCustomerSessionStore.getState().hydrated, false)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(auth.useCustomerSessionStore.getState().user.id, 2)
  assert.equal(auth.useCustomerSessionStore.getState().hydrated, true)
})

test("same-account token rotation in another tab preserves the active checkout", () => {
  auth.useCustomerSessionStore.getState().setUser(user(1))
  const token = tokenFor(1)
  storage.set("nexora_customer_access_token", token)
  queryClient.setQueryData(["customer-addresses"], [{ private: "Account 1" }])
  const version = api.getSessionVersion("customer")
  listeners.get("storage")({ key: "nexora_customer_access_token" })
  assert.equal(auth.useCustomerSessionStore.getState().user.id, 1)
  assert.equal(api.getSessionVersion("customer"), version)
  assert.deepEqual(queryClient.getQueryData(["customer-addresses"]), [{ private: "Account 1" }])
})

test("account changes in storage are detected even before the storage event arrives", async () => {
  api.setTokens(tokenFor(1), "a-refresh", "customer")
  const task = deferred()
  globalThis.fetch = () => task.promise
  const pending = api.request("/customer/profile/", { area: "customer" })
  const rejection = assert.rejects(pending, api.SessionChangedError)
  storage.set("nexora_customer_access_token", tokenFor(2))
  storage.set("nexora_customer_refresh_token", "b-refresh")
  task.resolve(response(null, 401))
  await rejection
  assert.equal(api.getRefreshToken("customer"), "b-refresh")
})

test("a stale refresh failure cannot clear a newer same-account refresh from another tab", async () => {
  api.setTokens(tokenFor(1), "old-refresh", "customer")
  const refreshing = deferred()
  const started = deferred()
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/token/refresh/")) { started.resolve(); return refreshing.promise }
    return response(null, 401)
  }
  const pending = api.request("/customer/profile/", { area: "customer" })
  const rejection = assert.rejects(pending, api.SessionChangedError)
  await started.promise
  storage.set("nexora_customer_access_token", tokenFor(1, "renewed"))
  storage.set("nexora_customer_refresh_token", "new-refresh")
  refreshing.resolve(response(null, 401))
  await rejection
  assert.equal(api.getRefreshToken("customer"), "new-refresh")
})

for (const status of [200, 401]) {
  test(`a delayed ${status} upload cannot return data or clear the next session`, async () => {
    let xhr
    const previous = Object.getOwnPropertyDescriptor(globalThis, "XMLHttpRequest")
    Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: class {
      constructor() { xhr = this; this.upload = {} }
      open() {}
      setRequestHeader() {}
      send() {}
    } })
    try {
      api.setTokens("a-access", "a-refresh", "customer")
      const pending = api.uploadWithProgress("/customer/profile/avatar/", new FormData())
      const rejection = assert.rejects(pending, api.SessionChangedError)
      api.setTokens("b-access", "b-refresh", "customer")
      xhr.status = status
      xhr.responseText = JSON.stringify({ success: status === 200, data: { private: "A" } })
      await xhr.onload()
      await rejection
      assert.equal(api.getAccessToken("customer"), "b-access")
    } finally {
      if (previous) Object.defineProperty(globalThis, "XMLHttpRequest", previous)
      else delete globalThis.XMLHttpRequest
    }
  })
}

test("CSV exports neutralize spreadsheet formulas, including whitespace and headers", () => {
  for (const value of ["=1+1", "+1+1", "-1+1", "@SUM(1)", "  =1+1", "\tplain", "\rplain", "\nplain"]) {
    const csv = toCsv([{ value }])
    assert.ok(csv.includes(`'${value}`), JSON.stringify(value))
  }
  assert.equal(toCsv([{ "=header": "safe" }]), "'=header\nsafe")
  assert.equal(toCsv([{ amount: -12, name: 'A,"B"\rC' }]), 'amount,name\n-12,"A,""B""\rC"')
})

test("login and checkout redirects reject browser-normalized external URLs", () => {
  for (const path of ["//example.test/phish", "/\n/example.test/phish", "/\t/example.test/phish", "/\r/example.test/phish", "/\\example.test/phish", "https://example.test", "javascript:alert(1)", "/orders\u0000"]) {
    assert.equal(sanitizeRedirect(path, "/dashboard"), "/dashboard", JSON.stringify(path))
  }
  for (const path of ["/orders", "/checkout?step=address", "/orders?note=a b", "/orders?note=a%20b#details", "/purchaser/orders", "/admin/dashboard"]) {
    assert.equal(sanitizeRedirect(path, "/dashboard"), path)
    assert.equal(new URL(path, "https://gateway.example").origin, "https://gateway.example")
  }
})
