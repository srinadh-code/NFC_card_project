import assert from "node:assert/strict"
import { after, before, beforeEach, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { createServer } from "vite"
import { associateRecipientProducts, validateRecipients } from "../src/lib/checkout-recipients.ts"
import { safeNfcDestination } from "../src/lib/nfc-destination.ts"
import { safeProgrammingUrl } from "../src/lib/programming-url.ts"

let vite, api, auth, GoogleReview, CustomerSettings, CustomerSidebar, PurchaserSidebar, DigitalProductRoute, useEnsuredProfile, CopyLink, CardFormDialog, AccountActivation, AccountStatusBadge, EmailDeliveryBadge, OrderSuccess, sharedQueryClient
const originals = new Map()
const workspace = (patch = {}) => ({
  eligible: true, digital_access: false, business_name: "Real Business", google_review_url: "https://search.google.com/local/writereview?placeid=ChIJTest",
  cards: [], scan_url: null, qr_url: null, configured: true, stats: { taps: 3, qr_scans: 2, total: 5 }, ...patch,
})
const card = (patch = {}) => ({ id: 61, uid: "REVIEW-UID", serial_number: "REVIEW-SERIAL", card_type: "REVIEW", color: "White", status: "ASSIGNED", customer_name: "Owner", assigned_on: null, activated_on: null, purchase_date: null, notes: "", ...patch })

before(async () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) }
  for (const [key, value] of Object.entries({ localStorage: storage, sessionStorage: storage, window: { location: { pathname: "/google-review", origin: "http://localhost:5173" }, localStorage: storage, atob: globalThis.atob, btoa: globalThis.btoa }, navigator: { clipboard: { writeText: async () => {} } }, fetch: () => { throw new Error("Unexpected real request") } })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", plugins: [{
    name: "review-ui-test-boundaries", enforce: "pre",
    transform(code, id) {
      const path = id.replaceAll("\\", "/")
      if (path.endsWith("/pages/customer/GoogleReview.tsx")) return code.replace("useEffect, useState,", "useEffect, useState as actualUseState,") + `\nconst useState = initial => actualUseState(globalThis.__googleReviewDraft && initial === globalThis.__googleReviewDraft.saved ? globalThis.__googleReviewDraft.draft : initial);`
      if (path.endsWith("/CardFormDialog.tsx")) return code.replace('"@/components/ui/dialog"', '"virtual:review-card-dialog-test"')
      if (path.endsWith("/pages/customer/Settings.tsx")) return code.replace('"@/store/theme-store"', '"virtual:review-settings-theme-test"')
      if (path.endsWith("/pages/public/OrderSuccess.tsx")) return code.replace("import { useEffect }", "import { useEffect as actualUseEffect }") + `\nconst useEffect = (effect, dependencies) => globalThis.__orderSuccessEffects ? globalThis.__orderSuccessEffects.push(effect) : actualUseEffect(effect, dependencies);`
    },
    resolveId(id) {
      if (id === "virtual:review-card-dialog-test") return "\0review-card-dialog-test"
      if (id === "virtual:review-settings-theme-test") return "\0review-settings-theme-test"
    },
    load(id) {
      if (id === "\0review-card-dialog-test") return `import { createElement } from "react"; ${["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"].map((name) => `export const ${name} = ({ children }) => createElement("div", null, children);`).join("\n")}`
      if (id === "\0review-settings-theme-test") return 'export const useThemeStore = (selector = state => state) => selector({ mode: "light", setMode() {} });'
    },
  }] })
  api = await vite.ssrLoadModule("/src/lib/api.ts")
  auth = await vite.ssrLoadModule("/src/store/auth-store.ts")
  GoogleReview = (await vite.ssrLoadModule("/src/pages/customer/GoogleReview.tsx")).default
  CustomerSettings = (await vite.ssrLoadModule("/src/pages/customer/Settings.tsx")).default
  CustomerSidebar = (await vite.ssrLoadModule("/src/components/layout/CustomerSidebar.tsx")).CustomerSidebar
  DigitalProductRoute = (await vite.ssrLoadModule("/src/components/auth/DigitalProductRoute.tsx")).DigitalProductRoute
  useEnsuredProfile = (await vite.ssrLoadModule("/src/hooks/use-ensured-profile.ts")).useEnsuredProfile
  CopyLink = (await vite.ssrLoadModule("/src/components/common/CopyLink.tsx")).CopyLink
  CardFormDialog = (await vite.ssrLoadModule("/src/components/admin/CardFormDialog.tsx")).CardFormDialog
  PurchaserSidebar = (await vite.ssrLoadModule("/src/components/layout/PurchaserSidebar.tsx")).PurchaserSidebar
  AccountActivation = (await vite.ssrLoadModule("/src/pages/admin/AccountActivation.tsx")).default
  ;({ AccountStatusBadge, EmailDeliveryBadge } = await vite.ssrLoadModule("/src/components/admin/AccountStatusBadge.tsx"))
  OrderSuccess = (await vite.ssrLoadModule("/src/pages/public/OrderSuccess.tsx")).default
  sharedQueryClient = (await vite.ssrLoadModule("/src/lib/query-client.ts")).queryClient
})

