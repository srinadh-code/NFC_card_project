import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { createServer } from "vite"

let vite, NfcRedirect
const originals = new Map()
const effects = []

before(async () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }
  for (const [key, value] of Object.entries({
    localStorage: storage, sessionStorage: storage,
    window: { location: { origin: "https://nfc-card-project-peach.vercel.app", pathname: "/nfc/test-card", replace() {} }, localStorage: storage, atob, btoa },
    fetch: () => { throw new Error("Unexpected real request") }, __nfcRedirectEffects: effects,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", plugins: [{
    name: "nfc-redirect-effect-test", enforce: "pre",
    transform(code, id) {
      if (id.replaceAll("\\", "/").endsWith("/pages/NfcRedirect.tsx")) return code.replace("useEffect, useState", "useEffect as actualUseEffect, useState as actualUseState") +
        "\nconst useEffect = (effect, deps) => globalThis.__nfcRedirectEffects ? globalThis.__nfcRedirectEffects.push(effect) : actualUseEffect(effect, deps);\nconst useState = initial => { const [value, setValue] = actualUseState(initial); return [value, next => { globalThis.__nfcRedirectFailure?.(next); setValue(next); }]; };"
    },
  }] })
  NfcRedirect = (await vite.ssrLoadModule("/src/pages/NfcRedirect.tsx")).default
})

after(async () => {
  await vite?.close()
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})

test("the existing public route opens the latest Maps destination without sending login credentials", { timeout: 10000 }, async (context) => {
  context.after(() => { delete globalThis.__nfcRedirectFailure })
  const identifier = "REVIEW-CARD." + "A".repeat(43)
  const destinations = ["https://www.google.com/maps/place/First+Business/", "https://maps.google.com/?cid=123456789"]
  const requests = []
  for (const destination of destinations) {
    const opened = new Promise((resolve, reject) => {
      window.location.replace = url => resolve(url)
      globalThis.__nfcRedirectFailure = failure => reject(new Error(failure.message))
    })
    globalThis.fetch = async (url, options) => {
      requests.push({ url: String(url), options })
      return Response.json({ success: true, data: { redirect_url: destination } })
    }
    effects.length = 0
    renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/nfc/${identifier}`] },
      createElement(Routes, null, createElement(Route, { path: "/nfc/:identifier", element: createElement(NfcRedirect) }))))
    assert.equal(effects.length, 1)
    const cleanup = effects[0]()
    try { assert.equal(await opened, destination) }
    finally { cleanup() }
  }
  for (const { url, options } of requests) {
    assert.ok(url.endsWith(`/nfc/cards/${identifier}/`))
    assert.equal(options.headers.Authorization, undefined)
    assert.doesNotMatch(url, /source=qr/)
  }
})
