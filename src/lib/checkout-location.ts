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

export function getCurrentCoordinates(
  geolocation: Pick<Geolocation, "getCurrentPosition">,
): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new CurrentLocationError("Location permission was denied. Allow location access in your browser, or enter your address manually."))
        } else if (error.code === error.TIMEOUT) {
          reject(new CurrentLocationError("The location request timed out. Please try again, or enter your address manually."))
        } else {
          reject(new CurrentLocationError("Your location is unavailable. Please try again, or enter your address manually."))
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  })
}

export async function detectAddressFromCurrentLocation(
  geolocation: Pick<Geolocation, "getCurrentPosition">,
  reverseGeocode: (latitude: number, longitude: number) => Promise<DetectedAddress>,
): Promise<DetectedAddress> {
  const coordinates = await getCurrentCoordinates(geolocation)
  return reverseGeocode(coordinates.latitude, coordinates.longitude)
}

export function mergeDetectedAddress(
  current: CheckoutAddressFields,
  detected: DetectedAddress,
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
    if (value) result[key] = value
    return result
  }, { ...current })
}
