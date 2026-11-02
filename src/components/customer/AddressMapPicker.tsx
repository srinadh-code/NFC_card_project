import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { CheckCircle2, Loader2, LocateFixed, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiError, customerAddressApi, type DetectedAddress, type PlaceSearchResult } from "@/lib/api"

export interface MapPoint {
  lat: number
  lng: number
}

const INDIA_CENTER: L.LatLngTuple = [22.5, 79]
const INDIA_ZOOM = 5
const PIN_ZOOM = 17
const SEARCH_MIN_LENGTH = 3
const SEARCH_DEBOUNCE_MS = 350

// Brand-coloured SVG pin instead of Leaflet's default PNG marker (whose
// image URLs don't survive bundling). Anchored at the pin's tip.
const PIN_ICON = L.divIcon({
  className: "",
  html: `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1Z" fill="#4f46e5" stroke="#fff" stroke-width="2"/>
    <circle cx="16" cy="15.5" r="5.5" fill="#fff"/></svg>`,
  iconSize: [32, 42],
  iconAnchor: [16, 41],
})

type Status =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "detecting" }
  | { kind: "detected" }
  | { kind: "error"; message: string }

function geolocationMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED)
    return "Location access is blocked. Allow it in your browser settings, or search / tap the map instead."
  if (err.code === err.TIMEOUT) return "Finding your location took too long. Please try again, or search for it."
  return "We couldn't get your current location. Please search for it or tap the map."
}

/**
 * "Choose on Map" — OpenStreetMap map with place search (autocomplete),
 * click-to-place / draggable pin and "Use My Current Location". Every way
 * of picking a spot ends in the same reverse lookup, whose result is handed
 * to the address form (AddressFormDialog) to fill its existing fields —
 * this component never saves anything itself. Lazy-loaded so Leaflet is
 * only downloaded when a customer actually opens the map.
 */
