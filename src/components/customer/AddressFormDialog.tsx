import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { INDIAN_STATES } from "@/data/indian-states"
import {
  validateAddressLine1,
  validateAddressLine2,
  validateCity,
  validateDistrict,
  validateLandmark,
  validateName,
  validatePhone,
  validatePincode,
  validateState,
  validateVillage,
} from "@/lib/address-validation"
import { ApiError, customerAddressApi, fieldErrorMessage, type CustomerAddressInput } from "@/lib/api"
import type { CustomerAddress } from "@/types"

interface AddressForm {
  label: string
  fullName: string
  phone: string
  addressLine1: string
  addressLine2: string
  landmark: string
  locality: string
  city: string
  district: string
  state: string
  pincode: string
}

const EMPTY_FORM: AddressForm = {
  label: "",
  fullName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  locality: "",
  city: "",
  district: "",
  state: "",
  pincode: "",
}

const COUNTRY = "India"

function fromAddress(address: CustomerAddress): AddressForm {
  return {
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    landmark: address.landmark,
    locality: address.locality,
    city: address.city,
    district: address.district,
    state: address.state,
    pincode: address.pincode,
  }
}

type FieldKey = keyof AddressForm

function computeErrors(form: AddressForm): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {}
  const set = (key: FieldKey, message: string | null) => {
    if (message) errors[key] = message
  }
  set("fullName", validateName(form.fullName))
  set("phone", validatePhone(form.phone))
  set("addressLine1", validateAddressLine1(form.addressLine1))
  set("addressLine2", validateAddressLine2(form.addressLine2))
  set("landmark", validateLandmark(form.landmark))
  set("locality", validateVillage(form.locality))
  set("city", validateCity(form.city))
  set("district", validateDistrict(form.district))
  set("state", validateState(form.state))
  set("pincode", validatePincode(form.pincode))
  return errors
}

// Fields the backend's PIN verification can reject (customer_addresses/
// pincode.py) — their server messages are shown inline under each field.
const VERIFIED_FIELDS = ["pincode", "state", "district", "city", "locality"] as const
// Backend asks the customer to confirm a district India Post doesn't list
// for this PIN (customer_addresses/pincode.py DISTRICT_CONFIRMATION_KEY).
const DISTRICT_CONFIRMATION_KEY = "district_confirmation_required"
type VerifiedField = (typeof VERIFIED_FIELDS)[number]

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** "Govindaraopet, Tadvai, Chalvai +12 more" — the PIN's post offices/mandals. */
function summarizePlaces(names: string[], limit = 3): string {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  const shown = unique.slice(0, limit).join(", ")
  return unique.length > limit ? `${shown} +${unique.length - limit} more` : shown
}

/**
 * The one shared "add/edit a saved delivery address" form — used by the
 * customer's Addresses page (My Profile > Addresses) and by Checkout's
 * inline "Add New Address" flow, so both go through the exact same
 * validation (address-validation.ts) and the exact same
 * customerAddressApi create/update calls instead of duplicating either.
 */
