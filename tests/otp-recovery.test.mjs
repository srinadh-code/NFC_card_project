import assert from "node:assert/strict"
import { after, afterEach, before, beforeEach, mock, test } from "node:test"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

let vite, OtpVerifier, ForgotPasswordDialog, api
const harnesses = new Set()
const toasts = []
const originals = new Map()
const event = () => ({ preventDefault() {} })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
const futureExpiry = () => new Date(Date.now() + 300_000).toISOString()

before(async () => {
  vite = await createServer({
    configFile: false, appType: "custom", server: { middlewareMode: true, hmr: false },
    ssr: { external: true }, optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    plugins: [{
      name: "otp-recovery-handler-fixture", enforce: "pre",
      resolveId(id) { if (id.startsWith("otp-test-")) return `\0${id}` },
      load(id) {
        if (id === "\0otp-test-hooks") return "export const useState=(...a)=>globalThis.__otpHooks.useState(...a);export const useRef=(...a)=>globalThis.__otpHooks.useRef(...a);export const useEffect=(...a)=>globalThis.__otpHooks.useEffect(...a);"
        if (id === "\0otp-test-toast") return "export const toast={success:(m)=>globalThis.__otpToast('success',m),error:(m)=>globalThis.__otpToast('error',m)};"
      },
      transform(code, id) {
        if (!/\/(?:OtpVerifier|ForgotPasswordDialog)\.tsx$/.test(id.replaceAll("\\", "/"))) return
        return code.replace('from "react"', 'from "otp-test-hooks"').replace('from "sonner"', 'from "otp-test-toast"')
      },
    }],
  })
  api = await vite.ssrLoadModule("/src/lib/api.ts")
  OtpVerifier = (await vite.ssrLoadModule("/src/components/checkout/OtpVerifier.tsx")).OtpVerifier
  ForgotPasswordDialog = (await vite.ssrLoadModule("/src/components/auth/ForgotPasswordDialog.tsx")).ForgotPasswordDialog
  for (const [object, names] of [[api.paymentsApi, ["sendOtp", "verifyOtp"]], [api.authApi, ["forgotPassword", "resendOtp", "verifyResetOtp", "resetPassword"]]]) {
    for (const name of names) originals.set(name, { object, fn: object[name] })
  }
})

beforeEach(() => {
  toasts.length = 0
  globalThis.__otpToast = (tone, message) => toasts.push({ tone, message })
  for (const [name, { object }] of originals) object[name] = () => { throw new Error(`Unexpected API call: ${name}`) }
  mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"], now: Date.UTC(2026, 0, 1) })
})

afterEach(() => {
  for (const harness of harnesses) harness.dispose()
  harnesses.clear()
  mock.timers.reset()
})

after(async () => {
  for (const [name, { object, fn }] of originals) object[name] = fn
  delete globalThis.__otpHooks
  delete globalThis.__otpToast
  await vite?.close()
})

// Exercise the actual component event handlers across state/effect updates,
// without rendering unrelated Radix components or adding a browser dependency.
function harness(Component, initialProps) {
  const slots = []
  let cursor, pendingEffects, dirty, tree, updates = 0, props = initialProps
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial
      return [slots[index], (value) => {
        updates++
        const next = typeof value === "function" ? value(slots[index]) : value
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true }
      }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useEffect(effect, deps) {
      const index = cursor++
      const previous = slots[index]
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        slots[index] = { deps, cleanup: previous?.cleanup }
        pendingEffects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect() })
      }
    },
  }
  const result = {
    render(update = {}) {
      props = { ...props, ...update }
      for (let attempts = 0; attempts < 10; attempts++) {
        cursor = 0; dirty = false; pendingEffects = []
        globalThis.__otpHooks = hooks
        tree = Component(props)
        pendingEffects.forEach((effect) => effect())
        if (!dirty) return tree
      }
      throw new Error("Unexpected render loop")
    },
    find(predicate) { return descendants(tree).find(predicate) },
    input(id) { return result.find((node) => node.props.id === id) },
    code() { return result.find((node) => node.props.autoComplete === "one-time-code") },
    button(label) { return result.find((node) => typeof node.props.onClick === "function" && text(node).includes(label)) },
    change(id, value) { result.input(id).props.onChange({ target: { value } }); result.render() },
    submit() { return result.find((node) => node.type === "form").props.onSubmit(event()) },
    close() { tree.props.onOpenChange(false); result.render({ open: false }); result.render({ open: true }) },
    updateCount() { return updates },
    dispose() { slots.forEach((slot) => slot?.cleanup?.()) },
  }
  harnesses.add(result)
  result.render()
  return result
}

