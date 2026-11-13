import assert from "node:assert/strict"
import { after, afterEach, before, beforeEach, test } from "node:test"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

let vite, GuestCheckout, api, navigatorDescriptor, originalFetch
const harnesses = new Set()
const toasts = []
const detected = {
  latitude: 17.385, longitude: 78.4867, address_line1: "12, Abids Road", address_line2: "Abids",
  landmark: "City Library", locality: "Moazzampura", city: "Hyderabad", district: "Hyderabad",
  state: "Telangana", pincode: "500001", country: "India", display_name: "Abids Road, Hyderabad",
}
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { resolve, promise } }
const position = (accuracy = 20) => ({ coords: { latitude: detected.latitude, longitude: detected.longitude, accuracy }, timestamp: Date.now() })

before(async () => {
  navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator")
  originalFetch = globalThis.fetch
  vite = await createServer({
    configFile: false, appType: "custom", server: { middlewareMode: true, hmr: false },
    ssr: { external: true }, optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    plugins: [{
      name: "checkout-location-component-fixture", enforce: "pre",
      resolveId(id) { if (id.startsWith("location-test-")) return `\0${id}` },
      load(id) {
        if (id === "\0location-test-hooks") return "export const useState=(...a)=>globalThis.__locationHooks.useState(...a);export const useRef=(...a)=>globalThis.__locationHooks.useRef(...a);export const useEffect=(...a)=>globalThis.__locationHooks.useEffect(...a);"
        if (id === "\0location-test-router") return "export const Link=()=>null;export const Navigate=()=>null;export const useNavigate=()=>()=>{throw Error('Unexpected navigation')};"
        if (id === "\0location-test-query") return "export const useQuery=({queryKey})=>({data:queryKey[0]==='payments-config'?{enabled:true,dummy_enabled:false}:undefined,isLoading:false,isFetching:false,isError:false});export const useQueryClient=()=>({fetchQuery:()=>Promise.reject(Error('No PIN provider in location fixture')),invalidateQueries(){}});"
        if (id === "\0location-test-toast") return "export const toast={success:(m)=>globalThis.__locationToast('success',m),error:(m)=>globalThis.__locationToast('error',m)};"
        if (id === "\0location-test-cart") return "export const useCart=()=>({lines:[],clearCart(){throw Error('Unexpected cart mutation')}});"
        if (id === "\0location-test-settings") return "export const usePublicSettings=()=>({settings:{currency:'INR',site_name:'Fixture'}});"
        if (id === "\0location-test-availability") return "export const useRecipientEmailAvailability=()=>({statuses:[],allAvailable:true,retry(){}});"
        if (id === "\0location-test-verification") return "export const isFresh=()=>true;export const useCheckoutVerificationStore=()=>globalThis.__locationVerification;"
        if (id === "\0location-test-success") return "export const storeOrderSuccess=()=>{throw Error('Unexpected order completion')};"
        if (id === "\0location-test-payment") return "export class PaymentCancelled extends Error{};export class PaymentFailed extends Error{};export const payWithRazorpay=()=>{throw Error('Unexpected payment')};"
      },
      transform(code, id) {
        if (!id.replaceAll("\\", "/").endsWith("/components/checkout/GuestCheckout.tsx")) return
        const imports = {
          react: "location-test-hooks", "react-router-dom": "location-test-router", "@tanstack/react-query": "location-test-query",
          sonner: "location-test-toast", "@/hooks/useCart": "location-test-cart", "@/hooks/usePublicSettings": "location-test-settings",
          "@/hooks/useRecipientEmailAvailability": "location-test-availability", "@/store/checkout-verification-store": "location-test-verification",
          "@/pages/public/OrderSuccess": "location-test-success", "@/lib/razorpay": "location-test-payment",
        }
        for (const [source, replacement] of Object.entries(imports)) code = code.replace(`from "${source}"`, `from "${replacement}"`)
        return code
      },
    }],
  })
  api = await vite.ssrLoadModule("/src/lib/api.ts")
  GuestCheckout = (await vite.ssrLoadModule("/src/components/checkout/GuestCheckout.tsx")).GuestCheckout
})

