import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { createServer } from "vite"

let vite
let SetPassword
let OrderSuccess
let Login
let authApi
let ApiError
const originals = new Map()
const originalFetch = globalThis.fetch
const storage = new Map()

before(async () => {
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  }
  for (const [key, value] of Object.entries({
    localStorage,
    sessionStorage: localStorage,
    window: { location: { pathname: "/set-password" }, localStorage },
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  }
  // Even when a browser retains an access token, setup/recovery requests
  // must remain public and must not send that token to establish identity.
  storage.set("nexora_customer_access_token", "stale-access-token")
  vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    ssr: { external: true },
    optimizeDeps: { noDiscovery: true, include: [] },
    define: { "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify("") },
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    plugins: [{
      name: "purchaser-setup-test-auth",
      enforce: "pre",
      resolveId(id) {
        if (id.replaceAll("\\", "/").match(/\/store\/auth-store(?:\.ts)?$/)) return "\0purchaser-setup-test-auth"
      },
      load(id) {
        if (id === "\0purchaser-setup-test-auth") {
          return "export const useCustomerAuthStore = (selector) => selector({ customer: null, login: async () => ({ success: false }), googleLogin: async () => ({ success: false }) });"
        }
      },
    }],
  })
  const api = await vite.ssrLoadModule("/src/lib/api.ts")
  authApi = api.authApi
  ApiError = api.ApiError
  SetPassword = (await vite.ssrLoadModule("/src/pages/SetPassword.tsx")).default
  OrderSuccess = (await vite.ssrLoadModule("/src/pages/public/OrderSuccess.tsx")).default
  Login = (await vite.ssrLoadModule("/src/pages/Login.tsx")).default
})

after(async () => {
  await vite?.close()
  globalThis.fetch = originalFetch
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})

function render(Page, path, { key, data, error, state } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } })
  try {
    if (key && data) client.setQueryData(key, data)
    if (key && error) client.getQueryCache().build(client, { queryKey: key }).setState({ status: "error", error, fetchStatus: "idle" })
    return renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(MemoryRouter, { initialEntries: [{ pathname: path.split("?")[0], search: path.includes("?") ? `?${path.split("?")[1]}` : "", state }] },
        createElement(Page),
      ),
    ))
  } finally {
    client.clear()
  }
}

test("purchaser recovery without a token requests email ownership proof instead of accepting a password", () => {
  const html = render(SetPassword, "/set-password?purpose=purchaser")
  assert.ok(html.includes("Set Up Your Purchaser Account"))
  assert.ok(html.includes('id="purchaser-setup-email"'))
  assert.ok(html.includes('type="email"'))
  assert.ok(html.includes("Email My Setup Link"))
  assert.ok(html.includes("already paid") || html.includes("Already paid"))
  assert.ok(!html.includes('type="password"'))
  assert.ok(html.includes('href="/login?redirect=%2Forders"'))
})

for (const purpose of ["purchaser", "recipient"]) {
  test(`${purpose} links select their own token check and preserve both password visibility controls`, () => {
    const html = render(SetPassword, `/set-password?token=setup-link&purpose=${purpose}`, {
      key: ["activation-check", purpose, "setup-link"],
      data: { email: "purchaser@example.com", username: "recipient.username", full_name: "Srinadh", purpose },
    })
    assert.equal((html.match(/type="password"/g) ?? []).length, 2)
    assert.equal((html.match(/aria-label="Show password"/g) ?? []).length, 2)
    assert.ok(html.includes("purchaser@example.com"))
    if (purpose === "purchaser") {
      assert.ok(html.includes("view your purchases in My Orders"))
      assert.ok(!html.includes("Username:"))
      assert.ok(!html.includes("recipient.username"))
      assert.ok(html.includes("Create Password"))
    } else {
      assert.ok(html.includes("Username:"))
      assert.ok(html.includes("recipient.username"))
      assert.ok(html.includes("Set Password &amp; Activate"))
    }
  })
}

test("legacy recipient setup URLs without a purpose retain the existing activation form", () => {
  const html = render(SetPassword, "/set-password?token=legacy-link", {
    key: ["activation-check", "recipient", "legacy-link"],
    data: { email: "recipient@example.com", username: "existing.username", full_name: "Recipient", purpose: "recipient" },
  })
  assert.ok(html.includes("existing.username"))
  assert.ok(html.includes("Set Password &amp; Activate"))
})

