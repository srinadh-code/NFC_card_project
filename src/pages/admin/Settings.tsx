import { useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { toast } from "sonner"
import {
  Settings as SettingsIcon,
  CreditCard,
  Truck,
  Mail,
  Phone,
  Globe,
  Image as ImageIcon,
  ShieldCheck,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useSingletonSection } from "@/components/admin/content/useSingletonSection"
import { emailSettingsApi, paymentSettingsApi, securitySettingsApi, settingsApi, shippingSettingsApi } from "@/lib/contentApi"
import type { EmailSettings, GeneralSettings, PaymentSettings, SecuritySettings, ShippingSettings } from "@/types/content"
import { useBrandingStore, type BrandingAsset } from "@/store/branding-store"
import { useSupportSettingsStore } from "@/store/support-settings-store"
import { INDIAN_STATES } from "@/data/indian-states"

const SECTIONS = [
  { key: "general", label: "General", icon: SettingsIcon },
  { key: "payment", label: "Payment Settings", icon: CreditCard },
  { key: "shipping", label: "Shipping Settings", icon: Truck },
  { key: "email", label: "Email Settings", icon: Mail },
  { key: "security", label: "Security Settings", icon: ShieldCheck },
] as const

type SectionKey = (typeof SECTIONS)[number]["key"]

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

// -----------------------------------------------------------------------
// Company Logo / Favicon — General Settings only. Reads/writes the
// centralized useBrandingStore (src/store/branding-store.ts) — the single
// source of truth for platform branding, so nothing here duplicates that
// state locally. Deliberately not the shared ImageUploadField (components/
// admin/content) used by Website Content's Hero/Testimonials/Companies
// sections: that one always calls a real upload/remove API, and this task
// is explicit that these two controls must never hit a backend/API — only
// hold a local object-URL preview for the current session. Modeled on the
// same interaction shape (preview box + hidden file input + Change/Remove)
// so it still looks and behaves like the rest of the app, without touching
// that shared, backend-backed component.
// -----------------------------------------------------------------------

// 1.5MB per file — data: URLs inflate ~33% over the raw file size once
// base64-encoded, and this is stored in localStorage alongside auth/cart/
// theme state, which has its own (browser-enforced, ~5-10MB) quota.
const MAX_BRANDING_FILE_BYTES = 1.5 * 1024 * 1024

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function LocalImageUploadField({
  label,
  subtitle,
  accept,
  acceptedExtensions,
  formatsHelp,
  value,
  onChange,
}: {
  label: string
  subtitle: string
  accept: string
  acceptedExtensions: string[]
  formatsHelp: string
  value: BrandingAsset | null
  onChange: (value: BrandingAsset | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!ext || !acceptedExtensions.includes(ext)) {
      toast.error(`Unsupported file type. ${formatsHelp}.`)
      return
    }
    if (file.size > MAX_BRANDING_FILE_BYTES) {
      toast.error(`${label} is too large. Please choose a file under 1.5MB.`)
      return
    }

    try {
      const previewUrl = await readFileAsDataUrl(file)
      onChange({ name: file.name, previewUrl })
    } catch {
      toast.error(`Couldn't read that file. Please try a different one.`)
    }
  }

  function handleRemove() {
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/70 p-4">
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted">
          {value ? (
            <img src={value.previewUrl} alt={label} className="size-full object-contain" />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{value ? value.name : subtitle}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          {value ? "Change" : `Upload ${label}`}
        </Button>
        {value && (
          <Button type="button" variant="outline" size="sm" onClick={handleRemove}>
            Remove
          </Button>
        )}
      </div>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFileChange} />
      <p className="text-xs text-muted-foreground">{formatsHelp}</p>
    </div>
  )
}

// Loose, frontend-only validation — these three fields have no backend
// counterpart in this task, so there's nothing server-side to defer to.
function isValidEmailLoose(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidUrlLoose(value: string) {
  try {
    const u = new URL(value)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function isValidPhoneLoose(value: string) {
  return /^[+]?[\d\s-]{7,15}$/.test(value)
}

export default function AdminSettings() {
  const [active, setActive] = useState<SectionKey>("general")

  // Every section here is a real, database-backed singleton — see
  // website_content.models.settings on the backend; every "Save Changes"
  // button is a real PATCH. The one exception is the block of General-only
  // UI state further down (Branding/Support & Website) — that part is
  // frontend-only by explicit design for this iteration (no backend field
  // exists for it yet), so it lives in local/store state instead of here
  // (see useBrandingStore for Branding specifically).
  const general = useSingletonSection<GeneralSettings>({
    queryKey: ["settings", "admin"],
    get: settingsApi.get,
    update: settingsApi.update,
    label: "General Settings",
  })
  const payment = useSingletonSection<PaymentSettings>({
    queryKey: ["settings", "payment"],
    get: paymentSettingsApi.get,
    update: paymentSettingsApi.update,
    label: "Payment Settings",
  })
  const shipping = useSingletonSection<ShippingSettings>({
    queryKey: ["settings", "shipping"],
    get: shippingSettingsApi.get,
    update: shippingSettingsApi.update,
    label: "Shipping Settings",
  })
  const email = useSingletonSection<EmailSettings>({
    queryKey: ["settings", "email"],
    get: emailSettingsApi.get,
    update: emailSettingsApi.update,
    label: "Email Settings",
  })
  const security = useSingletonSection<SecuritySettings>({
    queryKey: ["settings", "security"],
    get: securitySettingsApi.get,
    update: securitySettingsApi.update,
    label: "Security Settings",
  })

  // Company Logo / Favicon live in the centralized branding store (single
  // source of truth — see src/store/branding-store.ts), not local state,
  // so they survive navigating away from this page (and a refresh — that
  // store persists to localStorage).
  const companyLogo = useBrandingStore((s) => s.companyLogo)
  const setCompanyLogo = useBrandingStore((s) => s.setCompanyLogo)
  const favicon = useBrandingStore((s) => s.favicon)
  const setFavicon = useBrandingStore((s) => s.setFavicon)

  // Support Email / Support Phone / Website URL are the centralized
  // source of truth for the public site (Contact.tsx, Footer.tsx) — see
  // src/store/support-settings-store.ts. Editing keeps a local draft
  // (exactly like Basic Information's `general.values` draft below) so
  // half-typed input doesn't reach the public site until "Save Changes"
  // is actually clicked; the draft is seeded from the store once on
  // mount so a previously-saved value still shows when reopening this
  // page, and committed back to the store on save.
  const supportSettings = useSupportSettingsStore()
  const [supportEmail, setSupportEmail] = useState(supportSettings.supportEmail)
  const [supportPhone, setSupportPhone] = useState(supportSettings.supportPhone)
  const [websiteUrl, setWebsiteUrl] = useState(supportSettings.websiteUrl)
  const [generalUiErrors, setGeneralUiErrors] = useState<{
    supportEmail?: string
    supportPhone?: string
    websiteUrl?: string
  }>({})

  function handleSaveGeneral() {
    const errors: typeof generalUiErrors = {}
    if (supportEmail && !isValidEmailLoose(supportEmail)) {
      errors.supportEmail = "Enter a valid email address."
    }
    if (supportPhone && !isValidPhoneLoose(supportPhone)) {
      errors.supportPhone = "Enter a valid phone number."
    }
    if (websiteUrl && !isValidUrlLoose(websiteUrl)) {
      errors.websiteUrl = "Enter a valid URL (e.g. https://vrsnexora.com)."
    }
    setGeneralUiErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast.error("Please fix the highlighted fields before saving.")
      return
    }

    // Basic Information still really persists (existing, unchanged
    // behavior). Support & Website has no backend field/API in this task,
    // so it commits to the centralized frontend store instead — this is
    // what makes the public Contact page/Footer pick up the new values.
    general.save()
    supportSettings.setSupportSettings({ supportEmail, supportPhone, websiteUrl })
    toast.success("General settings saved successfully.")
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage platform-wide configuration</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                active === s.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <s.icon className="size-4" />
              {s.label}
            </button>
          ))}
        </nav>

        <div>
          {active === "general" && (
            <Card>
              <CardHeader>
                <CardTitle>General</CardTitle>
                <CardDescription>
                  Basic information shown on the public website — header, footer, contact page, prices and dates.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-8">
                {general.isLoading ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-4">
                      <SectionHeading
                        title="Basic Information"
                        description="Shown on the public website — header, footer, contact page, prices and dates."
                      />
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FieldRow label="Site Name">
                          <Input
                            value={general.values.site_name ?? ""}
                            onChange={(e) => general.setField("site_name", e.target.value)}
                          />
                        </FieldRow>
                        <FieldRow label="Site Email">
                          <Input
                            type="email"
                            value={general.values.site_email ?? ""}
                            onChange={(e) => general.setField("site_email", e.target.value)}
                          />
                        </FieldRow>
                        <FieldRow label="Site Phone">
                          <Input
                            value={general.values.site_phone ?? ""}
                            onChange={(e) => general.setField("site_phone", e.target.value)}
                          />
                        </FieldRow>
                        <FieldRow label="Currency">
                          <Select
                            value={general.values.currency ?? "INR"}
                            onValueChange={(v) => general.setField("currency", v)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                              <SelectItem value="USD">USD - US Dollar</SelectItem>
                              <SelectItem value="EUR">EUR - Euro</SelectItem>
                            </SelectContent>
                          </Select>
                        </FieldRow>
                        <FieldRow label="Timezone">
                          <Select
                            value={general.values.timezone ?? "Asia/Kolkata"}
                            onValueChange={(v) => general.setField("timezone", v)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                              <SelectItem value="UTC">UTC</SelectItem>
                              <SelectItem value="America/New_York">America/New_York</SelectItem>
                            </SelectContent>
                          </Select>
                        </FieldRow>
                        <FieldRow label="Site Address">
                          <Input
                            value={general.values.site_address ?? ""}
                            onChange={(e) => general.setField("site_address", e.target.value)}
                          />
                        </FieldRow>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 border-t border-border pt-8">
                      <SectionHeading
                        title="Office / Dispatch Address"
                        description="Where every order physically ships from — shown as the 'From' address on order tracking, shipping information and the public Track Order page."
                      />
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FieldRow label="Company / Office Name">
                          <Input
                            value={general.values.office_name ?? ""}
                            onChange={(e) => general.setField("office_name", e.target.value)}
                          />
                        </FieldRow>
                        <FieldRow label="Contact Phone">
                          <Input
                            value={general.values.office_phone ?? ""}
                            onChange={(e) => general.setField("office_phone", e.target.value)}
                          />
                        </FieldRow>
                        <FieldRow label="Address Line 1">
                          <Input
                            value={general.values.office_address_line1 ?? ""}
                            onChange={(e) => general.setField("office_address_line1", e.target.value)}
                          />
                        </FieldRow>
                        <FieldRow label="Address Line 2">
                          <Input
                            value={general.values.office_address_line2 ?? ""}
                            onChange={(e) => general.setField("office_address_line2", e.target.value)}
                          />
                        </FieldRow>
                        <FieldRow label="Landmark">
                          <Input
                            value={general.values.office_landmark ?? ""}
                            onChange={(e) => general.setField("office_landmark", e.target.value)}
                          />
                        </FieldRow>
                        <FieldRow label="Locality / Area">
                          <Input
                            value={general.values.office_locality ?? ""}
                            onChange={(e) => general.setField("office_locality", e.target.value)}
                          />
                        </FieldRow>
                        <FieldRow label="City">
                          <Input
                            value={general.values.office_city ?? ""}
                            onChange={(e) => general.setField("office_city", e.target.value)}
                          />
                        </FieldRow>
                        <FieldRow label="District">
                          <Input
                            value={general.values.office_district ?? ""}
                            onChange={(e) => general.setField("office_district", e.target.value)}
                          />
                        </FieldRow>
                        <FieldRow label="State">
                          <Select
                            value={general.values.office_state ?? ""}
                            onValueChange={(v) => general.setField("office_state", v)}
                          >
                            <SelectTrigger className="w-full">
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
                        </FieldRow>
                        <FieldRow label="PIN Code">
                          <Input
                            inputMode="numeric"
                            value={general.values.office_pincode ?? ""}
                            onChange={(e) =>
                              general.setField("office_pincode", e.target.value.replace(/\D/g, "").slice(0, 6))
                            }
                          />
                        </FieldRow>
                        <FieldRow label="Country">
                          <Input value={general.values.office_country || "India"} disabled />
                        </FieldRow>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 border-t border-border pt-8">
                      <SectionHeading
                        title="Branding"
                        description="Your logo and favicon as they'll appear across the dashboard and public site."
                      />
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <LocalImageUploadField
                          label="Company Logo"
                          subtitle="Upload your company logo"
                          accept=".png,.jpg,.jpeg,.svg"
                          acceptedExtensions={["png", "jpg", "jpeg", "svg"]}
                          formatsHelp="Supported formats: PNG, JPG, JPEG, SVG"
                          value={companyLogo}
                          onChange={setCompanyLogo}
                        />
                        <LocalImageUploadField
                          label="Favicon"
                          subtitle="Upload your website favicon"
                          accept=".png,.ico,.svg"
                          acceptedExtensions={["png", "ico", "svg"]}
                          formatsHelp="Supported formats: PNG, ICO, SVG"
                          value={favicon}
                          onChange={setFavicon}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 border-t border-border pt-8">
                      <SectionHeading
                        title="Support & Website"
                        description="How customers can reach support, and your public website link."
                      />
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FieldRow label="Support Email">
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="email"
                              className="pl-9"
                              placeholder="support@vrsnexora.com"
                              value={supportEmail}
                              onChange={(e) => {
                                setSupportEmail(e.target.value)
                                setGeneralUiErrors((v) => ({ ...v, supportEmail: undefined }))
                              }}
                              aria-invalid={!!generalUiErrors.supportEmail}
                            />
                          </div>
                          {generalUiErrors.supportEmail && (
                            <p className="text-xs text-destructive">{generalUiErrors.supportEmail}</p>
                          )}
                        </FieldRow>
                        <FieldRow label="Support Phone / WhatsApp">
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="tel"
                              className="pl-9"
                              placeholder="+91 90000 12345"
                              value={supportPhone}
                              onChange={(e) => {
                                setSupportPhone(e.target.value)
                                setGeneralUiErrors((v) => ({ ...v, supportPhone: undefined }))
                              }}
                              aria-invalid={!!generalUiErrors.supportPhone}
                            />
                          </div>
                          {generalUiErrors.supportPhone && (
                            <p className="text-xs text-destructive">{generalUiErrors.supportPhone}</p>
                          )}
                        </FieldRow>
                        <FieldRow label="Website URL">
                          <div className="relative">
                            <Globe className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="url"
                              className="pl-9"
                              placeholder="https://vrsnexora.com"
                              value={websiteUrl}
                              onChange={(e) => {
                                setWebsiteUrl(e.target.value)
                                setGeneralUiErrors((v) => ({ ...v, websiteUrl: undefined }))
                              }}
                              aria-invalid={!!generalUiErrors.websiteUrl}
                            />
                          </div>
                          {generalUiErrors.websiteUrl && (
                            <p className="text-xs text-destructive">{generalUiErrors.websiteUrl}</p>
                          )}
                        </FieldRow>
                      </div>
                    </div>

                    <div>
                      <Button onClick={handleSaveGeneral} disabled={general.isSaving}>
                        {general.isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                        Save Changes
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {active === "payment" && (
            <Card>
              <CardHeader>
                <CardTitle>Payment Settings</CardTitle>
                <CardDescription>Configure your Razorpay integration and payment options.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {payment.isLoading ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FieldRow label="Razorpay Key ID">
                        <Input
                          value={payment.values.razorpay_key_id ?? ""}
                          onChange={(e) => payment.setField("razorpay_key_id", e.target.value)}
                        />
                      </FieldRow>
                      <FieldRow
                        label={
                          payment.data?.has_secret
                            ? "Razorpay Key Secret (configured — leave blank to keep it)"
                            : "Razorpay Key Secret"
                        }
                      >
                        <Input
                          type="password"
                          placeholder={payment.data?.has_secret ? "••••••••••••••••" : ""}
                          value={payment.values.razorpay_secret ?? ""}
                          onChange={(e) => payment.setField("razorpay_secret", e.target.value)}
                        />
                      </FieldRow>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">Enable Cash on Delivery</p>
                        <p className="text-xs text-muted-foreground">Allow customers to pay on delivery for orders.</p>
                      </div>
                      <Switch
                        checked={payment.values.cod_enabled ?? false}
                        onCheckedChange={(v) => payment.setField("cod_enabled", v)}
                      />
                    </div>
                    <div>
                      <Button onClick={payment.save} disabled={payment.isSaving}>
                        {payment.isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                        Save Changes
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {active === "shipping" && (
            <Card>
              <CardHeader>
                <CardTitle>Shipping Settings</CardTitle>
                <CardDescription>Set flat shipping rates and free-shipping thresholds.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {shipping.isLoading ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FieldRow label="Flat Shipping Rate (₹)">
                        <Input
                          type="number"
                          value={shipping.values.flat_rate ?? ""}
                          onChange={(e) => shipping.setField("flat_rate", e.target.value)}
                        />
                      </FieldRow>
                      <FieldRow label="Free Shipping Threshold (₹)">
                        <Input
                          type="number"
                          value={shipping.values.free_shipping_threshold ?? ""}
                          onChange={(e) => shipping.setField("free_shipping_threshold", e.target.value)}
                        />
                      </FieldRow>
                    </div>
                    <div>
                      <Button onClick={shipping.save} disabled={shipping.isSaving}>
                        {shipping.isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                        Save Changes
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {active === "email" && (
            <Card>
              <CardHeader>
                <CardTitle>Email Settings</CardTitle>
                <CardDescription>
                  SMTP configuration used to send transactional emails. Leave blank to use the server's
                  default mail configuration.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {email.isLoading ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FieldRow label="SMTP Host">
                        <Input
                          value={email.values.smtp_host ?? ""}
                          onChange={(e) => email.setField("smtp_host", e.target.value)}
                        />
                      </FieldRow>
                      <FieldRow label="SMTP Port">
                        <Input
                          type="number"
                          value={email.values.smtp_port ?? ""}
                          onChange={(e) =>
                            email.setField("smtp_port", e.target.value ? Number(e.target.value) : null)
                          }
                        />
                      </FieldRow>
                      <FieldRow label="From Address">
                        <Input
                          value={email.values.from_address ?? ""}
                          onChange={(e) => email.setField("from_address", e.target.value)}
                        />
                      </FieldRow>
                    </div>
                    <div>
                      <Button onClick={email.save} disabled={email.isSaving}>
                        {email.isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                        Save Changes
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {active === "security" && (
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>
                  Controls that are actually enforced: session length applies to every new login, and the
                  password rules apply the next time any account sets or resets a password.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {security.isLoading ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FieldRow label="Session Timeout (minutes)">
                        <Input
                          type="number"
                          value={security.values.access_token_minutes ?? ""}
                          onChange={(e) => security.setField("access_token_minutes", Number(e.target.value))}
                        />
                      </FieldRow>
                      <FieldRow label="Minimum Password Length">
                        <Input
                          type="number"
                          value={security.values.min_password_length ?? ""}
                          onChange={(e) => security.setField("min_password_length", Number(e.target.value))}
                        />
                      </FieldRow>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">Require a special character in passwords</p>
                        <p className="text-xs text-muted-foreground">
                          Applied to registration, password reset, and password change.
                        </p>
                      </div>
                      <Switch
                        checked={security.values.require_special_char ?? false}
                        onCheckedChange={(v) => security.setField("require_special_char", v)}
                      />
                    </div>
                    <div>
                      <Button onClick={security.save} disabled={security.isSaving}>
                        {security.isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                        Save Changes
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
