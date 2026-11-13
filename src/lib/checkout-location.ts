import type { DetectedAddress } from "@/lib/api"

export interface CheckoutAddressFields {
  address_line1: string
  address_line2: string
  landmark: string
  locality: string
  city: string
  district: string
  state: string
  pincode: string
}

export class CurrentLocationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CurrentLocationError"
  }
}

// A coarse network fix can identify the wrong street or postal area.
const MAX_CHECKOUT_ACCURACY_METRES = 100

export function getCurrentCoordinates(
  geolocation: Pick<Geolocation, "getCurrentPosition">,
): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude, accuracy } = coords
        if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
          || !Number.isFinite(longitude) || Math.abs(longitude) > 180
          || !Number.isFinite(accuracy) || accuracy < 0) {
          reject(new CurrentLocationError("Your location accuracy is unavailable. Please try again, or enter your address manually."))
        } else if (accuracy > MAX_CHECKOUT_ACCURACY_METRES) {
          reject(new CurrentLocationError(`Your browser provided only an approximate location (within about ${Math.ceil(accuracy)} metres). Your address has not been changed. Please enable precise location and try again, or enter your address manually.`))
        } else {
          resolve({ latitude, longitude })
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new CurrentLocationError("Location permission was denied. Allow location access in your browser, or enter your address manually."))
        } else if (error.code === error.TIMEOUT) {
          reject(new CurrentLocationError("The location request timed out. Please try again, or enter your address manually."))
        } else {
          reject(new CurrentLocationError("Your location is unavailable. Please try again, or enter your address manually."))
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}

export async function detectAddressFromCurrentLocation(
  geolocation: Pick<Geolocation, "getCurrentPosition">,
  reverseGeocode: (latitude: number, longitude: number) => Promise<DetectedAddress>,
): Promise<DetectedAddress> {
  const coordinates = await getCurrentCoordinates(geolocation)
  const detected = await reverseGeocode(coordinates.latitude, coordinates.longitude)
  assertDetectedAddressDetails(detected)
  return detected
}

export function assertDetectedAddressDetails(detected: DetectedAddress | null | undefined): asserts detected is DetectedAddress {
  if (!detected || ![detected.address_line1, detected.locality, detected.city, detected.district, detected.state, detected.pincode].some((value) => value?.trim())) {
    throw new CurrentLocationError("No address details were found at your location. Please enter your address manually.")
  }
}

export function mergeDetectedAddress(
  current: CheckoutAddressFields,
  detected: DetectedAddress,
  protectedFields: ReadonlySet<keyof CheckoutAddressFields> = new Set(),
): CheckoutAddressFields {
  const keys: (keyof CheckoutAddressFields)[] = [
    "address_line1",
    "address_line2",
    "landmark",
    "locality",
    "city",
    "district",
    "state",
    "pincode",
  ]
  return keys.reduce((result, key) => {
    const value = detected[key]?.trim()
    if (value && !current[key].trim() && !protectedFields.has(key)) result[key] = value
    return result
  }, { ...current })
}
