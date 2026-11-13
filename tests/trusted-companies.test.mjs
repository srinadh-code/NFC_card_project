import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

let vite, TrustedCompanies
const company = (id, name) => ({ id, name })
const render = (companies) => renderToStaticMarkup(createElement(TrustedCompanies, { companies }))

before(async () => {
  vite = await createServer({
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
    ssr: { external: ["react"] },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  TrustedCompanies = (await vite.ssrLoadModule("/src/components/marketing/TrustedCompanies.tsx")).default
})

after(async () => { await vite?.close() })

test("empty and blank company lists omit the endorsement section", () => {
  assert.equal(render([]), "")
  assert.equal(render([company(1, "  ")]), "")
})

test("one verified company has a static readable display without repeated names", () => {
  const html = render([company(1, "Example Studio")])
  assert.equal((html.match(/Example Studio/g) ?? []).length, 1)
  assert.match(html, /Trusted by professionals at/)
  assert.doesNotMatch(html, /data-company-loop|tabindex=/)
})

test("small lists fill two identical loop groups in the supplied CMS order", () => {
  const html = render([company(2, "Second Example"), company(1, "First Example")])
  const groups = [...html.matchAll(/<div[^>]*data-company-loop="[^"]*"[^>]*>(.*?)<\/div>/g)].map((match) => match[1])
  assert.equal(groups.length, 2)
  assert.equal(groups[0], groups[1])
  assert.equal((groups[0].match(/<span/g) ?? []).length, 12)
  assert.ok(groups[0].indexOf("Second Example") < groups[0].indexOf("First Example"))
  assert.match(html, /aria-hidden="true"/)
  assert.match(html, /tabindex="0"/)
  const accessibleList = html.match(/<ul[^>]*>(.*?)<\/ul>/)?.[1]
  assert.equal((accessibleList?.match(/<li/g) ?? []).length, 2)
})

test("company names stay escaped text and logos are not loaded", () => {
  const html = render([{ ...company(1, '<img src=x onerror="alert(1)">'), logo_url: "https://example.invalid/logo.png" }])
  assert.match(html, /&lt;img src=x onerror=/)
  assert.doesNotMatch(html, /<img|logo\.png/)
})

test("larger refreshed company lists display every supplied name with no stale fallback", () => {
  const names = Array.from({ length: 15 }, (_, i) => company(i + 1, `Verified Sample ${i + 1}`))
  const html = render(names)
  const groups = [...html.matchAll(/<div[^>]*data-company-loop="[^"]*"[^>]*>(.*?)<\/div>/g)]
  assert.equal((groups[0]?.[1].match(/<span/g) ?? []).length, 15)
  assert.ok(html.includes("Verified Sample 15"))
  assert.doesNotMatch(render([company(16, "Replacement Sample")]), /Verified Sample/)
})
