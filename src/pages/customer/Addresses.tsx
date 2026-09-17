import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AddressFormDialog } from "@/components/customer/AddressFormDialog"
import { customerAddressApi, ApiError } from "@/lib/api"
import type { CustomerAddress } from "@/types"

function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  isSettingDefault,
}: {
  address: CustomerAddress
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
  isSettingDefault: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-foreground">{address.label || "Address"}</p>
        {address.isDefault && <Badge variant="success">DEFAULT</Badge>}
      </div>

      <div className="mt-3 space-y-0.5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{address.fullName}</p>
        <p>{address.addressLine1}</p>
        {address.addressLine2 && <p>{address.addressLine2}</p>}
        {address.landmark && <p>Near {address.landmark}</p>}
        <p>{[address.locality, address.city].filter(Boolean).join(", ")}</p>
        <p>{address.district} District</p>
        <p>
          {address.state} - {address.pincode}
        </p>
        <p>{address.country}</p>
        <p className="pt-1">{address.phone}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" /> Edit
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete}>
          <Trash2 className="size-3.5" /> Delete
        </Button>
        {!address.isDefault && (
          <Button variant="ghost" size="sm" onClick={onSetDefault} disabled={isSettingDefault}>
            <Star className="size-3.5" /> {isSettingDefault ? "Setting..." : "Set as Default"}
          </Button>
        )}
      </div>
    </div>
  )
}

export default function CustomerAddresses() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [defaultingId, setDefaultingId] = useState<string | null>(null)

  const addressesQuery = useQuery({
    queryKey: ["customer-addresses"],
    queryFn: customerAddressApi.list,
  })
  const addresses = addressesQuery.data ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["customer-addresses"] })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customerAddressApi.remove(id),
    onSuccess: () => {
      invalidate()
      toast.success("Address removed.")
      setDeletingId(null)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove this address.")
      setDeletingId(null)
    },
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => customerAddressApi.setDefault(id),
    onMutate: (id) => setDefaultingId(id),
    onSuccess: () => {
      invalidate()
      toast.success("Default address updated.")
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't set default address."),
    onSettled: () => setDefaultingId(null),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Delivery Addresses</h1>
          <p className="text-sm text-muted-foreground">
            Manage the addresses used to deliver your NEXORA NFC card orders.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingAddress(null)
            setFormOpen(true)
          }}
        >
          <Plus className="size-4" /> Add New Address
        </Button>
      </div>

      {addressesQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      ) : addressesQuery.isError ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">Unable to load your addresses.</p>
            <Button variant="outline" size="sm" onClick={() => addressesQuery.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : addresses.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MapPin className="size-7" />
            </span>
            <p className="text-base font-semibold text-foreground">No delivery address found</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add a delivery address so it's ready to use the next time you order.
            </p>
            <Button
              className="mt-2"
              onClick={() => {
                setEditingAddress(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-4" /> Add Delivery Address
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={() => {
                setEditingAddress(address)
                setFormOpen(true)
              }}
              onDelete={() => setDeletingId(address.id)}
              onSetDefault={() => setDefaultMutation.mutate(address.id)}
              isSettingDefault={defaultingId === address.id}
            />
          ))}
        </div>
      )}

      <AddressFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        address={editingAddress}
        onSaved={() => invalidate()}
      />

      <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this address?</DialogTitle>
            <DialogDescription>
              This only removes it from your saved addresses — any past orders that used it keep their own delivery
              address unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
