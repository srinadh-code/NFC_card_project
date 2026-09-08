import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Globe2, KeyRound, Mail, Moon, Search, Sun, Monitor, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorState } from "@/components/customer/ErrorState"
import { useCustomerAuthStore } from "@/store/auth-store"
import { useThemeStore } from "@/store/theme-store"
import { ApiError, authApi, customerSettingsApi, profileApi } from "@/lib/api"
import { useEnsuredProfile } from "@/hooks/use-ensured-profile"
import type { ThemeMode } from "@/types"

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun; description: string }[] = [
  { value: "light", label: "Light", icon: Sun, description: "Bright background, dark text." },
  { value: "dark", label: "Dark", icon: Moon, description: "Dark background, easy on the eyes." },
  { value: "system", label: "System", icon: Monitor, description: "Match your device setting." },
]

function PrivacySettingsCard() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ["profile-privacy"], queryFn: profileApi.getPrivacySettings })

  const mutation = useMutation({
    mutationFn: profileApi.updatePrivacySettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-privacy"] })
      toast.success("Privacy settings updated.")
    },
    onError: () => toast.error("Couldn't save that change. Please try again."),
  })

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Privacy Settings</CardTitle>
        <CardDescription>Control what visitors can see on your public profile page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
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
              <Switch
                checked={query.data?.profilePublic ?? true}
                onCheckedChange={(v) => mutation.mutate({ profilePublic: v })}
                disabled={mutation.isPending}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-2">
                <Users className="mt-0.5 size-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">Show contact info on public profile</p>
                  <p className="text-xs text-muted-foreground">Hide your email and phone from visitors.</p>
                </div>
              </div>
              <Switch
                checked={query.data?.showContactInfo ?? true}
                onCheckedChange={(v) => mutation.mutate({ showContactInfo: v })}
                disabled={mutation.isPending}
              />
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
              <Switch
                checked={query.data?.showInSearch ?? true}
                onCheckedChange={(v) => mutation.mutate({ showInSearch: v })}
                disabled={mutation.isPending}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function PreferencesCard() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ["customer-settings"], queryFn: customerSettingsApi.getMine })

  const mutation = useMutation({
    mutationFn: customerSettingsApi.updateMine,
    onSuccess: (data) => {
      queryClient.setQueryData(["customer-settings"], data)
      toast.success("Preferences updated.")
    },
    onError: () => toast.error("Couldn't save that change. Please try again."),
  })

  const notifyItems: { key: "notify_order_updates" | "notify_nfc_updates" | "notify_profile_views" | "notify_system_messages"; label: string; description: string }[] = [
    { key: "notify_order_updates", label: "Order Updates", description: "Notify me when my order status changes." },
    { key: "notify_nfc_updates", label: "NFC Card Updates", description: "Notify me about my card's activation status." },
    { key: "notify_profile_views", label: "Profile Views", description: "Notify me about profile view activity." },
    { key: "notify_system_messages", label: "System Messages", description: "Product updates and announcements." },
  ]

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {query.isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : (
            notifyItems.map((item, i) => (
              <div key={item.key}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <Switch
                    checked={query.data?.[item.key] ?? true}
                    onCheckedChange={(v) => mutation.mutate({ [item.key]: v })}
                    disabled={mutation.isPending}
                  />
                </div>
                {i < notifyItems.length - 1 && <Separator className="mt-4" />}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Language &amp; Timezone</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {query.isLoading ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="language">Language</Label>
                <select
                  id="language"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={query.data?.language ?? "en"}
                  onChange={(e) => mutation.mutate({ language: e.target.value })}
                  disabled={mutation.isPending}
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="te">Telugu</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={query.data?.timezone ?? ""}
                  onChange={(e) => mutation.mutate({ timezone: e.target.value })}
                  disabled={mutation.isPending}
                  placeholder="Asia/Kolkata"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}

export default function CustomerSettings() {
  const authCustomer = useCustomerAuthStore((s) => s.customer)
  const { profile } = useEnsuredProfile()
  const queryClient = useQueryClient()
  const { mode, setMode } = useThemeStore()

  const [fullName, setFullName] = useState("")
  useEffect(() => {
    if (profile) setFullName(profile.fullName)
  }, [profile])

  const [pwOpen, setPwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")

  const saveNameMutation = useMutation({
    mutationFn: () => profileApi.updateMine({ fullName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-me"] })
      toast.success("Account settings saved.")
    },
    onError: () => toast.error("Couldn't save your name. Please try again."),
  })

  const changePasswordMutation = useMutation({
    mutationFn: () => authApi.changePassword({ current_password: currentPw, new_password: newPw }),
    onSuccess: () => {
      toast.success("Password changed successfully.")
      setCurrentPw("")
      setNewPw("")
      setConfirmPw("")
      setPwOpen(false)
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Couldn't change your password. Please try again."
      toast.error(message)
    },
  })

  if (!authCustomer) return null

  function handleChangePassword() {
    if (!currentPw || !newPw || !confirmPw) {
      toast.error("Please fill in all password fields.")
      return
    }
    if (newPw !== confirmPw) {
      toast.error("New password and confirmation do not match.")
      return
    }
    changePasswordMutation.mutate()
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
            <Input id="settings-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="settings-email" type="email" value={authCustomer.email} disabled className="pl-9" />
            </div>
            <p className="text-xs text-muted-foreground">Contact support to change your login email.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button onClick={() => saveNameMutation.mutate()} disabled={saveNameMutation.isPending}>
              {saveNameMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
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

      <PrivacySettingsCard />
      <PreferencesCard />

      <Card className="rounded-2xl border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Account</CardTitle>
          <CardDescription>Deleting or deactivating an account isn&apos;t self-serve yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            To close or deactivate your account, email{" "}
            <a href="mailto:support@vrsnexora.com" className="font-medium text-primary hover:underline">
              support@vrsnexora.com
            </a>{" "}
            and our team will take care of it.
          </p>
        </CardContent>
      </Card>

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
            <Button onClick={handleChangePassword} disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