after(async () => {
  await vite?.close()
  delete globalThis.__googleReviewDraft
  delete globalThis.__orderSuccessEffects
  sharedQueryClient?.clear()
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})

function signIn(id = 7, roles = ["RECIPIENT"]) {
  api.setTokens(`owner-${id}`, `refresh-${id}`, "customer")
  const user = { id, role: "CUSTOMER", roles, full_name: "Owner", email: "owner@example.com", phone: "", avatar: "" }
  auth.useCustomerSessionStore.setState({ user, hydrated: true })
  Object.assign(auth.useCustomerSessionStore.getInitialState(), { user, hydrated: true })
}
beforeEach(() => { signIn(); delete globalThis.__googleReviewDraft; delete globalThis.__orderSuccessEffects; sharedQueryClient.clear(); globalThis.fetch = () => { throw new Error("Unexpected real request") } })

function render(component, data, key = "7") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity }, mutations: { gcTime: 0 } } })
  if (data) client.setQueryData(["google-review", key], data)
  try {
    return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(component))))
  } finally { client.clear() }
}

test("mixed product units retain their product identity and allow one email in each allocation family", () => {
  const entries = [{ full_name: "Owner", email: " SAME@Example.com ", phone: "9876543210", card_type: "REVIEW", product_id: "tampered" }, { full_name: "Owner", email: "same@example.com", phone: "9876543210" }]
  const slots = associateRecipientProducts(entries, [{ productId: "custom", cardType: "Custom", qty: 1 }, { productId: "google-review", cardType: "Review", qty: 1 }])
  assert.deepEqual(slots.map(({ product_id, card_type }) => ({ product_id, card_type })), [{ product_id: "custom", card_type: "CUSTOM" }, { product_id: "google-review", card_type: "REVIEW" }])
  const result = validateRecipients(slots, 2, { indianMobilePhone: true })
  assert.equal(result.valid, true)
  assert.equal(result.recipients[0].email, "same@example.com")
  assert.equal(result.recipients[1].product_id, "google-review")
  for (const types of [["CUSTOM", "WOODEN"], ["REVIEW", "REVIEW"]]) {
    assert.equal(validateRecipients(slots.map((value, index) => ({ ...value, card_type: types[index] })), 2).valid, false)
  }
})

test("review-only workspace shows real settings, pending physical assignment and measured opens", () => {
  const html = render(GoogleReview, workspace())
  assert.match(html, /Real Business/)
  assert.match(html, /Google review URL/)
  assert.match(html, /physical card has not been assigned/)
  assert.match(html, /NFC taps/)
  assert.match(html, /QR scans/)
  assert.match(html, /do not measure submitted Google reviews/)
  assert.doesNotMatch(html, />PNG</)
  assert.doesNotMatch(html, /Profile Templates|Google Review Card Active/)
})

test("QR actions require an active assigned card and configured review destination", () => {
  const links = { scan_url: "http://localhost:5173/nfc/REVIEW-UID", qr_url: "http://localhost:5173/nfc/REVIEW-UID?source=qr" }
  const assigned = render(GoogleReview, workspace({ ...links, cards: [card()] }))
  assert.match(assigned, /Activate card/)
  assert.doesNotMatch(assigned, />PNG</)
  const active = render(GoogleReview, workspace({ ...links, cards: [card({ status: "ACTIVE" })] }))
  assert.match(active, />PNG</)
  assert.match(active, />SVG</)
  assert.match(active, />PDF</)
  assert.match(active, /nfc\/REVIEW-UID\?source=qr/)
  assert.doesNotMatch(active, /Activate card/)
  for (const status of ["BLOCKED", "LOST", "INACTIVE"]) assert.doesNotMatch(render(GoogleReview, workspace({ ...links, cards: [card({ status })] })), />PNG</)
  assert.doesNotMatch(render(GoogleReview, workspace({ ...links, configured: false, cards: [card({ status: "ACTIVE" })] })), />PNG</)
})

