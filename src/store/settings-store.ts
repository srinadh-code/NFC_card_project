import { create } from "zustand"
import { persist } from "zustand/middleware"

// NOTE: General (site name/email/phone/address/currency/timezone) used to
// live here as local-only state. It's now backed by the real database —
// see settingsApi in lib/contentApi.ts and the General tab in
// pages/admin/Settings.tsx, which uses useSingletonSection directly instead
// of this store. The database is the single source of truth; nothing here
// should re-introduce a local copy of those values.
export interface AdminSettings {
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
    smtpHost: "smtp.vrsnexora.com",
    smtpPort: 587,
    fromAddress: "no-reply@vrsnexora.com",
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