function descendants(node) {
  if (Array.isArray(node)) return node.flatMap(descendants)
  if (!node || typeof node !== "object" || !node.props) return []
  return [node, ...descendants(node.props.children)]
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join("")
  if (node == null || typeof node === "boolean") return ""
  return typeof node === "object" ? text(node.props?.children) : String(node)
}

function otp(props = {}) {
  return harness(OtpVerifier, {
    channel: "EMAIL", label: "Email", placeholder: "you@example.com", value: "purchaser@example.com",
    onChange() {}, sessionRef: "fixture-session", verified: false, onVerified() {}, ...props,
  })
}
async function sentOtp(props) {
  api.paymentsApi.sendOtp = async () => ({ resend_after: 60 })
  const ui = otp(props)
  await ui.button("Send OTP").props.onClick()
  ui.render()
  ui.code().props.onChange({ target: { value: "123456" } })
  ui.render()
  return ui
}
function forgot() { return harness(ForgotPasswordDialog, { open: true, onOpenChange() {} }) }
async function requestedReset(ui) {
  api.authApi.forgotPassword = async () => ({ expires_at: futureExpiry() })
  ui.change("forgot-email", "owner@example.com")
  await ui.submit()
  ui.render()
}

test("checkout OTP honors header-only Retry-After without claiming a code was sent", async () => {
  api.paymentsApi.sendOtp = async () => { throw new api.ApiError("Please wait before trying again.", 429, {}, 75) }
  const ui = otp()
  await ui.button("Send OTP").props.onClick(); ui.render()
  assert.equal(ui.button("Resend in 75s").props.disabled, true)
  assert.equal(ui.code(), undefined)
  assert.ok(ui.find((node) => node.props.role === "alert" && text(node) === "Please wait before trying again."))
})

test("checkout OTP retains the longer body cooldown when both retry channels exist", async () => {
  api.paymentsApi.sendOtp = async () => { throw new api.ApiError("Please wait.", 429, { retry_after: 90 }, 60) }
  const ui = otp()
  await ui.button("Send OTP").props.onClick(); ui.render()
  assert.equal(ui.button("Resend in 90s").props.disabled, true)
})

test("repeated Enter and clicks cannot submit concurrent checkout OTP verifications", async () => {
  const pending = deferred(), calls = [], verified = []
  api.paymentsApi.verifyOtp = (...args) => { calls.push(args); return pending.promise }
  const ui = await sentOtp({ onVerified: (...args) => verified.push(args) })
  const key = ui.code().props.onKeyDown
  key({ key: "Enter", preventDefault() {} }); key({ key: "Enter", preventDefault() {} })
  ui.render(); ui.code().props.onKeyDown({ key: "Enter", preventDefault() {} })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], ["EMAIL", "purchaser@example.com", "123456", "fixture-session"])
  pending.resolve({ verification_token: "fixture-proof" })
  await pending.promise; await Promise.resolve(); ui.render()
  assert.deepEqual(verified, [["fixture-proof", "purchaser@example.com"]])
})

test("expired and disabled checkout codes cannot be submitted through Enter", async () => {
  let calls = 0
  api.paymentsApi.verifyOtp = async () => { calls++; return { verification_token: "unused" } }
  const ui = await sentOtp()
  for (let i = 0; i < 300; i++) { mock.timers.tick(1000); ui.render() }
  ui.code().props.onKeyDown({ key: "Enter", preventDefault() {} })
  assert.equal(calls, 0)
  const disabled = await sentOtp()
  disabled.render({ disabled: true })
  disabled.code().props.onKeyDown({ key: "Enter", preventDefault() {} })
  assert.equal(calls, 0)
  assert.equal(disabled.button("Verify OTP").props.disabled, true)
})

test("unmounting a verifier discards its delayed send completion without state updates", async () => {
  const pending = deferred()
  api.paymentsApi.sendOtp = () => pending.promise
  const ui = otp()
  const sending = ui.button("Send OTP").props.onClick()
  ui.render(); ui.dispose()
  const updates = ui.updateCount()
  pending.resolve({ resend_after: 60 }); await sending
  assert.equal(ui.updateCount(), updates)
})