export default function AddressMapPicker({
  value,
  onDetected,
}: {
  /** The current pin (e.g. an address saved earlier with a map location). */
  value: MapPoint | null
  onDetected: (address: DetectedAddress) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const requestRef = useRef(0)
  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected
  const [status, setStatus] = useState<Status>({ kind: "idle" })

  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [listOpen, setListOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // The map's current view — ranks search results near what's on screen.
  const [view, setView] = useState<(MapPoint & { zoom: number }) | null>(value ? { ...value, zoom: PIN_ZOOM } : null)

  // Drop the pin at a spot and look up its address. Later picks supersede
  // earlier ones still in flight (rapid clicks / drags).
  const placeRef = useRef<(point: MapPoint, zoom?: number) => void>(() => {})
  placeRef.current = (point, zoom) => {
    const map = mapRef.current
    if (!map) return
    const latLng = L.latLng(point.lat, point.lng)
    if (markerRef.current) markerRef.current.setLatLng(latLng)
    else markerRef.current = createMarker(latLng)
    if (zoom) map.flyTo(latLng, Math.max(map.getZoom(), zoom), { duration: 0.6 })
    else map.panTo(latLng)

    const requestId = ++requestRef.current
    setStatus({ kind: "detecting" })
    customerAddressApi
      .reverseGeocode(point.lat, point.lng)
      .then((detected) => {
        if (requestId !== requestRef.current) return
        setStatus({ kind: "detected" })
        onDetectedRef.current(detected)
      })
      .catch((err) => {
        if (requestId !== requestRef.current) return
        setStatus({
          kind: "error",
          message:
            err instanceof ApiError && err.status !== 503 && err.status < 500
              ? err.message
              : "We couldn't look up this location right now. Please try again, or enter the address manually.",
        })
      })
  }

  function createMarker(latLng: L.LatLng) {
    const marker = L.marker(latLng, { icon: PIN_ICON, draggable: true, keyboard: true, title: "Delivery location" })
    marker.on("dragend", () => {
      const { lat, lng } = marker.getLatLng()
      placeRef.current({ lat, lng })
    })
    return marker.addTo(mapRef.current!)
  }

  // Map set-up, once. The initial pin (editing an address saved with a map
  // location) is shown without re-detecting — the form already holds it.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const map = L.map(container, { zoomControl: true, attributionControl: true }).setView(
      value ? [value.lat, value.lng] : INDIA_CENTER,
      value ? PIN_ZOOM : INDIA_ZOOM,
    )
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    mapRef.current = map
    if (value) createMarker(L.latLng(value.lat, value.lng))
    map.on("click", (e: L.LeafletMouseEvent) => placeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }))
    map.on("moveend", () => {
      const c = map.getCenter()
      setView({ lat: c.lat, lng: c.lng, zoom: map.getZoom() })
    })
    // The dialog animates/resizes around the map — keep tiles aligned.
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)
    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial view only
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // Bias by the map view only once zoomed in — at country level it would
  // just favour central India.
  const searchNear =
    view && view.zoom >= 10 ? { lat: Number(view.lat.toFixed(1)), lng: Number(view.lng.toFixed(1)) } : undefined
  const searchEnabled = debouncedQuery.length >= SEARCH_MIN_LENGTH
  const search = useQuery({
    queryKey: ["place-search", debouncedQuery, searchNear?.lat, searchNear?.lng],
    queryFn: () => customerAddressApi.searchPlaces(debouncedQuery, searchNear),
    enabled: searchEnabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const results = searchEnabled ? (search.data ?? []) : []
  const showList = listOpen && searchEnabled && query.trim().length >= SEARCH_MIN_LENGTH

  function choose(result: PlaceSearchResult) {
    setQuery(result.title)
    setListOpen(false)
    setActiveIndex(-1)
    placeRef.current({ lat: result.latitude, lng: result.longitude }, PIN_ZOOM)
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList || results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      choose(results[Math.max(activeIndex, 0)])
    } else if (e.key === "Escape") {
      // AddressFormDialog keeps the dialog open while this list is open.
      setListOpen(false)
    }
  }

  function locateMe() {
    if (!("geolocation" in navigator)) {
      setStatus({ kind: "error", message: "Your browser doesn't support location access. Please search or tap the map." })
      return
    }
    setStatus({ kind: "locating" })
    navigator.geolocation.getCurrentPosition(
      (pos) => placeRef.current({ lat: pos.coords.latitude, lng: pos.coords.longitude }, PIN_ZOOM),
      (err) => setStatus({ kind: "error", message: geolocationMessage(err) }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  return (
    <div className="space-y-2.5 rounded-2xl border border-border bg-muted/30 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            role="combobox"
            aria-label="Search for your location"
            aria-expanded={showList}
            aria-controls="addr-map-results"
            aria-autocomplete="list"
            aria-activedescendant={showList && activeIndex >= 0 ? `addr-map-result-${activeIndex}` : undefined}
            placeholder="Search area or landmark"
            className="pl-9"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setListOpen(true)
              setActiveIndex(-1)
            }}
            onFocus={() => setListOpen(true)}
            onBlur={() => setListOpen(false)}
            onKeyDown={handleSearchKeyDown}
          />
          {showList && (
            <ul
              id="addr-map-results"
              role="listbox"
              className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
            >
              {search.isFetching && results.length === 0 ? (
                <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Searching…
                </li>
              ) : search.isError ? (
                <li className="px-3 py-2 text-sm text-destructive">
                  {search.error instanceof ApiError ? search.error.message : "Search isn't available right now."}
                </li>
              ) : results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">No places found in India. Try another name.</li>
              ) : (
                results.map((result, i) => (
                  <li
                    key={`${result.latitude},${result.longitude},${result.title}`}
                    id={`addr-map-result-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    // mousedown, not click — fires before the input's blur closes the list.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      choose(result)
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`cursor-pointer rounded-lg px-3 py-2 ${i === activeIndex ? "bg-accent text-accent-foreground" : ""}`}
                  >
                    <p className="text-sm font-medium">{result.title}</p>
                    {result.subtitle && <p className="text-xs text-muted-foreground">{result.subtitle}</p>}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        <Button type="button" variant="outline" onClick={locateMe} disabled={status.kind === "locating"}>
          {status.kind === "locating" ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          Use My Current Location
        </Button>
      </div>

      {/* `isolate` keeps Leaflet's internal z-indexes (up to 1000) inside the
          map, so they can't cover the search list or the dialog. */}
      <div
        ref={containerRef}
        className="isolate h-64 w-full overflow-hidden rounded-xl sm:h-72"
        role="application"
        aria-label="Map — tap to place the delivery pin, or drag the pin to adjust"
      />

      <div aria-live="polite" className="min-h-5 text-sm">
        {status.kind === "locating" ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Finding your current location…
          </p>
        ) : status.kind === "detecting" ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Finding the address at this spot…
          </p>
        ) : status.kind === "detected" ? (
          <p className="flex items-start gap-1.5 text-success">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            Address details filled from the map. Check them below and add your house / flat number.
          </p>
        ) : status.kind === "error" ? (
          <p className="text-destructive">{status.message}</p>
        ) : (
          <p className="text-muted-foreground">
            {value ? "Drag the pin or tap the map to change the location." : "Search, use your current location, or tap the map to drop a pin."}
          </p>
        )}
      </div>
    </div>
  )
}