test("buyer-only access never exposes a recipient settings form or another account's cached workspace", () => {
  const html = render(GoogleReview, workspace({ eligible: false, business_name: "", google_review_url: "", configured: false }))
  assert.match(html, /no Google Review card allocation/)
  assert.doesNotMatch(html, /Save settings|Real Business/)
  signIn(8)
  assert.doesNotMatch(render(GoogleReview, workspace(), "7"), /Real Business|Save settings/)
})

test("review-only navigation hides digital tools while dual and legacy owners retain them", () => {
  const onlyReview = render(CustomerSidebar, workspace())
  assert.match(onlyReview, /href="\/google-review"/)
  for (const path of ["profile", "qr-code", "my-card", "services", "analytics"]) assert.doesNotMatch(onlyReview, new RegExp(`href="/${path}"`))
  const dual = render(CustomerSidebar, workspace({ digital_access: true }))
  assert.match(dual, /href="\/profile"/)
  assert.match(dual, /href="\/google-review"/)
  const legacy = render(CustomerSidebar, workspace({ eligible: false, digital_access: true }))
  assert.match(legacy, /href="\/profile"/)
  assert.doesNotMatch(legacy, /href="\/google-review"/)
})

test("review-only gate prevents digital page mounting and digital-profile fetching", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } } })
  client.setQueryData(["google-review", "7"], workspace())
  try {
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: ["/profile"] }, createElement(Routes, null, createElement(Route, { element: createElement(DigitalProductRoute) }, createElement(Route, { path: "/profile", element: createElement("p", null, "DIGITAL-PAGE-MOUNTED") }))))))
    assert.doesNotMatch(html, /DIGITAL-PAGE-MOUNTED/)
    function ProfileProbe() { const value = useEnsuredProfile(); return createElement("p", null, value.profile ? "HAS-PROFILE" : "NO-PROFILE") }
    const profile = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(ProfileProbe)))
    assert.match(profile, /NO-PROFILE/)
    assert.equal(client.getQueryCache().find({ queryKey: ["profile-me"] }).options.enabled, false)
  } finally { client.clear() }
})

test("Review-only and purchaser settings retain account identity and security without digital profile edits", () => {
  for (const roles of [["RECIPIENT"], ["PURCHASER", "RECIPIENT"], ["PURCHASER"]]) {
    signIn(7, roles)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } } })
    client.setQueryData(["google-review", "7"], workspace({ eligible: roles.includes("RECIPIENT") }))
    try {
      const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(CustomerSettings)))
      assert.match(html, /id="settings-name"[^>]*disabled=""[^>]*value="Owner"/)
      assert.match(html, /Change Password/)
      assert.match(html, /Preferences/)
      assert.doesNotMatch(html, /Save Changes|Privacy Settings|Make profile public/)
      assert.equal(client.getQueryCache().find({ queryKey: ["profile-me"], exact: true }).options.enabled, false)
      assert.equal(client.getQueryCache().find({ queryKey: ["profile-privacy"], exact: true }), undefined)
    } finally { client.clear() }
  }
})

test("digital and dual-product settings preserve profile controls and wait for the profile before saving", () => {
  for (const eligible of [false, true]) {
    const html = render(CustomerSettings, workspace({ eligible, digital_access: true }))
    assert.match(html, /Privacy Settings/)
    assert.match(html, /disabled=""[^>]*>Save Changes</)
    assert.match(html, /id="settings-name"[^>]*value="Owner"/)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } } })
    client.setQueryData(["google-review", "7"], workspace({ eligible, digital_access: true }))
    client.setQueryData(["profile-me"], { fullName: "Digital Owner" })
    try {
      const ready = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(CustomerSettings)))
      assert.match(ready, /Privacy Settings/)
      assert.doesNotMatch(ready, /disabled=""[^>]*>Save Changes</)
      assert.doesNotMatch(ready, /id="settings-name"[^>]*disabled=""/)
      assert.equal(client.getQueryCache().find({ queryKey: ["profile-me"], exact: true }).options.enabled, true)
    } finally { client.clear() }
  }
})

