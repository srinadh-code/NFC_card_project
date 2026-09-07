import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Camera, Globe } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { CustomFieldsEditor } from "@/components/customer/CustomFieldsEditor"
import { ProfileNotReady } from "@/components/customer/ProfileNotReady"
import { useEnsuredProfile } from "@/hooks/use-ensured-profile"
import type { CustomField } from "@/types"
import { profileApi } from "@/lib/api"

interface FormState {
  fullName: string
  designation: string
  company: string
  email: string
  phone: string
  website: string
  address: string
  bio: string
  avatar: string
}

export default function CustomerProfile() {
  const { customer, profile, stuck, retry } = useEnsuredProfile()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState | null>(null)
  const [customFields, setCustomFields] = useState<CustomField[]>([])

  useEffect(() => {
    if (profile && !form) {
      setForm({
        fullName: profile.fullName,
        designation: profile.designation,
        company: profile.company,
        email: profile.email,
        phone: profile.phone,
        website: profile.website,
        address: profile.address,
        bio: profile.bio,
        avatar: profile.avatar,
      })
      setCustomFields(profile.customFields)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const mutation = useMutation({
    mutationFn: async (payload: { form: FormState; customFields: CustomField[] }) => {
      if (!profile || !customer) throw new Error("missing profile")
      await profileApi.updateMine({
        fullName: payload.form.fullName,
        designation: payload.form.designation,
        company: payload.form.company,
        phone: payload.form.phone,
        website: payload.form.website,
        address: payload.form.address,
        bio: payload.form.bio,
      })
      await profileApi.saveCustomFields(payload.customFields)
    },
    onSuccess: () => {
      toast.success("Profile updated successfully.")
      queryClient.invalidateQueries({ queryKey: ["profile-me"] })
    },
    onError: () => toast.error("Something went wrong while saving your profile."),
  })

  const avatarMutation = useMutation({
    mutationFn: (file: File) => profileApi.uploadAvatar(file),
    onSuccess: () => {
      toast.success("Photo updated.")
      queryClient.invalidateQueries({ queryKey: ["profile-me"] })
    },
    onError: () => toast.error("Couldn't update your photo. Please try again."),
  })

  function handleChange<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  function handlePhotoClick() {
    fileInputRef.current?.click()
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    handleChange("avatar", URL.createObjectURL(file))
    avatarMutation.mutate(file)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    mutation.mutate({ form, customFields })
  }

  if (!customer) return null

  if (stuck) {
    return (
      <div className="mx-auto max-w-3xl">
        <ProfileNotReady onRetry={retry} />
      </div>
    )
  }

  if (!profile || !form) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const initials = form.fullName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground">
          This information appears on your public digital business card.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Profile Photo</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-5">
            <Avatar className="size-20">
              <AvatarImage src={form.avatar} alt={form.fullName} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
              <Button type="button" variant="outline" onClick={handlePhotoClick}>
                <Camera /> Change Photo
              </Button>
              <p className="text-xs text-muted-foreground">JPG, PNG or GIF. Max 5MB.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Basic Details</CardTitle>
            <CardDescription>Your professional identity, shown to everyone who scans your card.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={form.fullName} onChange={(e) => handleChange("fullName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="designation">Designation</Label>
              <Input
                id="designation"
                value={form.designation}
                onChange={(e) => handleChange("designation", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company">Company</Label>
              <Input id="company" value={form.company} onChange={(e) => handleChange("company", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} disabled />
              <p className="text-xs text-muted-foreground">
                Your login email can&apos;t be changed here. Contact support if you need it updated.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => handleChange("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="website"
                  value={form.website}
                  onChange={(e) => handleChange("website", e.target.value)}
                  placeholder="https://yourname.com"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={form.address} onChange={(e) => handleChange("address", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                rows={4}
                value={form.bio}
                onChange={(e) => handleChange("bio", e.target.value)}
                placeholder="A short line about what you do..."
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Custom Fields</CardTitle>
            <CardDescription>
              Add unlimited extra details to your public card — GST Number, Office Address, Years of Experience,
              Portfolio Link, and more. Drag to reorder.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomFieldsEditor fields={customFields} onChange={setCustomFields} />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  )
}
