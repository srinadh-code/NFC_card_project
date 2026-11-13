import assert from "node:assert/strict"
import { test } from "node:test"
import { populateQrPrintDocument } from "../src/lib/qr-print.ts"

// Minimal DOM contract: any HTML-parsing sink is forbidden in this print path.
function printDocument() {
  const created = []
  function element(tag) {
    const node = { tagName: tag.toUpperCase(), style: {}, children: [], textContent: "" }
    node.replaceChildren = (...children) => { node.children = children }
    Object.defineProperty(node, "innerHTML", { set() { throw new Error("Unexpected HTML parsing") } })
    return node
  }
  return {
    title: "",
    body: element("body"),
    created,
    createElement(tag) { const node = element(tag); created.push(node); return node },
    write() { throw new Error("Unexpected document.write") },
  }
}

test("malicious profile captions remain literal text without creating executable markup", () => {
  const doc = printDocument()
  const title = '</title><script>parent.__executed=true</script><img src=x onerror="parent.__executed=true">'
  populateQrPrintDocument(doc, "data:image/png;base64,fixture", title)
  assert.equal(doc.title, title)
  assert.equal(doc.body.children[1].textContent, title)
  assert.deepEqual(doc.created.map((node) => node.tagName), ["IMG", "P"])
  assert.equal(doc.body.children.length, 2)
})

test("the QR source is assigned as a URL without interpreting attribute-shaped text", () => {
  const doc = printDocument()
  const source = 'data:image/png;base64,fixture" onerror="parent.__executed=true'
  populateQrPrintDocument(doc, source, "Alex Morgan — example.com/u/alex")
  assert.equal(doc.body.children[0].src, source)
  assert.equal(doc.body.children[0].onerror, undefined)
  assert.equal(doc.body.children[1].textContent, "Alex Morgan — example.com/u/alex")
  assert.equal(doc.body.children[0].style.cssText, "width:320px;height:320px;")
  assert.match(doc.body.style.cssText, /display:flex;flex-direction:column;align-items:center;justify-content:center/)
})
