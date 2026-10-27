import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { AlertTriangle, ImagePlus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { StarRating } from "@/components/ui/star-rating"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TestimonialAvatar } from "@/components/marketing/TestimonialAvatar"
import { useCreateTestimonial, useUpdateTestimonial } from "@/hooks/useTestimonials"
import { ApiError, NetworkError, fieldErrorMessage } from "@/lib/api"
import { useCustomerAuthStore } from "@/store/auth-store"
import { formatDate } from "@/lib/mock-api"
import {
  TESTIMONIAL_IMAGE_MAX_BYTES,
  TESTIMONIAL_IMAGE_TYPES,
  TESTIMONIAL_REVIEW_MAX,
  TESTIMONIAL_REVIEW_MIN,
  type MyTestimonial,
  type TestimonialEligibility,
} from "@/types/testimonial"

type Field = "name" | "designation" | "company" | "rating" | "review" | "order" | "profile_image"
type FieldErrors = Partial<Record<Field, string>>
const FIELDS: Field[] = ["name", "designation", "company", "rating", "review", "order", "profile_image"]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present → edit mode; absent → create. */
  testimonial?: MyTestimonial | null
  orders: TestimonialEligibility["orders"]
}

export function TestimonialFormDialog({ open, onOpenChange, testimonial, orders }: Props) {
  const customerName = useCustomerAuthStore((s) => s.customer?.name ?? "")
  const isEdit = !!testimonial
  const createMutation = useCreateTestimonial()
  const updateMutation = useUpdateTestimonial()
  const isPending = createMutation.isPending || updateMutation.isPending

  const [name, setName] = useState("")
  const [designation, setDesignation] = useState("")
  const [company, setCompany] = useState("")
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState("")
  const [orderId, setOrderId] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset the form whenever the dialog opens (fresh create, or the row being
  // edited). Keyed on the id, not the object: a background refetch hands us
  // a new object for the same row, and that must not wipe in-progress edits.
  const testimonialId = testimonial?.id
  useEffect(() => {
    if (!open) return
    setName(testimonial?.name ?? customerName)
    setDesignation(testimonial?.designation ?? "")
    setCompany(testimonial?.company ?? "")
    setRating(testimonial?.rating ?? 0)
    setReview(testimonial?.review ?? "")
    setOrderId(testimonial?.order ?? orders[0]?.id ?? null)
    setFile(null)
    setRemoveImage(false)
    setErrors({})
    setFormError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, testimonialId])

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const shownImage = previewUrl ?? (removeImage ? null : testimonial?.profile_image || null)

  function clearError(field: Field) {
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    e.target.value = ""
    if (!picked) return
    if (!TESTIMONIAL_IMAGE_TYPES.split(",").includes(picked.type)) {
      setErrors((prev) => ({ ...prev, profile_image: "Use a JPEG, PNG or WEBP image." }))
      return
    }
    if (picked.size > TESTIMONIAL_IMAGE_MAX_BYTES) {
      setErrors((prev) => ({ ...prev, profile_image: "Image must be smaller than 5MB." }))
      return
    }
    clearError("profile_image")
    setFile(picked)
    setRemoveImage(false)
  }

  function handleRemoveImage() {
    setFile(null)
    setRemoveImage(true)
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!name.trim()) next.name = "Please enter your name."
    if (rating < 1 || rating > 5) next.rating = "Please select a rating."
    const text = review.trim()
    if (!text) next.review = "Please write your review."
    else if (text.length < TESTIMONIAL_REVIEW_MIN)
      next.review = `Review must be at least ${TESTIMONIAL_REVIEW_MIN} characters.`
    else if (text.length > TESTIMONIAL_REVIEW_MAX)
      next.review = `Review must be at most ${TESTIMONIAL_REVIEW_MAX} characters.`
    return next
  }

  function handleServerError(err: unknown) {
    if (err instanceof ApiError) {
      const fieldErrors: FieldErrors = {}
      for (const field of FIELDS) {
        const msg = fieldErrorMessage(err.errors, field)
        if (msg) fieldErrors[field] = msg
      }
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors)
        return
      }
      // Business rule (not eligible, already pending, no longer editable).
      setFormError(err.message)
      return
    }
    setFormError(err instanceof NetworkError ? err.message : "Unable to save your testimonial. Please try again.")
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const clientErrors = validate()
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    const input = {
      name,
      designation,
      company,
      rating,
      review,
      order: orderId,
      profile_image: file,
      remove_profile_image: removeImage,
    }
    const options = { onSuccess: () => onOpenChange(false), onError: handleServerError }
    if (testimonial) updateMutation.mutate({ id: testimonial.id, input }, options)
    else createMutation.mutate(input, options)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Testimonial" : "Share Your Experience"}</DialogTitle>
          <DialogDescription>
            Your testimonial will appear on the VR&apos;s GATEWAY website once an admin approves it. You can edit
            or delete it while it&apos;s pending.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label>Profile Photo (optional)</Label>
            <div className="flex items-center gap-4">
              <TestimonialAvatar src={shownImage} name={name || customerName} className="size-16" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus className="size-4" />
                  {shownImage ? "Replace" : "Upload"}
                </Button>
                {shownImage && (
                  <Button type="button" variant="ghost" size="sm" onClick={handleRemoveImage}>
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={TESTIMONIAL_IMAGE_TYPES}
                className="hidden"
                onChange={handleFile}
              />
            </div>
            <p className="text-xs text-muted-foreground">JPEG, PNG or WEBP. Max 5MB.</p>
            <FieldError message={errors.profile_image} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="t-name">Name</Label>
              <Input
                id="t-name"
                value={name}
                maxLength={150}
                aria-invalid={!!errors.name}
                onChange={(e) => {
                  setName(e.target.value)
                  clearError("name")
                }}
              />
              <FieldError message={errors.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-designation">Designation (optional)</Label>
              <Input
                id="t-designation"
                placeholder="e.g. Founder"
                value={designation}
                maxLength={150}
                onChange={(e) => {
                  setDesignation(e.target.value)
                  clearError("designation")
                }}
              />
              <FieldError message={errors.designation} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-company">Company (optional)</Label>
              <Input
                id="t-company"
                value={company}
                maxLength={150}
                onChange={(e) => {
                  setCompany(e.target.value)
                  clearError("company")
                }}
              />
              <FieldError message={errors.company} />
            </div>
          </div>

          {orders.length > 1 && (
            <div className="space-y-1.5">
              <Label>Related Order</Label>
              <Select value={orderId ? String(orderId) : undefined} onValueChange={(v) => setOrderId(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an order" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.order_number ?? `Order #${o.id}`} · {formatDate(o.placed_at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.order} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Rating</Label>
            <StarRating
              value={rating}
              size="lg"
              onChange={(v) => {
                setRating(v)
                clearError("rating")
              }}
            />
            <FieldError message={errors.rating} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-review">Your Review</Label>
            <Textarea
              id="t-review"
              rows={5}
              placeholder="Tell others how VR's GATEWAY has helped you..."
              value={review}
              maxLength={TESTIMONIAL_REVIEW_MAX}
              aria-invalid={!!errors.review}
              onChange={(e) => {
                setReview(e.target.value)
                clearError("review")
              }}
            />
            <div className="flex items-start justify-between gap-2">
              <FieldError message={errors.review} />
              <p className="ml-auto text-xs tabular-nums text-muted-foreground">
                {review.trim().length} / {TESTIMONIAL_REVIEW_MAX}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (isEdit ? "Saving..." : "Submitting...") : isEdit ? "Save Changes" : "Submit Testimonial"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  )
}
