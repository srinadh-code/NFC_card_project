import { useState } from "react"
import { Link } from "react-router-dom"
import { Info, MessageSquareQuote, Pencil, Plus, ShoppingBag, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StarRating } from "@/components/ui/star-rating"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { ConfirmDialog } from "@/components/admin/ConfirmDialog"
import { ErrorState } from "@/components/customer/ErrorState"
import { TestimonialFormDialog } from "@/components/customer/TestimonialFormDialog"
import { TestimonialAvatar } from "@/components/marketing/TestimonialAvatar"
import { useDeleteTestimonial, useMyTestimonials, useTestimonialEligibility } from "@/hooks/useTestimonials"
import { formatDate } from "@/lib/mock-api"
import { TESTIMONIAL_STATUS_LABELS, type MyTestimonial, type TestimonialEligibility } from "@/types/testimonial"

const NO_ORDERS: TestimonialEligibility["orders"] = []

const STATUS_HELP: Record<MyTestimonial["status"], string> = {
  PENDING: "Awaiting approval. You can still edit or delete it.",
  APPROVED: "Approved — visible on the website.",
  REJECTED: "Not approved for the website.",
}

export default function MyTestimonials() {
  const testimonialsQuery = useMyTestimonials()
  const eligibilityQuery = useTestimonialEligibility()
  const deleteMutation = useDeleteTestimonial()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MyTestimonial | null>(null)
  const [deleting, setDeleting] = useState<MyTestimonial | null>(null)

  const eligibility = eligibilityQuery.data
  const testimonials = testimonialsQuery.data ?? []
  const isLoading = testimonialsQuery.isLoading || eligibilityQuery.isLoading
  const loadError = testimonialsQuery.error ?? eligibilityQuery.error

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(t: MyTestimonial) {
    setEditing(t)
    setFormOpen(true)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">My Testimonials</h1>
          <p className="text-sm text-muted-foreground">Share your experience with VR&apos;s GATEWAY.</p>
        </div>
        {eligibility?.can_submit && (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Write a Testimonial
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : loadError ? (
        <ErrorState
          error={loadError}
          onRetry={() => {
            testimonialsQuery.refetch()
            eligibilityQuery.refetch()
          }}
        />
      ) : (
        <>
          {eligibility && !eligibility.eligible && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="size-5" />
                  Purchase required
                </CardTitle>
                <CardDescription>{eligibility.message}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link to="/shop">Order Your Card</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {eligibility?.eligible && eligibility.has_pending && (
            <Alert>
              <Info />
              <AlertDescription>
                You have a testimonial awaiting approval. You can submit another once it has been reviewed.
              </AlertDescription>
            </Alert>
          )}

          {testimonials.length === 0 && eligibility?.eligible ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <MessageSquareQuote className="size-10 text-muted-foreground" />
                <p className="font-medium">You haven&apos;t written a testimonial yet.</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Tell others how your NFC card has helped you. Approved testimonials are featured on our website.
                </p>
                <Button onClick={openCreate} className="mt-2">
                  <Plus className="size-4" />
                  Write a Testimonial
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {testimonials.map((t) => (
                <Card key={t.id}>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <TestimonialAvatar src={t.profile_image} name={t.name} />
                        <div className="min-w-0">
                          <p className="font-semibold">{t.name}</p>
                          {(t.designation || t.company) && (
                            <p className="text-sm text-muted-foreground">
                              {[t.designation, t.company].filter(Boolean).join(" @ ")}
                            </p>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={TESTIMONIAL_STATUS_LABELS[t.status]} />
                    </div>
                    <StarRating value={t.rating} readOnly size="sm" />
                    <p className="text-sm leading-relaxed whitespace-pre-line">&ldquo;{t.review}&rdquo;</p>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                      <div className="text-xs text-muted-foreground">
                        <p>
                          Submitted {formatDate(t.created_at)}
                          {t.order_number ? ` · Order ${t.order_number}` : ""}
                        </p>
                        <p>{STATUS_HELP[t.status]}</p>
                      </div>
                      {t.can_edit && (
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                            <Pencil className="size-4" />
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(t)}>
                            <Trash2 className="size-4" />
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <TestimonialFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        testimonial={editing}
        orders={eligibility?.orders ?? NO_ORDERS}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this testimonial?"
        description="This permanently removes your testimonial and its photo. This can't be undone."
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete"}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id, { onSettled: () => setDeleting(null) })
        }}
      />
    </div>
  )
}
