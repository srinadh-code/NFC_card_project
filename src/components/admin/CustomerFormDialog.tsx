import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Customer, CustomerStatus } from "@/types"

export interface CustomerFormValues {
  name: string
  email: string
  phone: string
  company: string
  designation: string
  status: CustomerStatus
  line1: string
  city: string
  state: string
  pincode: string
  country: string
}

const EMPTY: CustomerFormValues = {
  name: "",
  email: "",
  phone: "",
  company: "",
  designation: "",
  status: "Active",
  line1: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: Customer | null
  onSubmit: (values: CustomerFormValues) => void
}) {
  const [values, setValues] = useState<CustomerFormValues>(EMPTY)

  useEffect(() => {
    if (open) {
      setValues(
        customer
          ? {
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
              company: customer.company,
              designation: customer.designation,
              status: customer.status,
              line1: customer.address.line1,
              city: customer.address.city,
              state: customer.address.state,
              pincode: customer.address.pincode,
              country: customer.address.country,
            }
          : EMPTY,
      )
    }
  }, [open, customer])

  function set<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function handleSubmit() {
    if (!values.name.trim() || !values.email.trim()) return
    onSubmit(values)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          <DialogDescription>
            {customer ? "Update this customer's details." : "Create a new customer record."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto px-1 py-1 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-name">Full Name</Label>
            <Input id="cf-name" value={values.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-email">Email</Label>
            <Input
              id="cf-email"
              type="email"
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-phone">Phone</Label>
            <Input id="cf-phone" value={values.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-status">Status</Label>
            <Select value={values.status} onValueChange={(v) => set("status", v as CustomerStatus)}>
              <SelectTrigger id="cf-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-company">Company</Label>
            <Input id="cf-company" value={values.company} onChange={(e) => set("company", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-designation">Designation</Label>
            <Input
              id="cf-designation"
              value={values.designation}
              onChange={(e) => set("designation", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="cf-line1">Address Line 1</Label>
            <Input id="cf-line1" value={values.line1} onChange={(e) => set("line1", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-city">City</Label>
            <Input id="cf-city" value={values.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-state">State</Label>
            <Input id="cf-state" value={values.state} onChange={(e) => set("state", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-pincode">Pincode</Label>
            <Input id="cf-pincode" value={values.pincode} onChange={(e) => set("pincode", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-country">Country</Label>
            <Input id="cf-country" value={values.country} onChange={(e) => set("country", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>{customer ? "Save Changes" : "Add Customer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
