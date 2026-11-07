import test from "node:test"
import assert from "node:assert/strict"
import { clampQty, validCardQuantity, resizeRecipients, validateRecipients } from "../src/lib/checkout-recipients.ts"
import { CurrentLocationError, detectAddressFromCurrentLocation, mergeDetectedAddress } from "../src/lib/checkout-location.ts"

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

test("international phone and email normalization reject duplicate email allocations", () => {
  const input = { full_name: "  Priya   Rao ", email: " Priya@Example.COM ", phone: "+44 (20) 7946-0958" }
  const second = { ...input, full_name: "Another Recipient", email: "another@example.com" }
  const result = validateRecipients([input, second], 2)
  assert.equal(result.valid, true)
  assert.equal(result.recipients.length, 2)
  assert.deepEqual(result.recipients[0], { full_name: "Priya Rao", email: "priya@example.com", phone: "+442079460958" })

  const duplicate = validateRecipients([input, { ...input, email: "priya@example.com" }], 2)
  assert.equal(duplicate.valid, false)
  assert.equal(duplicate.errors[0].email, "Use a different email address for each NFC card.")
  assert.equal(duplicate.errors[1].email, "Use a different email address for each NFC card.")
})

test("reject invalid contacts, legacy missing phone and unsupported quantities", () => {
  for (const invalid of [{ ...recipient(), email: "invalid" }, { ...recipient(), phone: "abc" }, { ...recipient(), phone: "123" }, { full_name: "Old contact", email: "old@example.com" }]) {
    assert.equal(validateRecipients(resizeRecipients([invalid], 1), 1).valid, false)
  }
  assert.equal(validateRecipients([recipient()], 0).valid, false)
  assert.equal(validateRecipients(Array.from({ length: 11 }, recipient), 11).valid, false)
})

const detectedAddress = {
  latitude: 17.385,
  longitude: 78.4867,
  address_line1: "12, Abids Road",
  address_line2: "Abids",
  landmark: "City Library",
  locality: "Moazzampura",
  city: "Hyderabad",
  district: "Hyderabad",
  state: "Telangana",
  pincode: "500001",
  country: "India",
  display_name: "12, Abids Road, Hyderabad",
}

function fakeGeolocation(result) {
  return {
    getCurrentPosition(success, failure, options) {
      this.options = options
      result(success, failure)
    },
  }
}

test("granted location permission reverse-geocodes coordinates into address fields", async () => {
  const geolocation = fakeGeolocation((success) => success({
    coords: { latitude: detectedAddress.latitude, longitude: detectedAddress.longitude },
  }))
  let receivedCoordinates
  const reverseGeocode = async (latitude, longitude) => {
    receivedCoordinates = [latitude, longitude]
    return detectedAddress
  }

  const result = await detectAddressFromCurrentLocation(geolocation, reverseGeocode)

  assert.deepEqual(result, detectedAddress)
  assert.deepEqual(receivedCoordinates, [detectedAddress.latitude, detectedAddress.longitude])
  assert.deepEqual(geolocation.options, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 })
})

test("denied, unavailable, and timed-out location requests report distinct errors", async () => {
  const cases = [
    [1, "Location permission was denied"],
    [2, "location is unavailable"],
    [3, "request timed out"],
  ]
  for (const [code, message] of cases) {
    const geolocation = fakeGeolocation((_, failure) => failure({
      code,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    }))
    await assert.rejects(
      detectAddressFromCurrentLocation(geolocation, async () => detectedAddress),
      (error) => error instanceof CurrentLocationError && error.message.includes(message),
    )
  }
})

test("reverse-geocoding failures are surfaced without changing entered address values", async () => {
  const geolocation = fakeGeolocation((success) => success({
    coords: { latitude: detectedAddress.latitude, longitude: detectedAddress.longitude },
  }))
  const manuallyEntered = {
    address_line1: "Manual House 5",
    address_line2: "",
    landmark: "",
    locality: "",
    city: "",
    district: "",
    state: "",
    pincode: "",
  }

  await assert.rejects(
    detectAddressFromCurrentLocation(geolocation, async () => { throw new Error("reverse service unavailable") }),
    /reverse service unavailable/,
  )
  assert.equal(manuallyEntered.address_line1, "Manual House 5")
})

test("detected values fill available fields while preserving fields without reliable results and later edits", () => {
  const initial = {
    address_line1: "",
    address_line2: "",
    landmark: "",
    locality: "",
    city: "",
    district: "",
    state: "",
    pincode: "",
  }
  const detected = mergeDetectedAddress(initial, detectedAddress)
  const edited = { ...detected, address_line1: "Customer's edited house number" }
  const partialResult = mergeDetectedAddress(edited, { ...detectedAddress, address_line1: "", district: "" })

  assert.equal(detected.city, "Hyderabad")
  assert.equal(detected.pincode, "500001")
  assert.equal(partialResult.address_line1, "Customer's edited house number")
  assert.equal(partialResult.district, "Hyderabad")
  assert.equal(partialResult.state, "Telangana")
})