for (const message of ["This setup link has expired.", "This setup link was already used.", "This setup link is invalid."]) {
  test(`purchaser link failure offers secure recovery: ${message}`, () => {
    const html = render(SetPassword, "/set-password?token=expired-link&purpose=purchaser", {
      key: ["activation-check", "purchaser", "expired-link"],
      error: new ApiError(message, 400),
    })
    assert.ok(html.includes("Link not valid"))
    assert.ok(html.includes(message))
    assert.ok(html.includes('href="/set-password?purpose=purchaser"'))
    assert.ok(html.includes("Request a new purchaser setup link"))
    assert.ok(!html.includes('type="password"'))
  })
}

test("setup API checks and completion send explicit purposes without a stale login token", async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), ...options, body: JSON.parse(options.body) })
    return Response.json({ success: true, data: { email: "purchaser@example.com", username: "", purpose: "purchaser" } })
  }
  try {
    await authApi.checkActivation("setup-link", "purchaser")
    await authApi.completeActivation({ token: "setup-link", new_password: "SafePassword@123", confirm_password: "SafePassword@123", purpose: "purchaser" })
    await authApi.checkActivation("recipient-link")
    assert.deepEqual(calls[0].body, { token: "setup-link", purpose: "purchaser" })
    assert.equal(calls[1].body.purpose, "purchaser")
    assert.equal(calls[1].body.token, "setup-link")
    assert.equal(calls[2].body.purpose, "recipient")
    assert.ok(calls[0].url.endsWith("/auth/activation/check/"))
    assert.ok(calls[1].url.endsWith("/auth/activation/complete/"))
    for (const call of calls) {
      assert.equal(call.method, "POST")
      assert.equal(call.headers.Authorization, undefined)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("purchaser recovery API normalizes email and requests a link without authenticating", async () => {
  let call
  globalThis.fetch = async (url, options) => {
    call = { url: String(url), ...options, body: JSON.parse(options.body) }
    return Response.json({ success: true, data: null })
  }
  try {
    await authApi.requestPurchaserSetup("  Srinadh@Example.COM  ")
    assert.ok(call.url.endsWith("/auth/purchaser-setup/request/"))
    assert.equal(call.method, "POST")
    assert.deepEqual(call.body, { email: "srinadh@example.com" })
    assert.equal(call.headers.Authorization, undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
})

const success = { orderId: "42", orderNumber: "VR-ORDER-42", trackingToken: "order-tracking", email: "purchaser@example.com" }
for (const status of ["required", "recipient", "active", undefined]) {
  test(`order success explains ${status ?? "legacy"} setup state without losing order actions`, () => {
    const html = render(OrderSuccess, "/order-success", { state: { ...success, purchaserSetup: status } })
    assert.ok(html.includes("VR-ORDER-42"))
    assert.ok(html.includes("My Orders"))
    assert.ok(html.includes("Track Your Order"))
    assert.ok(html.includes("Continue Shopping"))
    assert.ok(html.includes("order confirmation and tracking details"))
    assert.ok(!html.includes("You will receive a confirmation email with instructions to activate"))
    if (status === "required") {
      assert.ok(html.includes("separate purchaser account setup link"))
      assert.ok(html.includes("Need another purchaser setup link?"))
      assert.ok(!html.includes("You are also a card recipient"))
    } else if (status === "recipient") {
      assert.ok(html.includes("You are also a card recipient"))
      assert.ok(html.includes("when your order is processed"))
      assert.ok(!html.includes("separate purchaser account setup link"))
    } else if (status === "active") {
      assert.ok(html.includes("Your existing login is ready to use"))
      assert.ok(!html.includes("setup link"))
    } else {
      assert.ok(!html.includes("setup link"))
      assert.ok(!html.includes("account-ready email will arrive"))
    }
  })
}

test("login retains its password visibility eye control and offers purchaser account recovery", () => {
  const html = render(Login, "/login?redirect=%2Forders")
  assert.ok(html.includes('type="password"'))
  assert.ok(html.includes('aria-label="Show password"'))
  assert.ok(html.includes('href="/set-password?purpose=purchaser"'))
  assert.ok(html.includes("Request your account setup link"))
})
