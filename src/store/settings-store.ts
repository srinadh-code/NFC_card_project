import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface AdminSettings {
  general: {
    siteName: string
    siteEmail: string
    sitePhone: string
    siteAddress: string
    currency: string
    timezone: string
  }
  payment: {
    razorpayKeyId: string
    razorpaySecret: string
    codEnabled: boolean
  }
  shipping: {
    flatRate: number
    freeShippingThreshold: number
  }
  email: {
    smtpHost: string
    smtpPort: number
    fromAddress: string
  }
  sms: {
    provider: string
    senderId: string
  }
  security: {
    require2FA: boolean
    sessionTimeoutMinutes: number
  }
}

const DEFAULT_SETTINGS: AdminSettings = {
  general: {
    siteName: "TapLink",
    siteEmail: "support@taplink.com",
    sitePhone: "+91 90000 12345",
    siteAddress: "Hyderabad, Telangana, India",
    currency: "INR",
    timezone: "Asia/Kolkata",
  },
  payment: {
    razorpayKeyId: "rzp_test_XXXXXXXXXXXX",
    razorpaySecret: "••••••••••••••••",
    codEnabled: true,
  },
  shipping: {
    flatRate: 49,
    freeShippingThreshold: 999,
  },
  email: {
    smtpHost: "smtp.taplink.com",
    smtpPort: 587,
    fromAddress: "no-reply@taplink.com",
  },
  sms: {
    provider: "Twilio",
    senderId: "TAPLNK",
  },
  security: {
    require2FA: false,
    sessionTimeoutMinutes: 30,
  },
}

interface SettingsState {
  settings: AdminSettings
  updateSection: <K extends keyof AdminSettings>(section: K, patch: Partial<AdminSettings[K]>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      updateSection: (section, patch) =>
        set((s) => ({
          settings: { ...s.settings, [section]: { ...s.settings[section], ...patch } },
        })),
    }),
    { name: "taplink-admin-settings" },
  ),
)
