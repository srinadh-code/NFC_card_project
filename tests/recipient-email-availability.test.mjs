import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

let vite
let useRecipientEmailAvailability
let recipientEmailApi
let ApiError
const runtime = { current: null }
const runtimeKey = "__recipientEmailAvailabilityTestHooks"

before(async () => {
  globalThis[runtimeKey] = runtime
  vite = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    ssr: { noExternal: ["react"] },
    plugins: [{
      name: "recipient-hook-test-runtime",
      enforce: "pre",
      resolveId(id, importer) {
        if (id === "react" && importer?.replaceAll("\\", "/").endsWith("/useRecipientEmailAvailability.ts")) {
          return "\0recipient-hook-test-runtime"
        }
      },
      load(id) {
        if (id !== "\0recipient-hook-test-runtime") return
        return ["useState", "useRef", "useEffect", "useMemo", "useCallback"].map((name) =>
          `export const ${name} = (...args) => globalThis.${runtimeKey}.current.${name}(...args);`,
        ).join("\n")
      },
    }],
  })
  const api = await vite.ssrLoadModule("/src/lib/api.ts")
  recipientEmailApi = api.recipientEmailApi
  ApiError = api.ApiError
  useRecipientEmailAvailability = (await vite.ssrLoadModule("/src/hooks/useRecipientEmailAvailability.ts")).useRecipientEmailAvailability
})

after(async () => {
  await vite?.close()
  delete globalThis[runtimeKey]
})

// Exercise the real hook's effects with controlled state and time, without
// introducing a DOM package. The runtime models dependency comparison and
// cleanup; every request, status and debounce decision comes from the hook.
function createHarness(context, emails, buyerEmail = "", check = async () => ({ available: true, message: "Available" })) {
  context.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1_000_000 })
  const originalCheck = recipientEmailApi.check
  const calls = []
  recipientEmailApi.check = (...args) => {
    calls.push(args)
    return check(...args)
  }
  const slots = []
  let cursor = 0
  let effects = []
  let dirty = true
  let result
  let recipients = emails.map(recipient)
  let buyer = buyerEmail
  function RecipientAvailabilityTestComponent() {
    return useRecipientEmailAvailability(recipients, buyer)
  }
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  const harness = {
    calls,
    get result() { return result },
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { value: typeof initial === "function" ? initial() : initial }
      return [slots[index].value, (value) => {
        const next = typeof value === "function" ? value(slots[index].value) : value
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true }
      }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useEffect(effect, dependencies) {
      const index = cursor++
      if (!same(slots[index]?.dependencies, dependencies)) effects.push(() => {
        slots[index]?.cleanup?.()
        slots[index] = { dependencies, cleanup: effect() }
      })
    },
    useMemo(compute, dependencies) {
      const index = cursor++
      if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, value: compute() }
      return slots[index].value
    },
    useCallback(callback, dependencies) { return harness.useMemo(() => callback, dependencies) },
    render() {
      runtime.current = harness
      let iterations = 0
      do {
        assert.ok(++iterations < 30, "hook rendering settles")
        dirty = false
        cursor = 0
        effects = []
        result = RecipientAvailabilityTestComponent()
        for (const effect of effects) effect()
      } while (dirty)
      return result
    },
    update(nextEmails, nextBuyer = buyer) {
      recipients = nextEmails.map((value) => typeof value === "string" ? recipient(value) : value)
      buyer = nextBuyer
      return harness.render()
    },
    async flush() {
      for (let index = 0; index < 8; index++) {
        await Promise.resolve()
        if (dirty) harness.render()
      }
      return result
    },
    async advance(milliseconds) {
      context.mock.timers.tick(milliseconds)
      return harness.flush()
    },
    unmount() { for (const slot of slots) slot?.cleanup?.() },
  }
  context.after(() => {
    harness.unmount()
    recipientEmailApi.check = originalCheck
    runtime.current = null
  })
  harness.render()
  return harness
}

const recipient = (email) => ({ full_name: "Recipient", email, phone: "+447700900123" })
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test("typing waits 600 ms and checks only the final normalized email", async (context) => {
  const hook = createHarness(context, ["first@example.com"])
  await hook.advance(400)
  hook.update(["final@example.com"])
  await hook.advance(599)
  assert.deepEqual(hook.calls, [])
  await hook.advance(1)
  assert.deepEqual(hook.calls, [["final@example.com", ""]])
  assert.equal(hook.result.allAvailable, true)
})

test("empty and invalid emails never issue availability requests", async (context) => {
  const hook = createHarness(context, ["", "  ", "invalid", "name@domain", "x".repeat(255) + "@example.com"])
  await hook.advance(1_000)
  assert.deepEqual(hook.calls, [])
  assert.deepEqual(hook.result.statuses.map(({ state }) => state), ["idle", "idle", "invalid", "invalid", "invalid"])
  assert.equal(hook.result.allAvailable, false)
})