beforeEach(() => {
  toasts.length = 0
  globalThis.__locationToast = (tone, message) => toasts.push({ tone, message })
  globalThis.__locationVerification = {
    sessionRef: "location-fixture", contact: { channel: "EMAIL", destination: "owner@example.com", token: "fixture-proof" },
    email: { channel: "EMAIL", destination: "owner@example.com", token: "fixture-proof" }, recipients: [],
    setEmail() { throw new Error("Unexpected verification change") }, setRecipients() {}, clearVerification() { throw new Error("Unexpected verification reset") },
  }
  api.customerAddressApi.reverseGeocode = () => { throw new Error("Unexpected reverse geocoding") }
  globalThis.fetch = () => { throw new Error("Network access is forbidden in location UI tests") }
})

afterEach(() => { for (const ui of harnesses) ui.dispose(); harnesses.clear() })
after(async () => {
  await vite?.close()
  globalThis.fetch = originalFetch
  if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor)
  else delete globalThis.navigator
  delete globalThis.__locationHooks; delete globalThis.__locationToast; delete globalThis.__locationVerification
})

function geolocation(result) {
  const geo = { getCurrentPosition(success, failure, options) { geo.options = options; result(success, failure) } }
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation: geo } })
  return geo
}
function descendants(node) {
  if (Array.isArray(node)) return node.flatMap(descendants)
  return node && typeof node === "object" && node.props ? [node, ...descendants(node.props.children)] : []
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join("")
  if (node == null || typeof node === "boolean") return ""
  return typeof node === "object" ? text(node.props?.children) : String(node)
}

// Call actual GuestCheckout handlers through state/effect transitions while
// unrelated account, cart, query and payment integrations stay offline.
function guest() {
  const slots = []
  let cursor, pendingEffects, dirty, tree, updates = 0
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial
      return [slots[index], (value) => { updates++; const next = typeof value === "function" ? value(slots[index]) : value; if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true } }]
    },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index] },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index]
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[index] = { deps, cleanup: previous?.cleanup }
        pendingEffects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect() })
      }
    },
  }
  const ui = {
    render() {
      for (let attempt = 0; attempt < 10; attempt++) {
        cursor = 0; pendingEffects = []; dirty = false; globalThis.__locationHooks = hooks
        tree = GuestCheckout(); pendingEffects.forEach((effect) => effect())
        if (!dirty) return
      }
      throw new Error("Unexpected location fixture render loop")
    },
    find(predicate) { return descendants(tree).find(predicate) },
    input(id) { return ui.find((node) => node.props.id === id && "value" in node.props) },
    change(id, value) { ui.input(id).props.onChange({ target: { value } }); ui.render() },
    state() { return ui.find((node) => typeof node.props.onValueChange === "function") },
    button() { return ui.find((node) => typeof node.props.onClick === "function" && /Use Current Location|Detecting Location/.test(text(node))) },
    alert() { return ui.find((node) => node.props.role === "alert") },
    updates() { return updates },
    dispose() { slots.forEach((slot) => slot?.cleanup?.()) },
  }
  harnesses.add(ui); ui.render(); return ui
}