test("owner API saves through the existing authenticated endpoint and activation uses the assigned card endpoint", async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ success: true, data: String(url).includes("activate-assigned") ? card({ status: "ACTIVE" }) : workspace() }) }
  const data = await api.googleReviewApi.get()
  assert.equal(data.stats.total, 5)
  await api.googleReviewApi.update({ business_name: "Changed Business", google_review_url: "https://search.google.com/local/writereview?placeid=Other" })
  await api.nfcApi.activateAssigned("61")
  assert.match(calls[0].url, /\/customer\/google-review\/$/)
  assert.equal(calls[1].options.method, "PATCH")
  assert.equal(calls[1].options.headers.Authorization, "Bearer owner-7")
  assert.deepEqual(JSON.parse(calls[1].options.body), { business_name: "Changed Business", google_review_url: "https://search.google.com/local/writereview?placeid=Other" })
  assert.match(calls[2].url, /\/nfc\/cards\/61\/activate-assigned\/$/)
})

test("public NFC resolution passes QR source and cancellation without leaking a logged-in bearer", async () => {
  const calls = []
  const controller = new AbortController()
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ success: true, data: { redirect_url: "https://search.google.com/local/writereview?placeid=ChIJTest" } }) }
  await api.nfcApi.resolve("REVIEW/UID", "qr", controller.signal)
  assert.match(calls[0].url, /\/nfc\/cards\/REVIEW%2FUID\/\?source=qr$/)
  assert.equal(calls[0].options.signal, controller.signal)
  assert.equal(calls[0].options.headers.Authorization, undefined)
})

test("public NFC allows canonical Google reviews and local digital profiles while rejecting arbitrary redirects", () => {
  const origin = "http://localhost:5173"
  assert.equal(safeNfcDestination("/u/owner?src=nfc", origin), `${origin}/u/owner?src=nfc`)
  assert.equal(safeNfcDestination("https://search.google.com/local/writereview?placeid=ChIJTest", origin), "https://search.google.com/local/writereview?placeid=ChIJTest")
  const official = "https://www.google.com/maps/place//data=!4m3!3m2!1s0x808f778c55555555:0xa4f25c571acded3f!12e1"
  assert.equal(safeNfcDestination(official, origin), official)
  assert.equal(safeNfcDestination("https://www.google.com/maps/place//data=!4m3!3m2!1s18446744073709551616!12e1", origin), null)
  const mapsReview = "https://www.google.com/maps/place//data=!4m3!3m2!1s0x808f778c55555555:0xa4f25c571acded3f!12e1"
  assert.equal(safeNfcDestination(mapsReview, origin), mapsReview)
  assert.equal(safeNfcDestination(mapsReview + "?source=tracking", origin), mapsReview)
  assert.equal(safeNfcDestination("https://search.google.com/local/writereview?placeid=ChIJTest&continue=https://evil.example", origin), "https://search.google.com/local/writereview?placeid=ChIJTest")
  for (const value of [mapsReview.replace("!12e1", "!9m1!1b1"), mapsReview + "!1shttps://evil.example", mapsReview.replace("www.google.com", "www.google.com.evil.example"), "https://search.google.com/local/writereview?placeid=x&placeid=y", "https://search.google.com/local/writereview?placeid=%2F%2Fevil.example"]) assert.equal(safeNfcDestination(value, origin), null, value)
  for (const value of ["javascript:alert(1)", "//evil.example/u/owner", "https://evil.example/", "https://search.google.com.evil.example/local/writereview?placeid=x", "https://search.google.com/url?q=https://evil.example", "http://search.google.com/local/writereview?placeid=x", "https://owner@search.google.com/local/writereview?placeid=x", "/\\evil.example", "/u/owner\n", "https://search.google.com/local/writereview"]) assert.equal(safeNfcDestination(value, origin), null, value)
})