test("duplicate recipients are blocked locally while a distinct email is checked once", async (context) => {
  const hook = createHarness(context, [" Same@Example.com ", "same@example.com", "other@example.com"])
  await hook.advance(600)
  assert.deepEqual(hook.calls, [["other@example.com", ""]])
  assert.deepEqual(hook.result.statuses.map(({ state }) => state), ["duplicate", "duplicate", "available"])
  assert.equal(hook.result.allAvailable, false)
})

test("different recipients each receive one availability check", async (context) => {
  const emails = Array.from({ length: 10 }, (_, index) => `recipient${index}@example.com`)
  const hook = createHarness(context, emails)
  await hook.advance(600)
  assert.deepEqual(hook.calls, emails.map((email) => [email, ""]))
  assert.equal(hook.result.allAvailable, true)
})

test("editing another recipient preserves the unchanged email result", async (context) => {
  const hook = createHarness(context, ["first@example.com", "second@example.com"])
  await hook.advance(600)
  hook.update(["first@example.com", "third@example.com"])
  assert.equal(hook.result.statuses[0].state, "available")
  await hook.advance(600)
  assert.deepEqual(hook.calls, [["first@example.com", ""], ["second@example.com", ""], ["third@example.com", ""]])
  assert.equal(hook.result.allAvailable, true)
})

test("name, phone, casing, whitespace and recipient order changes reuse checked emails", async (context) => {
  const hook = createHarness(context, ["first@example.com", "second@example.com"])
  await hook.advance(600)
  hook.update([
    { ...recipient(" SECOND@example.com "), full_name: "Updated", phone: "+919876543210" },
    recipient(" FIRST@example.com "),
    recipient("third@example.com"),
  ])
  await hook.advance(600)
  assert.deepEqual(hook.calls, [["first@example.com", ""], ["second@example.com", ""], ["third@example.com", ""]])
  assert.equal(hook.result.allAvailable, true)
})

test("unchanged in-flight emails are not requested again when another slot changes", async (context) => {
  const pending = deferred()
  const hook = createHarness(context, ["first@example.com", "second@example.com"], "", (email) =>
    email === "first@example.com" ? pending.promise : Promise.resolve({ available: true, message: "Available" }),
  )
  await hook.advance(600)
  hook.update(["first@example.com", "third@example.com"])
  await hook.advance(600)
  assert.equal(hook.calls.filter(([email]) => email === "first@example.com").length, 1)
  pending.resolve({ available: true, message: "Available" })
  await hook.flush()
  assert.equal(hook.result.allAvailable, true)
})

test("a late response cannot overwrite the status of a changed email", async (context) => {
  const pending = deferred()
  const hook = createHarness(context, ["old@example.com"], "", (email) =>
    email === "old@example.com" ? pending.promise : Promise.resolve({ available: true, message: "Available" }),
  )
  await hook.advance(600)
  hook.update(["new@example.com"])
  await hook.advance(600)
  pending.resolve({ available: false, message: "Assigned" })
  await hook.flush()
  assert.deepEqual(hook.result.statuses, [{ email: "new@example.com", state: "available" }])
})

test("changing buyer context checks the same recipient again", async (context) => {
  const hook = createHarness(context, ["recipient@example.com"], "firstbuyer@example.com")
  await hook.advance(600)
  hook.update(["recipient@example.com"], "secondbuyer@example.com")
  assert.equal(hook.result.allAvailable, false)
  await hook.advance(600)
  assert.deepEqual(hook.calls, [["recipient@example.com", "firstbuyer@example.com"], ["recipient@example.com", "secondbuyer@example.com"]])
})

test("a network failure can be retried without duplicate concurrent requests", async (context) => {
  const pending = deferred()
  let attempts = 0
  const hook = createHarness(context, ["recipient@example.com"], "", () =>
    ++attempts === 1 ? Promise.reject(new Error("offline")) : pending.promise,
  )
  await hook.advance(600)
  assert.equal(hook.result.statuses[0].state, "network-error")
  hook.result.retry()
  hook.render()
  await hook.advance(600)
  hook.result.retry()
  hook.render()
  await hook.advance(600)
  assert.equal(hook.calls.length, 2)
  pending.resolve({ available: true, message: "Available" })
  await hook.flush()
  assert.equal(hook.result.allAvailable, true)
})

test("explicit retry refreshes checked allocation results", async (context) => {
  let available = true
  const hook = createHarness(context, ["recipient@example.com"], "", async () => ({ available, message: "Already assigned" }))
  await hook.advance(600)
  available = false
  hook.result.retry()
  hook.render()
  assert.equal(hook.result.allAvailable, false)
  await hook.advance(600)
  assert.equal(hook.calls.length, 2)
  assert.equal(hook.result.statuses[0].state, "allocated")
})

