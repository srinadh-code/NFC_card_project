import { useState, type CSSProperties, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { CheckCircle2, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, leadsApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Profile } from "@/types"

const EMPTY_FORM = { name: "", email: "", phone: "", message: "" }
type EnquiryForm = typeof EMPTY_FORM
type EnquiryErrors = Partial<Record<keyof EnquiryForm, string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 7-15 digits with the usual separators — keep in sync with
 * SubmitLeadSerializer.validate_phone on the backend. */
function isValidEnquiryPhone(value: string) {
  const digits = value.replace(/\D/g, "")
  return /^\+?[\d\s\-()]+$/.test(value) && digits.length >= 7 && digits.length <= 15
}

function validate(form: EnquiryForm): EnquiryErrors {
  const errors: EnquiryErrors = {}
  if (!form.name.trim()) errors.name = "Please enter your full name."
  if (!form.email.trim()) errors.email = "Please enter your email address."
  else if (!EMAIL_RE.test(form.email.trim())) errors.email = "Enter a valid email address."
  if (!form.phone.trim()) errors.phone = "Please enter your phone number."
  else if (!isValidEnquiryPhone(form.phone.trim())) errors.phone = "Enter a valid phone number."
  if (!form.message.trim()) errors.message = "Please add a short message."
  else if (form.message.trim().length > 2000) errors.message = "Please keep your message under 2000 characters."
  return errors
}

interface ContactUsSectionProps {
  profile: Profile
  /** False in the dashboard's live preview — the button still shows so the
   * customer sees the section, but nothing is submitted to their own leads. */
  enabled?: boolean
  /** Themed per template so the section matches the card it sits on. */
  className?: string
  style?: CSSProperties
  titleClassName?: string
  titleStyle?: CSSProperties
  textClassName?: string
  buttonClassName?: string
  buttonStyle?: CSSProperties
  /** Submit-button color inside the enquiry form. */
  accent: string
  /** Text color class on `accent` (defaults to white). */
  accentTextClassName?: string
}

/** "Contact Us" block shown at the bottom of each public profile template.
 * Opens an enquiry form that saves a Lead for the profile owner. */
export function ContactUsSection({
  profile,
  enabled = false,
  className,
  style,
  titleClassName,
  titleStyle,
  textClassName,
  buttonClassName,
  buttonStyle,
  accent,
  accentTextClassName = "text-white",
}: ContactUsSectionProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<EnquiryForm>(EMPTY_FORM)
  const [errors, setErrors] = useState<EnquiryErrors>({})
  const firstName = profile.fullName.trim().split(/\s+/)[0] || "this profile's owner"

  const mutation = useMutation({
    mutationFn: () =>
      leadsApi.submitEnquiry({
        username: profile.username,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        message: form.message.trim(),
      }),
    onSuccess: () => setForm(EMPTY_FORM),
    onError: (err) => {
      if (err instanceof ApiError) {
        const fieldErrors: EnquiryErrors = {}
        for (const key of Object.keys(EMPTY_FORM) as (keyof EnquiryForm)[]) {
          const value = err.errors[key]
          if (value) fieldErrors[key] = Array.isArray(value) ? String(value[0]) : String(value)
        }
        setErrors(fieldErrors)
      }
    },
  })

  function update(key: keyof EnquiryForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next && mutation.isSuccess) mutation.reset()
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Repeated clicks while a request is in flight are ignored here; the
    // backend also collapses an identical resubmission into the same lead.
    if (!enabled || mutation.isPending) return
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length === 0) mutation.mutate()
  }

  const genericError =
    mutation.isError && !Object.values(errors).some(Boolean)
      ? mutation.error instanceof Error
        ? mutation.error.message
        : "Something went wrong. Please try again."
      : null

  return (
    <div className={cn("w-full text-center", className)} style={style}>
      <p className={cn("text-sm font-bold", titleClassName)} style={titleStyle}>
        Contact Us
      </p>
      <p className={cn("mt-1 text-xs", textClassName)}>Have a question or want to work together? Send an enquiry.</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "mt-3 flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold shadow-sm transition-transform hover:-translate-y-0.5",
          buttonClassName,
        )}
        style={buttonStyle}
      >
        <Send className="size-4" />
        Send Enquiry
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {mutation.isSuccess ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="size-12" style={{ color: accent }} />
              <DialogTitle>Enquiry sent!</DialogTitle>
              <DialogDescription>
                Thanks for reaching out. {firstName} has received your details and will get back to you soon.
              </DialogDescription>
              <Button className={cn("mt-2", accentTextClassName)} style={{ background: accent }} onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Contact {profile.fullName || "Us"}</DialogTitle>
                <DialogDescription>Share your details and a short message. All fields are required.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <Field id="enquiry-name" label="Full Name" error={errors.name}>
                  <Input
                    id="enquiry-name"
                    autoComplete="name"
                    maxLength={150}
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    aria-invalid={Boolean(errors.name)}
                  />
                </Field>
                <Field id="enquiry-email" label="Email Address" error={errors.email}>
                  <Input
                    id="enquiry-email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    aria-invalid={Boolean(errors.email)}
                  />
                </Field>
                <Field id="enquiry-phone" label="Phone Number" error={errors.phone}>
                  <Input
                    id="enquiry-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={20}
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    aria-invalid={Boolean(errors.phone)}
                  />
                </Field>
                <Field id="enquiry-message" label="Message" error={errors.message}>
                  <Textarea
                    id="enquiry-message"
                    rows={4}
                    maxLength={2000}
                    placeholder="Hi, I am interested in your services. I would like to connect with you."
                    value={form.message}
                    onChange={(e) => update("message", e.target.value)}
                    aria-invalid={Boolean(errors.message)}
                  />
                </Field>
                {genericError && (
                  <p role="alert" className="text-sm text-destructive">
                    {genericError}
                  </p>
                )}
                {!enabled && (
                  <p className="text-xs text-muted-foreground">
                    Preview only — visitors can send enquiries from your public profile.
                  </p>
                )}
                <Button
                  type="submit"
                  className={cn("w-full", accentTextClassName)}
                  style={{ background: accent }}
                  disabled={!enabled || mutation.isPending}
                >
                  {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {mutation.isPending ? "Sending..." : "Submit Enquiry"}
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 text-left">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
