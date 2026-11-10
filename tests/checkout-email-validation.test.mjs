import test from "node:test"
import assert from "node:assert/strict"
import { checkoutEmailError } from "../src/lib/checkout-email-validation.ts"

test("checkout email validation rejects empty and incomplete addresses", () => {
  for (const email of ["", "   ", "kavya", "kavya@", "kavya@gmail", "@gmail.com", "kavya@gmail."]) {
    assert.notEqual(checkoutEmailError(email), null, `expected ${JSON.stringify(email)} to be rejected`)
  }
})

test("checkout email validation accepts common email addresses and trims surrounding spaces", () => {
  for (const email of ["kavya@gmail.com", "user.name@outlook.com", "kavya123@yahoo.com", "  kavya@gmail.com  "]) {
    assert.equal(checkoutEmailError(email), null, `expected ${JSON.stringify(email)} to be accepted`)
  }
})

test("checkout email validation rejects malformed local and domain parts", () => {
  for (const email of ["user..name@example.com", ".user@example.com", "user@-example.com", "user@example..com", "user name@example.com"]) {
    assert.notEqual(checkoutEmailError(email), null, `expected ${JSON.stringify(email)} to be rejected`)
  }
})
