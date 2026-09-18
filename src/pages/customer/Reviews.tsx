import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AlertTriangle, MessageSquare } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { StarRating } from "@/components/ui/star-rating"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ErrorState } from "@/components/customer/ErrorState"
import { ApiError, NetworkError, fieldErrorMessage, reviewApi } from "@/lib/api"
import { formatDate } from "@/lib/mock-api"
import { cn } from "@/lib/utils"

const MIN_LENGTH = 10
const MAX_LENGTH = 500

export default function CustomerReviews() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState("")
  // Field-level (shown directly under the field that's wrong) vs. form-level
  // (a business rule like eligibility or "already reviewed" — no single
  // field to attach it to, so it's a banner inside the card instead).
  // Never a toast, per the form architecture this follows.
  const [ratingError, setRatingError] = useState<string | null>(null)
  const [reviewTextError, setReviewTextError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["customer-review"],
    queryFn: reviewApi.getMine,
  })

  const review = data?.review ?? null

  function clearErrors() {
    setRatingError(null)
    setReviewTextError(null)
    setFormError(null)
  }

  function startEditing() {
    setRating(review?.rating ?? 0)
    setReviewText(review?.review_text ?? "")
    clearErrors()
    setEditing(true)
  }

  const submitMutation = useMutation({
    mutationFn: () =>
      review
        ? reviewApi.update({ rating, review_text: reviewText })
        : reviewApi.submit({ rating, review_text: reviewText }),
    onSuccess: () => {
      toast.success(review ? "Your review has been updated successfully." : "Thank you for your review!")
      queryClient.invalidateQueries({ queryKey: ["customer-review"] })
      setEditing(false)
    },
    onError: (err) => {
      // Never a toast, and never the raw DRF/Axios shape — map the actual
      // response into the field it's about. A network failure or a genuine
      // 500 has no field to attach to either, so it becomes the same
      // form-level banner as a business-rule rejection (eligibility,
      // duplicate review) — always a clean sentence, never "400 Bad
      // Request", "AxiosError", or a raw non_field_errors/detail dump.
      // Entered values are left exactly as they were — nothing is cleared.
      if (err instanceof ApiError) {
        const ratingMsg = fieldErrorMessage(err.errors, "rating")
        const textMsg = fieldErrorMessage(err.errors, "review_text")
        if (ratingMsg || textMsg) {
          setRatingError(ratingMsg)
          setReviewTextError(textMsg)
          return
        }
        // Business-level (403 no_eligible_order, 409 review_already_exists)
        // or any other backend-provided message — already human-readable.
        setFormError(err.message)
        return
      }
      setFormError(
        err instanceof NetworkError
          ? err.message
          : "Unable to save your review. Please try again."
      )
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearErrors()
    let hasError = false
    if (rating < 1 || rating > 5) {
      setRatingError("Please select a rating.")
      hasError = true
    }
    const trimmed = reviewText.trim()
    if (trimmed.length === 0) {
      setReviewTextError("Please enter your review.")
      hasError = true
    } else if (trimmed.length < MIN_LENGTH) {
      setReviewTextError(`Review must be at least ${MIN_LENGTH} characters.`)
      hasError = true
    } else if (trimmed.length > MAX_LENGTH) {
      setReviewTextError(`Review must be at most ${MAX_LENGTH} characters.`)
      hasError = true
    }
    if (hasError) return
    submitMutation.mutate()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <p className="text-sm text-muted-foreground">Share your experience with VR&apos;s NEXORA.</p>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-muted-foreground">Loading your review...</p>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : review && !editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Your Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StarRating value={review.rating} readOnly />
            <p className="text-sm leading-relaxed text-foreground">&ldquo;{review.review_text}&rdquo;</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>Submitted: {formatDate(review.created_at)}</span>
              <span className="flex items-center gap-1.5">
                Status:
                <span
                  className={cn(
                    "font-medium",
                    review.is_published ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  )}
                >
                  {review.is_published ? "Published" : "Not Published"}
                </span>
              </span>
            </div>
            <Button variant="outline" onClick={startEditing}>
              Edit Review
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="size-5" />
              {review ? "Edit Your Review" : "Your Experience"}
            </CardTitle>
            <CardDescription>Share your experience with VR&apos;s NEXORA.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <Alert variant="warning">
                  <AlertTriangle />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label>How would you rate us?</Label>
                <StarRating
                  value={rating}
                  onChange={(v) => {
                    setRating(v)
                    setRatingError(null)
                  }}
                  size="lg"
                />
                {ratingError && (
                  <p className="text-sm text-destructive" role="alert">
                    {ratingError}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="review-text">Your Review</Label>
                <Textarea
                  id="review-text"
                  placeholder="Write your review here..."
                  value={reviewText}
                  onChange={(e) => {
                    setReviewText(e.target.value.slice(0, MAX_LENGTH))
                    setReviewTextError(null)
                  }}
                  maxLength={MAX_LENGTH}
                  rows={4}
                  aria-invalid={!!reviewTextError}
                  aria-describedby={reviewTextError ? "review-text-error" : undefined}
                  required
                />
                <div className="flex items-center justify-between">
                  {reviewTextError ? (
                    <p id="review-text-error" className="text-sm text-destructive" role="alert">
                      {reviewTextError}
                    </p>
                  ) : (
                    <span />
                  )}
                  <p className="text-right text-xs tabular-nums text-muted-foreground">
                    {reviewText.length} / {MAX_LENGTH}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitMutation.isPending}>
                  {submitMutation.isPending
                    ? review
                      ? "Updating..."
                      : "Submitting..."
                    : review
                      ? "Update Review"
                      : "Submit Review"}
                </Button>
                {review && (
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