test("switching verification methods cannot let the unmounted email verifier confirm the parent", async () => {
  const pending = deferred(), verified = []
  api.paymentsApi.verifyOtp = () => pending.promise
  const email = await sentOtp({ onVerified: (...args) => verified.push(["EMAIL", ...args]) })
  const oldVerification = email.button("Verify OTP").props.onClick()
  email.render(); email.dispose()
  const sms = otp({ channel: "SMS", label: "Mobile", value: "9876543210", onVerified: (...args) => verified.push(["SMS", ...args]) })
  pending.resolve({ verification_token: "stale-email-proof" }); await oldVerification
  assert.deepEqual(verified, [])
  api.paymentsApi.sendOtp = async () => ({ resend_after: 0 })
  await sms.button("Send OTP").props.onClick(); sms.render()
  sms.code().props.onChange({ target: { value: "123456" } }); sms.render()
  api.paymentsApi.verifyOtp = async () => ({ verification_token: "sms-proof" })
  await sms.button("Verify OTP").props.onClick()
  assert.deepEqual(verified, [["SMS", "sms-proof", "9876543210"]])
})

test("changing a destination discards a delayed send success and allows the current request", async () => {
  const pending = deferred(), calls = []
  api.paymentsApi.sendOtp = (...args) => { calls.push(args); return calls.length === 1 ? pending.promise : Promise.resolve({ resend_after: 0 }) }
  const ui = otp()
  const oldSend = ui.button("Send OTP").props.onClick(); ui.render()
  ui.render({ value: "other@example.com" })
  const updates = ui.updateCount()
  pending.resolve({ resend_after: 60 }); await oldSend; ui.render()
  assert.equal(ui.updateCount(), updates)
  assert.equal(ui.code(), undefined)
  assert.equal(ui.button("Send OTP").props.disabled, false)
  await ui.button("Send OTP").props.onClick(); ui.render()
  assert.ok(ui.code())
  assert.deepEqual(calls.map((args) => args[1]), ["purchaser@example.com", "other@example.com"])
})

test("changing a destination discards a delayed error and its stale cooldown", async () => {
  const pending = deferred()
  api.paymentsApi.sendOtp = () => pending.promise
  const ui = otp()
  const oldSend = ui.button("Send OTP").props.onClick(); ui.render()
  ui.render({ value: "other@example.com" })
  const updates = ui.updateCount()
  pending.reject(new api.ApiError("Old address must wait.", 429, { retry_after: 600 }, 600))
  await oldSend; ui.render()
  assert.equal(ui.updateCount(), updates)
  assert.equal(ui.find((node) => node.props.role === "alert"), undefined)
  assert.equal(ui.button("Send OTP").props.disabled, false)
})

test("a changed checkout session cannot receive the previous session's verification proof", async () => {
  const pending = deferred(), verified = [], calls = []
  api.paymentsApi.verifyOtp = (...args) => { calls.push(args); return pending.promise }
  const ui = await sentOtp({ onVerified: (...args) => verified.push(args) })
  const oldVerification = ui.button("Verify OTP").props.onClick(); ui.render()
  ui.render({ sessionRef: "new-checkout-session" })
  pending.resolve({ verification_token: "old-session-proof" }); await oldVerification; ui.render()
  assert.deepEqual(verified, [])
  assert.equal(ui.code(), undefined)
  for (let i = 0; i < 60; i++) { mock.timers.tick(1000); ui.render() }
  api.paymentsApi.sendOtp = async (...args) => { calls.push(args); return { resend_after: 0 } }
  await ui.button("Send OTP").props.onClick(); ui.render()
  ui.code().props.onChange({ target: { value: "123456" } }); ui.render()
  api.paymentsApi.verifyOtp = async (...args) => { calls.push(args); return { verification_token: "new-session-proof" } }
  await ui.button("Verify OTP").props.onClick()
  assert.equal(calls[0][3], "fixture-session")
  assert.equal(calls[1][2], "new-checkout-session")
  assert.equal(calls[2][3], "new-checkout-session")
  assert.deepEqual(verified, [["new-session-proof", "purchaser@example.com"]])
})

