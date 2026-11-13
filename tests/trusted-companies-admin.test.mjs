import assert from "node:assert/strict"
import { after, before, beforeEach, test } from "node:test"
import { fileURLToPath } from "node:url"
import { QueryClient } from "@tanstack/react-query"
import { createServer } from "vite"

let vite, managementApi, api, queryClient
const originalFetch = globalThis.fetch
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")

before(async () => {
  const storage = new Map()
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  } })
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/admin/content" } } })
  vite = await createServer({
    configFile: false, appType: "custom", server: { middlewareMode: true, hmr: false },
    ssr: { external: ["@tanstack/react-query"] }, optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  })
  managementApi = (await vite.ssrLoadModule("/src/lib/trusted-companies-admin.ts")).trustedCompaniesAdminApi
  api = await vite.ssrLoadModule("/src/lib/api.ts")
})

beforeEach(() => {
  api.setTokens("fixture-admin", "fixture-refresh", "admin")
  queryClient?.clear()
  queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: 0, retry: false } } })
  queryClient.setQueryData(["content", "public-home"], { companies: [] })
  queryClient.setQueryData(["content", "public-companies"], [])
  queryClient.setQueryData(["content", "public-features"], [])
})

after(async () => {
  await vite?.close()
  queryClient?.clear()
  globalThis.fetch = originalFetch
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage)
  else delete globalThis.localStorage
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
  else delete globalThis.window
})

test("every company mutation invalidates Home data without an extra public request", async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ path: new URL(url).pathname, method: options.method, body: options.body === undefined ? undefined : JSON.parse(options.body) })
    return new Response(JSON.stringify({ success: true, data: { id: 7, name: "Fixture Team", display_order: 3, is_active: false } }), { status: 200 })
  }
  const actions = [
    ["POST", "/companies/", (cms) => cms.create({ name: "Fixture Team", display_order: 3, is_active: false })],
    ["PATCH", "/companies/7/", (cms) => cms.update(7, { name: "Updated Fixture" })],
    ["PATCH", "/companies/7/", (cms) => cms.update(7, { is_active: false })],
    ["DELETE", "/companies/7/", (cms) => cms.remove(7)],
    ["PATCH", "/companies/reorder/", (cms) => cms.reorder([7, 8])],
  ]
  for (const [method, suffix, run] of actions) {
    queryClient.setQueryData(["content", "public-home"], { companies: [] })
    queryClient.setQueryData(["content", "public-companies"], [])
    const previousCalls = calls.length
    await run(managementApi(queryClient))
    assert.equal(calls.length, previousCalls + 1)
    assert.equal(calls.at(-1).method, method)
    assert.ok(calls.at(-1).path.endsWith(suffix))
    assert.equal(queryClient.getQueryState(["content", "public-home"]).isInvalidated, true)
    assert.equal(queryClient.getQueryState(["content", "public-companies"]).isInvalidated, true)
    assert.equal(queryClient.getQueryState(["content", "public-features"]).isInvalidated, false)
  }
})

test("rejected company mutation leaves public cache untouched", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: "Admin access required." }), { status: 403 })
  await assert.rejects(managementApi(queryClient).update(7, { is_active: true }), /Admin access required/)
  assert.equal(queryClient.getQueryState(["content", "public-home"]).isInvalidated, false)
})