test("paid-slot picker and inventory assignment preserve the purchased card type and recipient id", async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ success: true, data: String(url).includes("assignment-customers") ? [{ id: 7, name: "Owner", email: " OWNER@example.com ", recipient_id: 29, order_id: 12, card_type: "REVIEW" }] : card(), pagination: { count: 1 } }) }
  const result = await api.adminNfcApi.assignmentCustomers({ cardType: "Review" })
  assert.match(calls[0].url, /card_type=REVIEW/)
  assert.equal(result.data[0].recipientId, 29)
  assert.equal(result.data[0].email, "owner@example.com")
  await api.adminNfcApi.create({ cardType: "Review", customerEmail: "owner@example.com", recipientId: 29 })
  await api.adminNfcApi.assign("61", "owner@example.com", 29)
  assert.deepEqual(JSON.parse(calls[1].options.body), { card_type: "REVIEW", customer_email: "owner@example.com", recipient_id: 29 })
  assert.deepEqual(JSON.parse(calls[2].options.body), { email: "owner@example.com", recipient_id: 29 })
})

test("saved destination stays clickable independently of an unsaved review URL draft", () => {
  const saved = workspace().google_review_url
  const draft = "https://search.google.com/local/writereview?placeid=UnsavedBusiness"
  globalThis.__googleReviewDraft = { saved, draft }
  const html = render(GoogleReview, workspace())
  assert.ok(html.includes(`value="${draft}"`))
  assert.ok(html.includes(`href="${saved}"`))
  assert.ok(!html.includes(`href="${draft}"`))
  assert.match(html, /Saved Google review destination/)
  assert.match(html, /Copy destination/)
})

test("unsafe legacy destinations are editable text without a clickable or copyable saved link", () => {
  for (const value of ["javascript:alert(1)", "https://example.com/review", "/u/somebody"]) {
    const html = render(GoogleReview, workspace({ google_review_url: value }))
    assert.ok(!html.includes(`href="${value}"`), value)
    assert.doesNotMatch(html, /Copy destination/)
    assert.match(html, /Save a valid Google review link/)
  }
})

test("assigned review card exposes its stable MyNFC programming URL before setup and activation", () => {
  const programming = "http://localhost:5173/nfc/REVIEW-UID"
  const assigned = card({ programming_url: programming })
  const pending = render(GoogleReview, workspace({ configured: false, google_review_url: "", scan_url: programming, qr_url: `${programming}?source=qr`, cards: [assigned] }))
  assert.ok(pending.includes(`href="${programming}"`))
  assert.match(pending, /Copy NFC URL/)
  assert.match(pending, /In MyNFC, write a URL record/)
  assert.match(pending, /Activate card/)
  assert.doesNotMatch(pending, />PNG</)
  const changed = render(GoogleReview, workspace({ google_review_url: "https://search.google.com/local/writereview?placeid=Changed", scan_url: programming, cards: [assigned] }))
  assert.ok(changed.includes(`href="${programming}"`))
  assert.doesNotMatch(changed, /href="http:\/\/localhost:5173\/nfc\/REVIEW-UID\?source=qr"/)
})

test("existing admin Review card details show programming instructions without changing digital card details", () => {
  const programming = "https://cards.example/nfc/REVIEW-UID"
  const base = { id: "61", uid: "REVIEW-UID", serialNumber: "SERIAL", cardType: "Review", color: "White", customerId: "7", customerName: "Owner", status: "Assigned", assignedOn: null, activatedOn: null, purchaseDate: "", programmingUrl: programming }
  const details = (value) => render(() => createElement(CardFormDialog, { open: true, onOpenChange() {}, card: value, onSubmit() {} }))
  const html = details(base)
  assert.ok(html.includes(`href="${programming}"`))
  assert.match(html, /NFC programming URL/)
  assert.match(html, /Copy NFC URL/)
  assert.doesNotMatch(details({ ...base, cardType: "Custom" }), /NFC programming URL/)
  assert.doesNotMatch(details({ ...base, customerId: null, status: "Unassigned" }), /NFC programming URL/)
})

test("historical duplicate cards never borrow another card's programming URL", () => {
  const programming = "https://cards.example/nfc/SECOND-CARD"
  const html = render(GoogleReview, workspace({ configured: false, scan_url: programming, cards: [card({ programming_url: null }), card({ id: 62, uid: "SECOND-CARD", programming_url: programming })] }))
  assert.equal(html.split(`href="${programming}"`).length - 1, 1)
})

