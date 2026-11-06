import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { createServer } from "vite"

let vite
let api
let Cards
let previousLocalStorage
const originalFetch = globalThis.fetch

before(async () => {
  previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  const storage = new Map()
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  } })
  vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" })
  api = (await vite.ssrLoadModule("/src/lib/api.ts")).adminNfcApi
  Cards = (await vite.ssrLoadModule("/src/pages/admin/Cards.tsx")).default
})

after(async () => {
  await vite?.close()
  globalThis.fetch = originalFetch
  if (previousLocalStorage) Object.defineProperty(globalThis, "localStorage", previousLocalStorage)
  else delete globalThis.localStorage
})

test("assignment lookup uses the NFC eligibility endpoint and preserves distinct emails sharing a name", async () => {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return Response.json({ success: true, data: [
      { id: 1, name: "Srinadh", email: " SRINADH1@GMAIL.COM " },
      { id: 2, name: "Srinadh", email: "srinadh2@gmail.com" },
      { id: 3, name: "Kavya", email: "kavya@gmail.com" },
    ], pagination: { count: 3 } })
  }
  const result = await api.assignmentCustomers({ page: 1, search: "Srinadh" })
  assert.match(calls[0], /\/admin\/cards\/assignment-customers\/\?page=1&search=Srinadh$/)
  assert.deepEqual(result.data, [
    { id: "1", name: "Srinadh", email: "srinadh1@gmail.com" },
    { id: "2", name: "Srinadh", email: "srinadh2@gmail.com" },
    { id: "3", name: "Kavya", email: "kavya@gmail.com" },
  ])
  assert.equal(result.count, 3)
})

test("an empty eligibility response stays empty instead of falling back to the full customer directory", async () => {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return Response.json({ success: true, data: [], pagination: { count: 0 } })
  }
  const result = await api.assignmentCustomers()
  assert.deepEqual(result, { data: [], count: 0 })
  assert.equal(calls.length, 1)
  assert.match(calls[0], /\/admin\/cards\/assignment-customers\/\?$/)
})

function renderCards(cards) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(["admin-cards", 1, "", "All"], { data: cards, count: cards.length, page: 1, numPages: 1 })
  try {
    return renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(MemoryRouter, null, createElement(Cards)),
    ))
  } finally {
    client.clear()
  }
}

test("NFC table displays linked customer emails beside duplicate names and a dash for unassigned cards", () => {
  const base = { serialNumber: "SN", cardType: "Custom", color: "Black", status: "Assigned", assignedOn: null, activatedOn: null, purchaseDate: "", notes: "" }
  const html = renderCards([
    { ...base, id: "101", uid: "UID-1", customerId: "1", customerName: "Srinadh", customerEmail: "srinadh1@gmail.com" },
    { ...base, id: "102", uid: "UID-2", customerId: "2", customerName: "Srinadh", customerEmail: "srinadh2@gmail.com" },
    { ...base, id: "103", uid: "UID-3", customerId: null, customerName: null, customerEmail: null, status: "Unassigned" },
  ])
  const headings = [...html.matchAll(/<th\b[^>]*>(.*?)<\/th>/gs)].map((match) => match[1])
  assert.deepEqual(headings, ["Card ID", "Card UID", "Type", "Customer", "Customer Email", "Status", "Activated On", "Actions"])
  const rows = [...html.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/gs)].slice(1)
  const cells = rows.map((row) => [...row[1].matchAll(/<td\b[^>]*>(.*?)<\/td>/gs)].map((cell) => cell[1]))
  assert.deepEqual(cells.map((row) => [row[0], row[3], row[4]]), [
    ["101", "Srinadh", "srinadh1@gmail.com"], ["102", "Srinadh", "srinadh2@gmail.com"], ["103", "Unassigned", "—"],
  ])
})

test("empty NFC table spans all eight columns", () => {
  assert.match(renderCards([]), /colSpan="8"[^>]*>No cards found\./)
})
