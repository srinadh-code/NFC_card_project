import { create } from "zustand"
import { persist } from "zustand/middleware"

interface Session {
  id: string
  device: string
  location: string
  lastActive: string
}

interface CustomerSettingsState {
  emailNotifications: boolean
  tapAlerts: boolean
  marketingEmails: boolean
  twoFactorEnabled: boolean
  sessions: Session[]
  // Privacy / profile visibility — gates what the public profile page renders.
  profilePublic: boolean
  showContactInfo: boolean
  showInSearch: boolean
  setEmailNotifications: (v: boolean) => void
  setTapAlerts: (v: boolean) => void
  setMarketingEmails: (v: boolean) => void
  setTwoFactorEnabled: (v: boolean) => void
  revokeSession: (id: string) => void
  setProfilePublic: (v: boolean) => void
  setShowContactInfo: (v: boolean) => void
  setShowInSearch: (v: boolean) => void
}

const DEFAULT_SESSIONS: Session[] = [
  { id: "SES001", device: "Chrome on Windows", location: "Hyderabad, Telangana", lastActive: "Active now" },
  { id: "SES002", device: "TapLink App on iPhone 14", location: "Hyderabad, Telangana", lastActive: "2 hours ago" },
  { id: "SES003", device: "Safari on MacBook Pro", location: "Bengaluru, Karnataka", lastActive: "3 days ago" },
]

export const useCustomerSettingsStore = create<CustomerSettingsState>()(
  persist(
    (set) => ({
      emailNotifications: true,
      tapAlerts: true,
      marketingEmails: false,
      twoFactorEnabled: false,
      sessions: DEFAULT_SESSIONS,
      profilePublic: true,
      showContactInfo: true,
      showInSearch: true,
      setEmailNotifications: (v) => set({ emailNotifications: v }),
      setTapAlerts: (v) => set({ tapAlerts: v }),
      setMarketingEmails: (v) => set({ marketingEmails: v }),
      setTwoFactorEnabled: (v) => set({ twoFactorEnabled: v }),
      revokeSession: (id) => set((s) => ({ sessions: s.sessions.filter((session) => session.id !== id) })),
      setProfilePublic: (v) => set({ profilePublic: v }),
      setShowContactInfo: (v) => set({ showContactInfo: v }),
      setShowInSearch: (v) => set({ showInSearch: v }),
    }),
    { name: "taplink-customer-settings" },
  ),
)
