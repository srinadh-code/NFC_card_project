import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Globe2, KeyRound, Laptop, Monitor, Moon, Search, ShieldCheck, Smartphone, Sun, Trash2, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCustomerAuthStore } from "@/store/auth-store"
import { useDataStore, selectCustomerById } from "@/store/data-store"
import { useCustomerSettingsStore } from "@/store/customer-settings-store"
import { useThemeStore } from "@/store/theme-store"
import type { ThemeMode } from "@/types"

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun; description: string }[] = [
  { value: "light", label: "Light", icon: Sun, description: "Bright background, dark text." },
  { value: "dark", label: "Dark", icon: Moon, description: "Dark background, easy on the eyes." },
  { value: "system", label: "System", icon: Monitor, description: "Match your device setting." },
]

export default function CustomerSettings() {
  const navigate = useNavigate()
  const authCustomer = useCustomerAuthStore((s) => s.customer)
  const logout = useCustomerAuthStore((s) => s.logout)
  const customerRecord = useDataStore(selectCustomerById(authCustomer?.id ?? ""))
  const updateCustomer = useDataStore((s) => s.updateCustomer)

  const settings = useCustomerSettingsStore()
  const { mode, setMode } = useThemeStore()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  useEffect(() => {
    if (customerRecord) {
      setName(customerRecord.name)
      setEmail(customerRecord.email)
    } else if (authCustomer) {
      setName(authCustomer.name)
      setEmail(authCustomer.email)
    }
  }, [customerRecord, authCustomer])

  const [pwOpen, setPwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")

  const [sessionsOpen, setSessionsOpen] = useState(false)

  const [dangerOpen, setDangerOpen] = useState<"deactivate" | "delete" | null>(null)
  const [confirmText, setConfirmText] = useState("")

  if (!authCustomer) return null

  function handleSaveAccount() {
    if (!authCustomer) return
    updateCustomer(authCustomer.id, { name, email })
    toast.success("Account settings saved.")
  }

  function handleChangePassword() {
    if (!currentPw || !newPw || !confirmPw) {
      toast.error("Please fill in all password fields.")
      return
    }
    if (newPw !== confirmPw) {
      toast.error("New password and confirmation do not match.")
      return
    }
    if (newPw.length < 8) {
      toast.error("New password must be at least 8 characters.")
      return
    }
    toast.success("Password changed successfully.")
    setCurrentPw("")
    setNewPw("")
    setConfirmPw("")
    setPwOpen(false)
  }

  function handleToggle2fa(checked: boolean) {
    settings.setTwoFactorEnabled(checked)
    toast.success(checked ? "Two-factor authentication enabled." : "Two-factor authentication disabled.")
  }

  function handleRevokeSession(id: string) {
    settings.revokeSession(id)
    toast.success("Session revoked.")
  }

  function handleDangerConfirm() {
    logout()
    toast.success(dangerOpen === "delete" ? "Your account has been deleted." : "Your account has been deactivated.")
    setDangerOpen(null)
    setConfirmText("")
    navigate("/")
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account, privacy, appearance and security.</p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="settings-name">Full Name</Label>
            <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-email">Email</Label>
            <Input id="settings-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button variant="outline" type="button" onClick={() => setPwOpen(true)}>
              <KeyRound /> Change Password
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how VR's NEXORA looks on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as ThemeMode)}
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const selected = mode === opt.value
              return (
                <Label
                  key={opt.value}
                  htmlFor={`theme-${opt.value}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem value={opt.value} id={`theme-${opt.value}`} className="mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Icon className="size-4" />
                      {opt.label}
                    </div>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </Label>
              )
            })}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Privacy Settings</CardTitle>
          <CardDescription>Control what visitors can see on your public profile page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2">
              <Globe2 className="mt-0.5 size-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Make profile public</p>
                <p className="text-xs text-muted-foreground">
                  Turn off to hide your public card behind a private message.
                </p>
              </div>
            </div>
            <Switch checked={settings.profilePublic} onCheckedChange={settings.setProfilePublic} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2">
              <Users className="mt-0.5 size-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Show contact info on public profile</p>
                <p className="text-xs text-muted-foreground">
                  Hide the Call / Email / WhatsApp buttons from visitors.
                </p>
              </div>
            </div>
            <Switch checked={settings.showContactInfo} onCheckedChange={settings.setShowContactInfo} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2">
              <Search className="mt-0.5 size-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Show in search results</p>
                <p className="text-xs text-muted-foreground">Allow your profile to be discoverable via search.</p>
              </div>
            </div>
            <Switch checked={settings.showInSearch} onCheckedChange={settings.setShowInSearch} />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Email Notifications</p>
              <p className="text-xs text-muted-foreground">Get notified by email about account activity.</p>
            </div>
            <Switch checked={settings.emailNotifications} onCheckedChange={settings.setEmailNotifications} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Tap Alerts</p>
              <p className="text-xs text-muted-foreground">Get alerted whenever your card is tapped.</p>
            </div>
            <Switch checked={settings.tapAlerts} onCheckedChange={settings.setTapAlerts} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Marketing Emails</p>
              <p className="text-xs text-muted-foreground">Occasional product updates and offers.</p>
            </div>
            <Switch checked={settings.marketingEmails} onCheckedChange={settings.setMarketingEmails} />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Two-Factor Authentication</p>
                <p className="text-xs text-muted-foreground">Add an extra layer of security to your account.</p>
              </div>
            </div>
            <Switch checked={settings.twoFactorEnabled} onCheckedChange={handleToggle2fa} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Active Sessions</p>
              <p className="text-xs text-muted-foreground">{settings.sessions.length} device(s) signed in.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSessionsOpen(true)}>
              Manage
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Password</p>
              <p className="text-xs text-muted-foreground">Change the password used to sign in to VR's NEXORA.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>
              <KeyRound /> Change
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>These actions are irreversible in a real environment.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setDangerOpen("deactivate")}>
            Deactivate Account
          </Button>
          <Button variant="destructive" onClick={() => setDangerOpen("delete")}>
            <Trash2 /> Delete Account
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={handleSaveAccount}>
          Save Changes
        </Button>
      </div>

      {/* Change password dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Choose a strong password you don&apos;t use elsewhere.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="current-pw">Current Password</Label>
              <Input id="current-pw" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">New Password</Label>
              <Input id="new-pw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Confirm New Password</Label>
              <Input id="confirm-pw" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangePassword}>Update Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active sessions dialog */}
      <Dialog open={sessionsOpen} onOpenChange={setSessionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Active Sessions</DialogTitle>
            <DialogDescription>Devices currently signed in to your account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {settings.sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other active sessions.</p>
            ) : (
              settings.sessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    {session.device.toLowerCase().includes("iphone") || session.device.toLowerCase().includes("app") ? (
                      <Smartphone className="size-4 text-muted-foreground" />
                    ) : (
                      <Laptop className="size-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{session.device}</p>
                      <p className="text-xs text-muted-foreground">
                        {session.location} · {session.lastActive}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleRevokeSession(session.id)}>
                    Revoke
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Danger zone confirmation dialog */}
      <Dialog
        open={dangerOpen !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDangerOpen(null)
            setConfirmText("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dangerOpen === "delete" ? "Delete Account" : "Deactivate Account"}</DialogTitle>
            <DialogDescription>
              This will {dangerOpen === "delete" ? "permanently delete" : "deactivate"} your account and log you out.
              Type <span className="font-semibold text-foreground">DELETE</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Type DELETE to confirm" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDangerOpen(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={confirmText !== "DELETE"} onClick={handleDangerConfirm}>
              {dangerOpen === "delete" ? "Delete Account" : "Deactivate Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
