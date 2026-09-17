import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SupportSettingsState {
  supportEmail: string
  supportPhone: string
  websiteUrl: string
  setSupportSettings: (values: { supportEmail: string; supportPhone: string; websiteUrl: string }) => void
}

/**
 * Single source of truth for the public site's Support Email / Support
 * Phone (WhatsApp) / Website URL — set in Admin Dashboard → Settings →
 * General → Support & Website (src/pages/admin/Settings.tsx, the only
 * writer), read by Contact.tsx and Footer.tsx (see those files for the
 * exact usage). Deliberately its own store, separate from branding-store
 * (Company Logo/Favicon) — different concern, same pattern.
 *
 * Frontend-only for now, persisted to localStorage (not a backend) so a
 * configured value survives navigating around the app and a full browser
 * refresh, same as branding-store. When a real backend field/API exists
 * for these, only this file needs to change to source from that API
 * instead of localStorage — every consumer already reads through this
 * same store/hook shape.
 *
 * Values default to "" (unset). Consumers fall back to the existing
 * `usePublicSettings` Site Email/Phone (Basic Information) when a field
 * here is still empty, so nothing regresses to blank for a site that
 * hasn't configured Support & Website yet — see Contact.tsx/Footer.tsx.
 */
export const useSupportSettingsStore = create<SupportSettingsState>()(
  persist(
    (set) => ({
      supportEmail: "",
      supportPhone: "",
      websiteUrl: "",
      setSupportSettings: (values) => set(values),
    }),
    { name: "nexora-support-settings" },
  ),
)
