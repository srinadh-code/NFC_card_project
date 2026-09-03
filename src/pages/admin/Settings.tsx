import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import {
  Settings as SettingsIcon,
  CreditCard,
  Truck,
  Mail,
  MessageSquare,
  ShieldCheck,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useSettingsStore } from "@/store/settings-store"

const SECTIONS = [
  { key: "general", label: "General", icon: SettingsIcon },
  { key: "payment", label: "Payment Settings", icon: CreditCard },
  { key: "shipping", label: "Shipping Settings", icon: Truck },
  { key: "email", label: "Email Settings", icon: Mail },
  { key: "sms", label: "SMS Settings", icon: MessageSquare },
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

export default function AdminSettings() {
  const [active, setActive] = useState<SectionKey>("general")
  const settings = useSettingsStore((s) => s.settings)
  const updateSection = useSettingsStore((s) => s.updateSection)

  const [general, setGeneral] = useState(settings.general)
  const [payment, setPayment] = useState(settings.payment)
  const [shipping, setShipping] = useState(settings.shipping)
  const [email, setEmail] = useState(settings.email)
  const [sms, setSms] = useState(settings.sms)
  const [security, setSecurity] = useState(settings.security)

  function saveGeneral() {
    updateSection("general", general)
    toast.success("Settings saved successfully.")
  }
  function savePayment() {
    updateSection("payment", payment)
    toast.success("Settings saved successfully.")
  }
  function saveShipping() {
    updateSection("shipping", shipping)
    toast.success("Settings saved successfully.")
  }
  function saveEmail() {
    updateSection("email", email)
    toast.success("Settings saved successfully.")
  }
  function saveSms() {
    updateSection("sms", sms)
    toast.success("Settings saved successfully.")
  }
  function saveSecurity() {
    updateSection("security", security)
    toast.success("Settings saved successfully.")
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
                <CardDescription>Basic information about your TapLink platform.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FieldRow label="Site Name">
                    <Input value={general.siteName} onChange={(e) => setGeneral((v) => ({ ...v, siteName: e.target.value }))} />
                  </FieldRow>
                  <FieldRow label="Site Email">
                    <Input value={general.siteEmail} onChange={(e) => setGeneral((v) => ({ ...v, siteEmail: e.target.value }))} />
                  </FieldRow>
                  <FieldRow label="Site Phone">
                    <Input value={general.sitePhone} onChange={(e) => setGeneral((v) => ({ ...v, sitePhone: e.target.value }))} />
                  </FieldRow>
                  <FieldRow label="Currency">
                    <Select value={general.currency} onValueChange={(v) => setGeneral((s) => ({ ...s, currency: v }))}>
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
                    <Select value={general.timezone} onValueChange={(v) => setGeneral((s) => ({ ...s, timezone: v }))}>
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
                    <Input value={general.siteAddress} onChange={(e) => setGeneral((v) => ({ ...v, siteAddress: e.target.value }))} />
                  </FieldRow>
                </div>
                <div>
                  <Button onClick={saveGeneral}>Save Changes</Button>
                </div>
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FieldRow label="Razorpay Key ID">
                    <Input
                      type="password"
                      value={payment.razorpayKeyId}
                      onChange={(e) => setPayment((v) => ({ ...v, razorpayKeyId: e.target.value }))}
                    />
                  </FieldRow>
                  <FieldRow label="Razorpay Key Secret">
                    <Input
                      type="password"
                      value={payment.razorpaySecret}
                      onChange={(e) => setPayment((v) => ({ ...v, razorpaySecret: e.target.value }))}
                    />
                  </FieldRow>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Enable Cash on Delivery</p>
                    <p className="text-xs text-muted-foreground">Allow customers to pay on delivery for orders.</p>
                  </div>
                  <Switch
                    checked={payment.codEnabled}
                    onCheckedChange={(v) => setPayment((s) => ({ ...s, codEnabled: v }))}
                  />
                </div>
                <div>
                  <Button onClick={savePayment}>Save Changes</Button>
                </div>
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FieldRow label="Flat Shipping Rate (₹)">
                    <Input
                      type="number"
                      value={shipping.flatRate}
                      onChange={(e) => setShipping((v) => ({ ...v, flatRate: Number(e.target.value) }))}
                    />
                  </FieldRow>
                  <FieldRow label="Free Shipping Threshold (₹)">
                    <Input
                      type="number"
                      value={shipping.freeShippingThreshold}
                      onChange={(e) =>
                        setShipping((v) => ({ ...v, freeShippingThreshold: Number(e.target.value) }))
                      }
                    />
                  </FieldRow>
                </div>
                <div>
                  <Button onClick={saveShipping}>Save Changes</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {active === "email" && (
            <Card>
              <CardHeader>
                <CardTitle>Email Settings</CardTitle>
                <CardDescription>SMTP configuration used to send transactional emails.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FieldRow label="SMTP Host">
                    <Input value={email.smtpHost} onChange={(e) => setEmail((v) => ({ ...v, smtpHost: e.target.value }))} />
                  </FieldRow>
                  <FieldRow label="SMTP Port">
                    <Input
                      type="number"
                      value={email.smtpPort}
                      onChange={(e) => setEmail((v) => ({ ...v, smtpPort: Number(e.target.value) }))}
                    />
                  </FieldRow>
                  <FieldRow label="From Address">
                    <Input value={email.fromAddress} onChange={(e) => setEmail((v) => ({ ...v, fromAddress: e.target.value }))} />
                  </FieldRow>
                </div>
                <div>
                  <Button onClick={saveEmail}>Save Changes</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {active === "sms" && (
            <Card>
              <CardHeader>
                <CardTitle>SMS Settings</CardTitle>
                <CardDescription>Configure the SMS gateway used for OTPs and alerts.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FieldRow label="Provider">
                    <Select value={sms.provider} onValueChange={(v) => setSms((s) => ({ ...s, provider: v }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Twilio">Twilio</SelectItem>
                        <SelectItem value="MSG91">MSG91</SelectItem>
                        <SelectItem value="AWS SNS">AWS SNS</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldRow>
                  <FieldRow label="Sender ID">
                    <Input value={sms.senderId} onChange={(e) => setSms((v) => ({ ...v, senderId: e.target.value }))} />
                  </FieldRow>
                </div>
                <div>
                  <Button onClick={saveSms}>Save Changes</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {active === "security" && (
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Control admin authentication and session policy.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Require 2FA for admins</p>
                    <p className="text-xs text-muted-foreground">
                      Admins must verify with a second factor when logging in.
                    </p>
                  </div>
                  <Switch
                    checked={security.require2FA}
                    onCheckedChange={(v) => setSecurity((s) => ({ ...s, require2FA: v }))}
                  />
                </div>
                <FieldRow label="Session Timeout (minutes)">
                  <Input
                    type="number"
                    className="max-w-40"
                    value={security.sessionTimeoutMinutes}
                    onChange={(e) =>
                      setSecurity((v) => ({ ...v, sessionTimeoutMinutes: Number(e.target.value) }))
                    }
                  />
                </FieldRow>
                <div>
                  <Button onClick={saveSecurity}>Save Changes</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