test("HTTP 429 shows a cooldown and allows retry after Retry-After", async (context) => {
  let attempts = 0
  const hook = createHarness(context, ["recipient@example.com"], "", async () => {
    if (++attempts === 1) throw new ApiError("Throttled", 429, {}, 2)
    return { available: true, message: "Available" }
  })
  await hook.advance(600)
  const status = hook.result.statuses[0]
  assert.equal(status.state, "rate-limited")
  assert.equal(status.retryAt, Date.now() + 2_000)
  assert.match(status.message, /retry|try again/i)
  assert.equal(hook.result.allAvailable, false)
  hook.result.retry("recipient@example.com")
  hook.render()
  await hook.advance(1_000)
  assert.equal(hook.calls.length, 1)
  await hook.advance(1_000)
  hook.result.retry("recipient@example.com")
  hook.render()
  await hook.advance(600)
  assert.equal(hook.calls.length, 2)
  assert.equal(hook.result.allAvailable, true)
})

test("a row retry preserves availability for other recipients", async (context) => {
  let attempts = 0
  const hook = createHarness(context, ["first@example.com", "second@example.com"], "", async (email) => {
    if (email === "second@example.com" && ++attempts === 1) throw new Error("offline")
    return { available: true, message: "Available" }
  })
  await hook.advance(600)
  hook.result.retry("second@example.com")
  hook.render()
  assert.equal(hook.result.statuses[0].state, "available")
  await hook.advance(600)
  assert.deepEqual(hook.calls, [["first@example.com", ""], ["second@example.com", ""], ["second@example.com", ""]])
  assert.equal(hook.result.allAvailable, true)
})

test("clearing an email or leaving the form cancels its pending debounce", async (context) => {
  const hook = createHarness(context, ["recipient@example.com"])
  await hook.advance(300)
  hook.update([""])
  await hook.advance(600)
  assert.equal(hook.calls.length, 0)
  hook.update(["recipient@example.com"])
  await hook.advance(300)
  hook.unmount()
  await hook.advance(600)
  assert.equal(hook.calls.length, 0)
})

test("HTTP 429 prevents checks for newly entered emails during cooldown", async (context) => {
  const hook = createHarness(context, ["first@example.com"], "", async () => {
    throw new ApiError("Throttled", 429, {}, 3)
  })
  await hook.advance(600)
  hook.update(["second@example.com"])
  await hook.advance(600)
  assert.deepEqual(hook.calls, [["first@example.com", ""]])
  assert.equal(hook.result.statuses[0].state, "rate-limited")
  assert.equal(hook.result.allAvailable, false)
})

test("an unchanged failed email waits for explicit retry instead of retrying on edits", async (context) => {
  const hook = createHarness(context, ["first@example.com", "second@example.com"], "", async (email) => {
    if (email === "first@example.com") throw new Error("offline")
    return { available: true, message: "Available" }
  })
  await hook.advance(600)
  hook.update([" FIRST@example.com ", "third@example.com"])
  await hook.advance(600)
  assert.equal(hook.result.statuses[0].state, "network-error")
  assert.equal(hook.calls.filter(([email]) => email === "first@example.com").length, 1)
})

test("checkout retry invalidates stale availability during a cooldown from an older email", async (context) => {
  const pending = deferred()
  const hook = createHarness(context, ["available@example.com"], "", (email) =>
    email === "old@example.com" ? pending.promise : Promise.resolve({ available: true, message: "Available" }),
  )
  await hook.advance(600)
  hook.update(["old@example.com"])
  await hook.advance(600)
  hook.update(["available@example.com"])
  pending.reject(new ApiError("Throttled", 429, {}, 2))
  await hook.flush()
  assert.equal(hook.result.allAvailable, true)

  hook.result.retry()
  hook.render()
  assert.equal(hook.result.allAvailable, false)
  await hook.advance(600)
  assert.equal(hook.result.statuses[0].state, "rate-limited")
  assert.equal(hook.calls.length, 2)
  await hook.advance(1_400)
  hook.result.retry("available@example.com")
  hook.render()
  await hook.advance(600)
  assert.equal(hook.calls.length, 3)
  assert.equal(hook.result.allAvailable, true)
})

test("HTTP 429 without an exposed Retry-After header uses a one-minute cooldown", async (context) => {
  const hook = createHarness(context, ["recipient@example.com"], "", async () => {
    throw new ApiError("Throttled", 429)
  })
  await hook.advance(600)
  assert.equal(hook.result.statuses[0].retryAt, Date.now() + 60_000)
  hook.result.retry("recipient@example.com")
  hook.render()
  await hook.advance(1_000)
  assert.equal(hook.calls.length, 1)
})