test("copy controls write exactly the saved destination or programming URL and handle denied clipboard access", async () => {
  const copied = []
  navigator.clipboard.writeText = async (value) => { copied.push(value) }
  for (const [url, label] of [[workspace().google_review_url, "Saved Google review destination"], ["http://localhost:5173/nfc/REVIEW-UID", "NFC programming URL"]]) {
    const element = CopyLink({ url, label })
    const button = element.props.children.find((child) => typeof child?.props?.onClick === "function")
    await button.props.onClick()
  }
  assert.deepEqual(copied, [workspace().google_review_url, "http://localhost:5173/nfc/REVIEW-UID"])
  navigator.clipboard.writeText = async () => { throw new Error("Clipboard denied") }
  const element = CopyLink({ url: "https://cards.example/nfc/UID", label: "NFC programming URL" })
  await assert.doesNotReject(element.props.children.find((child) => typeof child?.props?.onClick === "function").props.onClick())
})

test("owner and admin inventory mapping preserve the server programming URL", async () => {
  const programming = "https://cards.example/nfc/REVIEW-UID"
  globalThis.fetch = async () => Response.json({ success: true, data: [card({ programming_url: programming, customer_id: 7, customer_email: "owner@example.com" })], pagination: { count: 1 } })
  const mine = await api.nfcApi.mine()
  const inventory = await api.adminNfcApi.list({})
  assert.equal(mine[0].programmingUrl, programming)
  assert.equal(inventory.data[0].programmingUrl, programming)
  assert.equal(inventory.data[0].status, "Assigned")
  assert.equal(inventory.data[0].cardType, "Review")
})

test("programming URL display accepts server NFC URLs and rejects executable or malformed links", () => {
  for (const url of ["http://localhost:5173/nfc/UID", "https://cards.example/nfc/UID%2Fquoted"]) assert.equal(safeProgrammingUrl(url), url)
  for (const url of [null, undefined, "", "javascript:alert(1)", "http://external.example/nfc/UID", "https://owner@cards.example/nfc/UID", "https://cards.example/u/owner", "https://cards.example/nfc/UID?source=qr", "https://cards.example/nfc/UID#fragment"]) assert.equal(safeProgrammingUrl(url), null)
})

test("purchaser and recipient dashboard switches follow server roles without exposing another recipient's tools", () => {
  signIn(7, ["PURCHASER"])
  const buyerOnly = render(PurchaserSidebar, workspace({ eligible: false, digital_access: false }))
  assert.match(buyerOnly, /My Orders/)
  assert.doesNotMatch(buyerOnly, /Switch to Customer Dashboard|href="\/google-review"/)
  signIn(7, ["PURCHASER", "RECIPIENT"])
  const recipient = render(CustomerSidebar, workspace())
  assert.match(recipient, /Switch to Purchaser Dashboard/)
  assert.match(recipient, /href="\/google-review"/)
  assert.doesNotMatch(recipient, /href="\/profile"/)
  const purchaser = render(PurchaserSidebar, workspace())
  assert.match(purchaser, /Switch to Customer Dashboard/)
  assert.match(purchaser, /href="\/dashboard"/)
  const dual = render(CustomerSidebar, workspace({ digital_access: true }))
  assert.match(dual, /href="\/profile"/)
  assert.match(dual, /href="\/google-review"/)
  assert.match(dual, /Switch to Purchaser Dashboard/)
})

test("order success refreshes signed-in roles and only that purchaser's order and product caches", (context) => {
  const previousRefresh = auth.useCustomerSessionStore.getState().refresh
  let refreshes = 0
  auth.useCustomerSessionStore.setState({ refresh: async () => { refreshes += 1 } })
  context.after(() => { auth.useCustomerSessionStore.setState({ refresh: previousRefresh }); delete globalThis.__orderSuccessEffects })
  for (const key of [["customer-orders", "7", 1], ["google-review", "7"], ["customer-orders", "8", 1]]) sharedQueryClient.setQueryData(key, { existing: true })
  globalThis.__orderSuccessEffects = []
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [{ pathname: "/order-success", state: { orderId: "500" } }] }, createElement(OrderSuccess)))
  for (const effect of globalThis.__orderSuccessEffects) effect()
  assert.equal(refreshes, 1)
  assert.equal(sharedQueryClient.getQueryState(["customer-orders", "7", 1]).isInvalidated, true)
  assert.equal(sharedQueryClient.getQueryState(["google-review", "7"]).isInvalidated, true)
  assert.equal(sharedQueryClient.getQueryState(["customer-orders", "8", 1]).isInvalidated, false)
  auth.useCustomerSessionStore.setState({ user: null })
  for (const effect of globalThis.__orderSuccessEffects) effect()
  assert.equal(refreshes, 1, "Guest success does not invent a signed-in session")
})