test("an in-place channel change discards an old verification failure and finalizer", async () => {
  const pending = deferred()
  api.paymentsApi.verifyOtp = () => pending.promise
  const ui = await sentOtp()
  const oldVerification = ui.button("Verify OTP").props.onClick(); ui.render()
  ui.render({ channel: "SMS", label: "Mobile", value: "9876543210" })
  const updates = ui.updateCount()
  pending.reject(new api.ApiError("Old email code was incorrect.", 400))
  await oldVerification; ui.render()
  assert.equal(ui.updateCount(), updates)
  assert.equal(ui.find((node) => node.props.role === "alert"), undefined)
  assert.equal(ui.code(), undefined)
})

test("forgot password surfaces the existing safe API error", async () => {
  api.authApi.forgotPassword = async () => { throw new api.ApiError("Please wait 60 seconds before trying again.", 429) }
  const ui = forgot(); ui.change("forgot-email", "owner@example.com")
  await ui.submit(); ui.render()
  assert.deepEqual(toasts, [{ tone: "error", message: "Please wait 60 seconds before trying again." }])
  assert.ok(ui.input("forgot-email"))
})

test("closing the reset dialog discards a delayed send response after reopening", async () => {
  const pending = deferred()
  api.authApi.forgotPassword = () => pending.promise
  const ui = forgot(); ui.change("forgot-email", "owner@example.com")
  const request = ui.submit(); ui.render(); ui.close()
  pending.resolve({ expires_at: futureExpiry() }); await request; ui.render()
  assert.equal(ui.input("forgot-email").props.value, "")
  assert.equal(ui.input("forgot-otp"), undefined)
  assert.equal(toasts.length, 0)
})

test("editing an email invalidates its pending result without ending the next request", async () => {
  const first = deferred(), second = deferred(), calls = []
  api.authApi.forgotPassword = (data) => { calls.push(data); return calls.length === 1 ? first.promise : second.promise }
  const ui = forgot(); ui.change("forgot-email", "first@example.com")
  const oldRequest = ui.submit(); ui.render()
  ui.change("forgot-email", "second@example.com")
  const newRequest = ui.submit(); ui.render()
  first.resolve({ expires_at: futureExpiry() }); await oldRequest; ui.render()
  assert.equal(ui.input("forgot-otp"), undefined)
  assert.equal(ui.find((node) => node.props.type === "submit").props.disabled, true)
  second.resolve({ expires_at: futureExpiry() }); await newRequest; ui.render()
  assert.ok(ui.input("forgot-otp"))
  assert.deepEqual(calls, [{ email: "first@example.com" }, { email: "second@example.com" }])
  assert.equal(toasts.filter((toast) => toast.tone === "success").length, 1)
})

test("a delayed verification cannot restore a reset token after the dialog closes", async () => {
  const ui = forgot(); await requestedReset(ui)
  ui.change("forgot-otp", "123456")
  const pending = deferred()
  api.authApi.verifyResetOtp = () => pending.promise
  const request = ui.submit(); ui.render(); ui.close()
  pending.resolve({ reset_token: "old-fixture-proof" }); await request; ui.render()
  assert.ok(ui.input("forgot-email"))
  assert.equal(ui.input("forgot-new-password"), undefined)
})

test("a delayed resend cannot restart the cleared dialog countdown", async () => {
  const ui = forgot(); await requestedReset(ui)
  mock.timers.tick(30_000); ui.render()
  const pending = deferred()
  api.authApi.resendOtp = () => pending.promise
  const request = ui.button("Resend code").props.onClick(); ui.render(); ui.close()
  const toastCount = toasts.length
  pending.resolve({ expires_at: futureExpiry() }); await request; ui.render()
  assert.ok(ui.input("forgot-email"))
  assert.equal(ui.input("forgot-otp"), undefined)
  assert.equal(toasts.length, toastCount)
})

test("a delayed password reset cannot close a newly reopened recovery form", async () => {
  const ui = forgot(); await requestedReset(ui)
  api.authApi.verifyResetOtp = async () => ({ reset_token: "fixture-proof" })
  ui.change("forgot-otp", "123456"); await ui.submit(); ui.render()
  ui.change("forgot-new-password", "SafePass@1"); ui.change("forgot-confirm-password", "SafePass@1")
  const pending = deferred()
  api.authApi.resetPassword = () => pending.promise
  const request = ui.submit(); ui.render(); ui.close()
  const toastCount = toasts.length
  pending.resolve(); await request; ui.render()
  assert.ok(ui.input("forgot-email"))
  assert.equal(toasts.length, toastCount)
})