export function AddressFormDialog({
  open,
  onOpenChange,
  address,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present -> editing this address. Absent -> creating a new one. */
  address?: CustomerAddress | null
  onSaved: (address: CustomerAddress) => void
}) {
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM)
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [setDefault, setSetDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverErrors, setServerErrors] = useState<Partial<Record<VerifiedField, string>>>({})
  const [districtConfirmPrompt, setDistrictConfirmPrompt] = useState<string | null>(null)
  const [confirmDistrict, setConfirmDistrict] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(address ? fromAddress(address) : EMPTY_FORM)
      setSetDefault(address?.isDefault ?? false)
      setTouched({})
      setSubmitAttempted(false)
      setServerErrors({})
      setDistrictConfirmPrompt(null)
      setConfirmDistrict(false)
    }
  }, [open, address])

  // Live India Post lookup once the PIN is a well-formed 6 digits. Only a
  // preview/auto-fill — the backend re-verifies on save regardless.
  const pinFormatOk = validatePincode(form.pincode) === null
  const pinQuery = useQuery({
    queryKey: ["pincode-lookup", form.pincode],
    queryFn: () => customerAddressApi.lookupPincode(form.pincode),
    enabled: open && pinFormatOk,
    staleTime: Infinity,
    retry: (count, err) => !(err instanceof ApiError && err.status === 400) && count < 1,
  })
  const pinLocation = pinFormatOk ? pinQuery.data : undefined
  const pinChecking = pinFormatOk && pinQuery.isFetching
  const pinLookupError =
    pinFormatOk && pinQuery.isError
      ? pinQuery.error instanceof ApiError && pinQuery.error.status === 400
        ? pinQuery.error.message
        : "We couldn't verify your PIN code right now. Please try again in a moment."
      : null
  const pinStateMismatch =
    pinLocation && form.state && !pinLocation.states.some((s) => sameText(s, form.state))
      ? `PIN code ${pinLocation.pincode} belongs to ${pinLocation.state}, not ${form.state}. Please check the PIN code or state.`
      : null

  // Fill only empty State/District from the PIN — never overwrite what the
  // customer chose, or a wrong PIN would silently "fix" a right address.
  // District only when unambiguous: India Post's own district can be a
  // pre-reorganisation one (506344 -> "Warangal", now Mulugu), so a legacy
  // district with several present-day successors is offered as
  // suggestions instead.
  useEffect(() => {
    if (!pinLocation) return
    setForm((f) => ({
      ...f,
      state: f.state || pinLocation.state,
      district:
        f.district || (pinLocation.current_districts.length === 1 ? pinLocation.current_districts[0] : f.district),
    }))
  }, [pinLocation])

  const errors = useMemo(() => computeErrors(form), [form])
  const isValid = Object.keys(errors).length === 0
  // While the backend is only asking to confirm the district, the PIN and
  // locality are already proven — keep the PIN field green and let the
  // district prompt carry the message instead of repeating it here.
  const pinServerError = districtConfirmPrompt ? undefined : serverErrors.pincode
  const pinVerified = Boolean(pinLocation) && !pinStateMismatch && !pinServerError

  function update<K extends FieldKey>(key: K, value: AddressForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    if ((VERIFIED_FIELDS as readonly string[]).includes(key)) {
      setServerErrors({})
      setDistrictConfirmPrompt(null)
      setConfirmDistrict(false)
    }
  }
  function markTouched(key: FieldKey) {
    setTouched((t) => ({ ...t, [key]: true }))
  }
  function showError(key: FieldKey): string | undefined {
    const server = serverErrors[key as VerifiedField]
    if (server) return server
    if (!touched[key] && !submitAttempted) return undefined
    return errors[key]
  }
  const pincodeError =
    (districtConfirmPrompt ? undefined : showError("pincode")) ?? pinLookupError ?? pinStateMismatch ?? undefined

  async function handleSubmit() {
    setSubmitAttempted(true)
    if (!isValid) {
      toast.error("Please fix the highlighted fields.")
      return
    }
    if (pinChecking) return
    if (pinLookupError || pinStateMismatch) {
      toast.error(pinLookupError ?? pinStateMismatch)
      return
    }
    const payload: CustomerAddressInput = {
      label: form.label.trim(),
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim(),
      landmark: form.landmark.trim(),
      locality: form.locality.trim(),
      city: form.city.trim(),
      district: form.district.trim(),
      state: form.state.trim(),
      pincode: form.pincode.trim(),
      country: COUNTRY,
      confirmDistrict: Boolean(districtConfirmPrompt) && confirmDistrict,
    }
    setSaving(true)
    try {
      const saved = address
        ? await customerAddressApi.update(address.id, payload)
        : await customerAddressApi.create(payload)
      const finalAddress =
        setDefault && !saved.isDefault ? await customerAddressApi.setDefault(saved.id) : saved
      toast.success(address ? "Address updated." : "Address added.")
      onSaved(finalAddress)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors: Partial<Record<VerifiedField, string>> = {}
        for (const key of VERIFIED_FIELDS) {
          const message = fieldErrorMessage(err.errors, key)
          if (message) fieldErrors[key] = message
        }
        setServerErrors(fieldErrors)
        setDistrictConfirmPrompt(fieldErrorMessage(err.errors, DISTRICT_CONFIRMATION_KEY))
        setConfirmDistrict(false)
      }
      toast.error(err instanceof ApiError ? err.message : "Couldn't save this address. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{address ? "Edit Address" : "Add New Address"}</DialogTitle>
          <DialogDescription>Used for delivering your VR's GATEWAY NFC card orders.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="addr-label">
              Label <span className="text-muted-foreground">(optional — e.g. Home, Office)</span>
            </Label>
            <Input id="addr-label" value={form.label} onChange={(e) => update("label", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="addr-fullName">Full Name</Label>
            <Input
              id="addr-fullName"
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              onBlur={() => markTouched("fullName")}
              aria-invalid={!!showError("fullName")}
            />
            {showError("fullName") && <p className="text-sm text-destructive">{showError("fullName")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="addr-phone">Mobile Number</Label>
            <Input
              id="addr-phone"
              placeholder="9876543210"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              onBlur={() => markTouched("phone")}
              aria-invalid={!!showError("phone")}
            />
            {showError("phone") && <p className="text-sm text-destructive">{showError("phone")}</p>}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="addr-line1">Address Line 1</Label>
            <Input
              id="addr-line1"
              placeholder="Flat / House No., Building, Street"
              value={form.addressLine1}
              onChange={(e) => update("addressLine1", e.target.value)}
              onBlur={() => markTouched("addressLine1")}
              aria-invalid={!!showError("addressLine1")}
            />
            {showError("addressLine1") && <p className="text-sm text-destructive">{showError("addressLine1")}</p>}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="addr-line2">
              Address Line 2 <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input id="addr-line2" value={form.addressLine2} onChange={(e) => update("addressLine2", e.target.value)} />
            {showError("addressLine2") && <p className="text-sm text-destructive">{showError("addressLine2")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="addr-landmark">
              Landmark <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input id="addr-landmark" value={form.landmark} onChange={(e) => update("landmark", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="addr-locality">
              Village / Locality <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="addr-locality"
              list="addr-pin-offices"
              value={form.locality}
              onChange={(e) => update("locality", e.target.value)}
              aria-invalid={!!showError("locality")}
            />
            {showError("locality") && <p className="text-sm text-destructive">{showError("locality")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="addr-city">City</Label>
            <Input
              id="addr-city"
              list="addr-pin-places"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              onBlur={() => markTouched("city")}
              aria-invalid={!!showError("city")}
            />
            {showError("city") && <p className="text-sm text-destructive">{showError("city")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="addr-district">District</Label>
            <Input
              id="addr-district"
              list="addr-pin-districts"
              value={form.district}
              onChange={(e) => update("district", e.target.value)}
              onBlur={() => markTouched("district")}
              aria-invalid={!!showError("district")}
            />
            {showError("district") && !districtConfirmPrompt && (
              <p className="text-sm text-destructive">{showError("district")}</p>
            )}
            {districtConfirmPrompt && (
              <div className="space-y-1.5">
                <p className="text-sm text-destructive">{districtConfirmPrompt}</p>
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <Checkbox
                    className="mt-0.5"
                    checked={confirmDistrict}
                    onCheckedChange={(v) => setConfirmDistrict(v === true)}
                  />
                  Yes, {form.district.trim() || "this district"} is correct
                </label>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="addr-state">State</Label>
            <Select
              value={form.state}
              onValueChange={(v) => {
                update("state", v)
                markTouched("state")
              }}
            >
              <SelectTrigger id="addr-state" className="w-full" aria-invalid={!!showError("state")}>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showError("state") && <p className="text-sm text-destructive">{showError("state")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="addr-pincode">PIN Code</Label>
            <Input
              id="addr-pincode"
              inputMode="numeric"
              placeholder="500001"
              value={form.pincode}
              onChange={(e) => update("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
              onBlur={() => markTouched("pincode")}
              aria-invalid={!!pincodeError}
              aria-describedby="addr-pincode-status"
            />
            <div id="addr-pincode-status" aria-live="polite">
              {pincodeError ? (
                <p className="text-sm text-destructive">{pincodeError}</p>
              ) : pinChecking ? (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Verifying PIN code…
                </p>
              ) : pinVerified && pinLocation ? (
                <p className="flex items-start gap-1.5 text-sm text-success">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                  {pinLocation.state} · serves {summarizePlaces([...pinLocation.post_offices, ...pinLocation.blocks])}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="addr-country">Country</Label>
            <Input id="addr-country" value={COUNTRY} disabled />
          </div>
        </div>

        {/* Auto-fill suggestions from the PIN lookup above. */}
        <datalist id="addr-pin-offices">
          {pinLocation?.post_offices.map((name) => <option key={name} value={name} />)}
        </datalist>
        <datalist id="addr-pin-districts">
          {pinLocation &&
            [...new Set([...pinLocation.current_districts, ...pinLocation.districts])].map((name) => (
              <option key={name} value={name} />
            ))}
        </datalist>
        <datalist id="addr-pin-places">
          {pinLocation &&
            [...new Set([...pinLocation.blocks, ...pinLocation.current_districts, ...pinLocation.post_offices])].map(
              (name) => <option key={name} value={name} />,
            )}
        </datalist>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={setDefault} onCheckedChange={(v) => setSetDefault(v === true)} />
          Set as default address
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || pinChecking}>
            {saving ? "Saving..." : pinChecking ? "Verifying PIN…" : "Save Address"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
