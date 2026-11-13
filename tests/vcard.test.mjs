import assert from "node:assert/strict"
import { test } from "node:test"
import { buildVCard } from "../src/lib/vcard.ts"

const profile = {
  username: "alex",
  fullName: "Alex Morgan",
  company: "Example Studio",
  designation: "Designer",
  phone: "+919876543210",
  email: "alex@example.com",
  address: "Hyderabad",
  website: "https://example.com/contact?q=a,b;view=full",
}

test("ordinary contacts retain the existing fields and valid URI punctuation", () => {
  assert.equal(buildVCard(profile, true), [
    "BEGIN:VCARD", "VERSION:3.0", "FN:Alex Morgan", "ORG:Example Studio", "TITLE:Designer",
    "TEL;TYPE=CELL:+919876543210", "EMAIL:alex@example.com", "ADR;TYPE=WORK:;;Hyderabad",
    "URL:https://example.com/contact?q=a,b;view=full", "END:VCARD",
  ].join("\n"))
})

test("profile newlines remain text and cannot add vCard properties or contacts", () => {
  const card = buildVCard({
    ...profile,
    fullName: "Alex\nTEL:+911111111111",
    company: "Studio\r\nBEGIN:VCARD",
    designation: "Designer\rURL:https://injected.invalid",
    address: "Street\nEND:VCARD",
  }, false)
  const lines = card.split("\n")
  assert.ok(lines.includes("FN:Alex\\nTEL:+911111111111"))
  assert.ok(lines.includes("ORG:Studio\\nBEGIN:VCARD"))
  assert.ok(lines.includes("TITLE:Designer\\nURL:https://injected.invalid"))
  assert.ok(lines.includes("ADR;TYPE=WORK:;;Street\\nEND:VCARD"))
  assert.equal(lines.filter((line) => line === "BEGIN:VCARD").length, 1)
  assert.equal(lines.filter((line) => line === "END:VCARD").length, 1)
  assert.equal(lines.filter((line) => line.startsWith("TEL:")).length, 0)
})

test("TEXT separators and backslashes cannot create structured values", () => {
  const card = buildVCard({ ...profile, fullName: "Doe, Jane", company: "A;B\\C", address: "Road;Unit, City" }, false)
  assert.ok(card.split("\n").includes("FN:Doe\\, Jane"))
  assert.ok(card.split("\n").includes("ORG:A\\;B\\\\C"))
  assert.ok(card.split("\n").includes("ADR;TYPE=WORK:;;Road\\;Unit\\, City"))
})

test("phone, email and URI values cannot introduce lines", () => {
  const card = buildVCard({
    ...profile,
    phone: "+919876543210\r\nURL:https://injected.invalid",
    email: "alex@example.com\nFN:Other",
    website: "https://example.com\rEND:VCARD",
  }, true)
  assert.equal(card.split("\n").filter((line) => line.startsWith("URL:")).length, 1)
  assert.equal(card.split("\n").filter((line) => line.startsWith("FN:")).length, 1)
  assert.equal(card.split("\n").filter((line) => line === "END:VCARD").length, 1)
  assert.ok(!card.includes("\r"))
})

test("contact visibility remains authoritative and blank optional fields stay omitted", () => {
  const privateCard = buildVCard(profile, false)
  assert.doesNotMatch(privateCard, /^TEL|^EMAIL/m)
  const blankCard = buildVCard({ ...profile, phone: "", email: "", address: "", website: "" }, true)
  assert.doesNotMatch(blankCard, /^TEL|^EMAIL|^ADR|^URL/m)
})
