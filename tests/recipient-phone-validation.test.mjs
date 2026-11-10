import test from "node:test"
import assert from "node:assert/strict"
import {
  RECIPIENT_PHONE_ERROR,
  isValidIndianMobile,
  recipientErrorsAfterChange,
  recipientPhoneLiveError,
  validateRecipients,
} from "../src/lib/checkout-recipients.ts"

const VALID = ["9876543210", "8765432109", "7654321098", "6654321098", "919876543210", "+919876543210"]
const INVALID = {
  "invalid starting digit": "5876543210",
  "starts with 0": "0987654321",
  "fewer than 10 digits": "987654321",
  "more than 10 digits": "98765432101",
  "+91 with invalid starting digit": "+915876543210",
  "91 with too few digits": "91987654321",
  "91 with too many digits": "9198765432100",
  "letters": "98765abc10",
  "other country code": "+441234567890",
  "inner spaces": "98765 43210",
  "+91 with space": "+91 9876543210",
  "hyphen": "98765-43210",
  "parentheses": "(98765)43210",
  "duplicated +91": "+91919876543210",
  "duplicated 91": "91919876543210",
  "plus without 91": "+9876543210",
  "+ in the middle": "91+9876543210",
  "double plus": "++919876543210",
  "0091 prefix": "00919876543210",
  "full-width digits": "９８７６５４３２１０",
}

const recipient = (index, phone) => ({ full_name: `Recipient ${index}`, email: `person${index}@example.com`, phone })

for (const phone of VALID) {
  test(`accepts valid recipient mobile ${phone}`, () => {
    assert.equal(isValidIndianMobile(phone), true)
    assert.equal(recipientPhoneLiveError(phone), undefined)
    const result = validateRecipients([recipient(1, phone)], 1, { indianMobilePhone: true })
    assert.equal(result.valid, true)
    assert.equal(result.errors[0].phone, undefined)
    // The customer's value is not rewritten: no +91 appended or prefix removed.
    assert.equal(result.recipients[0].phone, phone)
  })
}

for (const [label, phone] of Object.entries(INVALID)) {
  test(`rejects recipient mobile with ${label} (${phone})`, () => {
    assert.equal(isValidIndianMobile(phone), false)
    assert.equal(recipientPhoneLiveError(phone), RECIPIENT_PHONE_ERROR)
    const result = validateRecipients([recipient(1, phone)], 1, { indianMobilePhone: true })
    assert.equal(result.valid, false)
    assert.equal(result.errors[0].phone, "Enter a valid Indian mobile number with or without +91.")
  })
}

test("blank recipient phone keeps the required message and shows no error while typing", () => {
  assert.equal(recipientPhoneLiveError(""), undefined)
  const result = validateRecipients([recipient(1, "")], 1, { indianMobilePhone: true })
  assert.equal(result.errors[0].phone, "Phone Number is required.")
})

test("surrounding whitespace is trimmed but inner spaces are rejected", () => {
  assert.equal(isValidIndianMobile(" 9876543210 "), true)
  assert.equal(isValidIndianMobile("98765 43210"), false)
})

test("live validation shows the error while typing and clears it once valid", () => {
  let errors = []
  errors = recipientErrorsAfterChange(errors, 0, "phone", "98765")
  assert.equal(errors[0].phone, RECIPIENT_PHONE_ERROR)
  errors = recipientErrorsAfterChange(errors, 0, "phone", "9876543210")
  assert.equal(errors[0].phone, undefined)
  errors = recipientErrorsAfterChange(errors, 0, "phone", "+9198765abc")
  assert.equal(errors[0].phone, RECIPIENT_PHONE_ERROR)
  errors = recipientErrorsAfterChange(errors, 0, "phone", "")
  assert.equal(errors[0].phone, undefined)
})

test("live validation targets only the edited recipient, including slots not yet in the error list", () => {
  const previous = [{ email: "Please enter a valid email address." }]
  const next = recipientErrorsAfterChange(previous, 2, "phone", "12345")
  assert.equal(next.length, 3)
  assert.deepEqual(next[0], { email: "Please enter a valid email address." })
  assert.deepEqual(next[1], {})
  assert.equal(next[2].phone, RECIPIENT_PHONE_ERROR)
  assert.deepEqual(previous, [{ email: "Please enter a valid email address." }], "input is not mutated")
})

test("editing other fields still clears just that field's error", () => {
  const previous = [{ full_name: "Full Name is required.", phone: RECIPIENT_PHONE_ERROR }]
  const next = recipientErrorsAfterChange(previous, 0, "full_name", "Priya")
  assert.equal(next[0].full_name, undefined)
  assert.equal(next[0].phone, RECIPIENT_PHONE_ERROR)
})

test("multiple recipients with different accepted formats all pass", () => {
  const recipients = [recipient(1, "9876543210"), recipient(2, "919876543211"), recipient(3, "+916654321098")]
  const result = validateRecipients(recipients, 3, { indianMobilePhone: true })
  assert.equal(result.valid, true)
  assert.ok(result.errors.every((entry) => Object.keys(entry).length === 0))
})

test("one invalid recipient number blocks progression and is flagged on the correct recipient only", () => {
  const recipients = [recipient(1, "9876543210"), recipient(2, "5876543210"), recipient(3, "+919876543210")]
  const result = validateRecipients(recipients, 3, { indianMobilePhone: true })
  assert.equal(result.valid, false)
  assert.equal(result.errors[0].phone, undefined)
  assert.equal(result.errors[1].phone, RECIPIENT_PHONE_ERROR)
  assert.equal(result.errors[2].phone, undefined)
})

test("several invalid recipient numbers are all reported", () => {
  const recipients = [recipient(1, "+441234567890"), recipient(2, "9876543210"), recipient(3, "98765abc10")]
  const result = validateRecipients(recipients, 3, { indianMobilePhone: true })
  assert.equal(result.valid, false)
  assert.equal(result.errors[0].phone, RECIPIENT_PHONE_ERROR)
  assert.equal(result.errors[1].phone, undefined)
  assert.equal(result.errors[2].phone, RECIPIENT_PHONE_ERROR)
})

test("recipient email and name rules are unchanged by the mobile rule", () => {
  const result = validateRecipients(
    [{ full_name: "", email: "Same@Example.com", phone: "9876543210" }, { full_name: "B", email: "same@example.com", phone: "9876543211" }],
    2,
    { indianMobilePhone: true },
  )
  assert.equal(result.errors[0].full_name, "Full Name is required.")
  assert.equal(result.errors[0].email, "Use a different email address for each NFC card.")
  assert.equal(result.errors[1].email, "Use a different email address for each NFC card.")
})

test("without the recipient option the original 7-15 digit rule (used for the purchaser) is unchanged", () => {
  const result = validateRecipients([{ full_name: "Purchaser", email: "p@example.com", phone: "+44 (20) 7946-0958" }], 1)
  assert.equal(result.valid, true)
  assert.equal(result.recipients[0].phone, "+442079460958")
  const bad = validateRecipients([{ full_name: "Purchaser", email: "p@example.com", phone: "123" }], 1)
  assert.equal(bad.errors[0].phone, "Enter a valid phone number with 7 to 15 digits, including country code if needed.")
})
