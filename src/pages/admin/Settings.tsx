import { useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Settings as SettingsIcon,
  CreditCard,
  Truck,
  Mail,
  ShieldCheck,
  Loader2,
  Megaphone,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useSingletonSection } from "@/components/admin/content/useSingletonSection"
import { adminAnnouncementApi, ApiError } from "@/lib/api"
import { emailSettingsApi, paymentSettingsApi, securitySettingsApi, settingsApi, shippingSettingsApi } from "@/lib/contentApi"
import type { EmailSettings, GeneralSettings, PaymentSettings, SecuritySettings, ShippingSettings } from "@/types/content"

const SECTIONS = [
  { key: "general", label: "General", icon: SettingsIcon },
  { key: "payment", label: "Payment Settings", icon: CreditCard },
  { key: "shipping", label: "Shipping Settings", icon: Truck },
  { key: "email", label: "Email Settings", icon: Mail },
  { key: "security", label: "Security Settings", icon: ShieldCheck },
  { key: "announcements", label: "Announcements", icon: Megaphone },
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

function formatSentDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function AnnouncementsSection() {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")

  const query = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: () => adminAnnouncementApi.list(1),
  })

  const sendMutation = useMutation({
    mutationFn: () => adminAnnouncementApi.send({ title: title.trim(), message: message.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] })
      toast.success("Announcement sent to your customers.")
      setTitle("")
      setMessage("")
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send that announcement."),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Announcements</CardTitle>
        <CardDescription>
          Send a System Message to every customer&apos;s notification bell — only customers who have
          System Messages enabled in their own notification preferences receive it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <FieldRow label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance" />
          </FieldRow>
          <FieldRow label="Message">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What should customers know?"
              rows={3}
            />
          </FieldRow>
          <div>
            <Button
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending || !title.trim()}
            >
              {sendMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Send to All Customers
            </Button>
          </div>
        </div>

        <div className="border-t pt-4">
          <p className="mb-3 text-sm font-medium">Previously sent</p>
          {query.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : query.data && query.data.items.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {query.data.items.map((a) => (
                <li key={a.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{formatSentDate(a.created_at)}</p>
                  </div>
                  {a.message && <p className="mt-1 text-sm text-muted-foreground">{a.message}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Delivered to {a.recipient_count} customer{a.recipient_count === 1 ? "" : "s"}
                    {a.created_by_name ? ` · sent by ${a.created_by_name}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No announcements sent yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminSettings() {
  const [active, setActive] = useState<SectionKey>("general")

  // Every section here is a real, database-backed singleton — see
  // website_content.models.settings on the backend. Nothing in this page
  // is local-only state; every "Save Changes" button is a real PATCH.
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
              <CardContent className="flex flex-col gap-4">
                {general.isLoading ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
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
                    <div>
                      <Button onClick={general.save} disabled={general.isSaving}>
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

          {active === "announcements" && <AnnouncementsSection />}
        </div>
      </div>
    </div>
  )
}