test("accurate current location fills the actual guest form with a fresh high-accuracy request", async () => {
  const geo = geolocation((success) => success(position())), calls = []
  api.customerAddressApi.reverseGeocode = async (...args) => { calls.push(args); return detected }
  const ui = guest()
  await ui.button().props.onClick(); ui.render()
  assert.deepEqual(geo.options, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  assert.deepEqual(calls, [[detected.latitude, detected.longitude]])
  for (const [id, key] of [["g-line1", "address_line1"], ["g-line2", "address_line2"], ["g-locality", "locality"], ["g-city", "city"], ["g-district", "district"], ["g-pincode", "pincode"]]) assert.equal(ui.input(id).props.value, detected[key])
  assert.equal(ui.state().props.value, detected.state)
  assert.equal(ui.button().props.disabled, false)
  assert.equal(toasts.filter((toast) => toast.tone === "success").length, 1)
})

test("existing manual house, city, district and state survive successful autofill", async () => {
  geolocation((success) => success(position()))
  api.customerAddressApi.reverseGeocode = async () => detected
  const ui = guest()
  ui.change("g-line1", "Flat 9, My Building"); ui.change("g-city", "Manual City"); ui.change("g-district", "Manual District")
  ui.state().props.onValueChange("Andhra Pradesh"); ui.render()
  await ui.button().props.onClick(); ui.render()
  assert.equal(ui.input("g-line1").props.value, "Flat 9, My Building")
  assert.equal(ui.input("g-city").props.value, "Manual City")
  assert.equal(ui.input("g-district").props.value, "Manual District")
  assert.equal(ui.state().props.value, "Andhra Pradesh")
  assert.equal(ui.input("g-locality").props.value, detected.locality)
})

test("manual edits and an intentionally cleared field during lookup cannot be overwritten", async () => {
  geolocation((success) => success(position()))
  const pending = deferred()
  api.customerAddressApi.reverseGeocode = () => pending.promise
  const ui = guest(), locating = ui.button().props.onClick()
  await Promise.resolve(); ui.render()
  assert.equal(ui.button().props.disabled, true)
  ui.change("g-line1", "Temporary Manual House"); ui.change("g-line1", ""); ui.change("g-city", "Edited During Lookup")
  pending.resolve(detected); await locating; ui.render()
  assert.equal(ui.input("g-line1").props.value, "")
  assert.equal(ui.input("g-city").props.value, "Edited During Lookup")
  assert.equal(ui.input("g-district").props.value, detected.district)
  assert.equal(ui.button().props.disabled, false)
})

test("200 km browser uncertainty leaves manual fields unchanged and offers manual entry", async () => {
  geolocation((success) => success(position(200000)))
  let reverseCalls = 0
  api.customerAddressApi.reverseGeocode = async () => { reverseCalls++; return detected }
  const ui = guest(); ui.change("g-line1", "Existing House")
  await ui.button().props.onClick(); ui.render()
  assert.equal(reverseCalls, 0)
  assert.equal(ui.input("g-line1").props.value, "Existing House")
  assert.equal(ui.input("g-city").props.value, "")
  assert.match(text(ui.alert()), /approximate.*manually/i)
  assert.match(text(ui.alert()), /200000 metres/)
  assert.equal(toasts.length, 0)
})

for (const [code, expected] of [[1, /permission.*denied.*manually/i], [3, /timed out.*manually/i]]) {
  test(`geolocation error ${code} restores the location button and preserves entered details`, async () => {
    geolocation((success, failure) => failure({ code, PERMISSION_DENIED: 1, TIMEOUT: 3 }))
    const ui = guest(); ui.change("g-city", "Manual City")
    await ui.button().props.onClick(); ui.render()
    assert.match(text(ui.alert()), expected)
    assert.equal(ui.input("g-city").props.value, "Manual City")
    assert.equal(ui.button().props.disabled, false)
  })
}

test("leaving guest checkout ignores a delayed reverse-lookup completion", async () => {
  geolocation((success) => success(position()))
  const pending = deferred()
  api.customerAddressApi.reverseGeocode = () => pending.promise
  const ui = guest(), locating = ui.button().props.onClick()
  await Promise.resolve(); ui.render(); ui.dispose()
  const updates = ui.updates()
  pending.resolve(detected); await locating
  assert.equal(ui.updates(), updates)
  assert.equal(toasts.length, 0)
})
