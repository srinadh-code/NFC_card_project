import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
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
import { ApiError, customerAddressApi, type CustomerAddressInput } from "@/lib/api"
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

  useEffect(() => {
    if (open) {
      setForm(address ? fromAddress(address) : EMPTY_FORM)
      setSetDefault(address?.isDefault ?? false)
      setTouched({})
      setSubmitAttempted(false)
    }
  }, [open, address])

  const errors = useMemo(() => computeErrors(form), [form])
  const isValid = Object.keys(errors).length === 0

  function update<K extends FieldKey>(key: K, value: AddressForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }
  function markTouched(key: FieldKey) {
    setTouched((t) => ({ ...t, [key]: true }))
  }
  function showError(key: FieldKey): string | undefined {
    if (!touched[key] && !submitAttempted) return undefined
    return errors[key]
  }

  async function handleSubmit() {
    setSubmitAttempted(true)
    if (!isValid) {
      toast.error("Please fix the highlighted fields.")
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
          <DialogDescription>Used for delivering your NEXORA NFC card orders.</DialogDescription>
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
            <Input id="addr-locality" value={form.locality} onChange={(e) => update("locality", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="addr-city">City</Label>
            <Input
              id="addr-city"
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
              value={form.district}
              onChange={(e) => update("district", e.target.value)}
              onBlur={() => markTouched("district")}
              aria-invalid={!!showError("district")}
            />
            {showError("district") && <p className="text-sm text-destructive">{showError("district")}</p>}
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
              aria-invalid={!!showError("pincode")}
            />
            {showError("pincode") && <p className="text-sm text-destructive">{showError("pincode")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="addr-country">Country</Label>
            <Input id="addr-country" value={COUNTRY} disabled />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={setDefault} onCheckedChange={(v) => setSetDefault(v === true)} />
          Set as default address
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Save Address"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