test("account and transport badges distinguish queued, accepted, failed and unknown outcomes without claiming delivery", () => {
  const queued = renderToStaticMarkup(createElement(AccountStatusBadge, { status: "EMAIL_QUEUED" }))
  const accepted = renderToStaticMarkup(createElement(AccountStatusBadge, { status: "EMAIL_SENT" }))
  assert.match(queued, /Email queued/)
  assert.match(accepted, /delivery unverified/)
  assert.doesNotMatch(accepted, /Activation Email Sent|Delivered/)
  for (const [status, expected] of [["NOT_QUEUED", "Email not queued"], ["QUEUED", "Email queued"], ["ACCEPTED", "Accepted by email service; delivery unverified"], ["FAILED", "Email failed"], ["BOUNCED", "Email bounced"], ["UNVERIFIED", "Outcome unverified"]]) {
    const html = renderToStaticMarkup(createElement(EmailDeliveryBadge, { status }))
    assert.ok(html.includes(expected))
    assert.doesNotMatch(html, /Delivered/)
  }
})

test("admin account list displays transport acceptance and queued outcomes without a sent or delivered claim", () => {
  const base = { customer_id: 7, customer_name: "Owner", customer_email: "owner@example.com", customer_phone: "9876543210", email_verified_by_otp: true, phone_verified_by_otp: false, order_id: 500, order_number: "ORDER-500", order_status: "PROCESSING", account_created_at: "2026-11-15T10:00:00Z", account_status_display: "", password_set_at: null, email_attempts: 1, email_last_error: "", email_sent_at: "2026-11-15T10:01:00Z", credentials_issued_at: "2026-11-15T10:00:00Z", email_delivery_verified: false }
  const rows = [{ ...base, id: 1, account_status: "EMAIL_QUEUED", email_status: "PENDING", email_delivery_status: "QUEUED" }, { ...base, id: 2, account_status: "EMAIL_SENT", email_status: "SENT", email_delivery_status: "ACCEPTED" }, { ...base, id: 3, account_status: "EMAIL_QUEUED", email_status: "PENDING", email_delivery_status: "UNVERIFIED" }]
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } } })
  client.setQueryData(["admin-onboarding", 1, "", "ALL", "ALL"], { items: rows, pagination: { count: rows.length, num_pages: 1 } })
  try {
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(AccountActivation))))
    assert.match(html, /Email queued/)
    assert.match(html, /Accepted by email service; delivery unverified/)
    assert.match(html, /Outcome unverified/)
    assert.doesNotMatch(html, /Activation Email Sent|>Email Sent<|Delivered/)
  } finally { client.clear() }
})

test("order adapters retain per-recipient and purchaser email outcomes instead of treating queued work as sent", () => {
  const raw = { id: 500, order_number: "ORDER-500", customer_id: 7, customer_name: "Owner", customer_email: "owner@example.com", customer_phone: "9876543210", items: [], amount: "100.00", shipping: "0.00", total: "100.00", payment_method: "DUMMY", payment_status: "PAID", status: "PROCESSING", placed_at: "2026-11-15T10:00:00Z", address: { line1: "Address", city: "City", state: "State", pincode: "500001", country: "India" }, tracking: [], assigned_card_id: null, recipients: [{ id: 29, name: "Recipient", email: "recipient@example.com", card_type: "REVIEW", account_status: "EMAIL_QUEUED", email_delivery_status: "UNVERIFIED", email_delivery_status_display: "Outcome unverified", email_delivery_verified: false }], account: { status: "EMAIL_QUEUED", status_display: "Email queued", onboarding_id: 3, created_from_order: true, email_delivery_status: "QUEUED", email_delivery_status_display: "Email queued", email_delivery_verified: false } }
  const result = api.toFrontendOrder(raw)
  assert.equal(result.account.status, "EMAIL_QUEUED")
  assert.equal(result.account.emailDeliveryStatus, "QUEUED")
  assert.equal(result.account.emailDeliveryVerified, false)
  assert.equal(result.recipients[0].emailDeliveryStatus, "UNVERIFIED")
  assert.equal(result.recipients[0].emailDeliveryVerified, false)
})
