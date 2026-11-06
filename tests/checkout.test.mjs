import test from "node:test"
import assert from "node:assert/strict"
import { clampQty, validCardQuantity, resizeRecipients, validateRecipients } from "../src/lib/checkout-recipients.ts"

const recipient = (index = 1) => ({ full_name: `Recipient ${index}`, email: `person${index}@example.com`, phone: "+44 20 7946 0958" })

for (const count of [1, 2, 3, 5, 10]) {
  test(`${count} cards retain exactly ${count} recipient allocations`, () => {
    const entries = Array.from({ length: count }, (_, index) => recipient(index + 1))
    const result = validateRecipients(entries, count)
    assert.equal(result.valid, true)
    assert.equal(result.recipients.length, count)
  })
}

test("quantity bounds and invalid values", () => {
  assert.equal(clampQty(11), 10)
  assert.equal(clampQty(0), 1)
  assert.equal(clampQty(Number.NaN), 1)
  for (const value of [0, -1, 11, 1.5, Number.NaN, Infinity]) assert.equal(validCardQuantity(value), false)
  assert.equal(clampQty(10 + 1), 10)
  assert.equal(clampQty(1 - 1), 1)
})

test("increasing from3 to5 preserves entered values; decreasing to2 submits only active slots", () => {
  const initial = [recipient(1), recipient(2), recipient(3)]
  const increased = resizeRecipients(initial, 5)
  assert.deepEqual(increased.slice(0, 3), initial)
  assert.equal(increased[4].phone, "")
  const decreased = validateRecipients(increased, 2)
  assert.equal(decreased.valid, true)
  assert.equal(decreased.recipients.length, 2)
  assert.equal(decreased.recipients[1].email, initial[1].email)
})

test("one card requires all3 fields", () => {
  const result = validateRecipients([{ full_name: "", email: "", phone: "" }], 1)
  assert.equal(result.valid, false)
  assert.deepEqual(Object.keys(result.errors[0]).sort(), ["email", "full_name", "phone"])
})

test("international phone and email normalization keep duplicate email allocations separate", () => {
  const input = { full_name: "  Priya   Rao ", email: " Priya@Example.COM ", phone: "+44 (20) 7946-0958" }
  const result = validateRecipients([input, input], 2)
  assert.equal(result.valid, true)
  assert.equal(result.recipients.length, 2)
  assert.deepEqual(result.recipients[0], { full_name: "Priya Rao", email: "priya@example.com", phone: "+442079460958" })
})

test("reject invalid contacts, legacy missing phone and unsupported quantities", () => {
  for (const invalid of [{ ...recipient(), email: "invalid" }, { ...recipient(), phone: "abc" }, { ...recipient(), phone: "123" }, { full_name: "Old contact", email: "old@example.com" }]) {
    assert.equal(validateRecipients(resizeRecipients([invalid], 1), 1).valid, false)
  }
  assert.equal(validateRecipients([recipient()], 0).valid, false)
  assert.equal(validateRecipients(Array.from({ length: 11 }, recipient), 11).valid, false)
})
