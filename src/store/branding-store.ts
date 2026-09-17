import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface BrandingAsset {
  name: string
  // A data: URL (base64-encoded), not a blob: object URL — this is what
  // makes persistence possible: a blob: URL is only valid for the life of
  // the tab that created it and would come back broken after a refresh,
  // while a data: URL is a plain string that round-trips through
  // localStorage/JSON exactly like any other persisted value.
  previewUrl: string
}

interface BrandingState {
  companyLogo: BrandingAsset | null
  favicon: BrandingAsset | null
  setCompanyLogo: (asset: BrandingAsset | null) => void
  setFavicon: (asset: BrandingAsset | null) => void
}

/**
 * Single source of truth for platform branding — the "Platform Logo" and
 * "Platform Favicon" conceptually shared by Admin Dashboard, Admin Login,
 * Customer Dashboard, Customer Login/Register, the Public Website, and
 * email branding (see Settings.tsx's Branding section, the only writer
 * today, and BrandMark.tsx for every read site). There is deliberately no
 * per-surface logo field anywhere — every consumer reads from this one
 * store instead of holding its own copy.
 *
 * Frontend-only for now, persisted to localStorage (not a backend) so an
 * uploaded logo/favicon survives navigating around the app and a full
 * browser refresh. When a real backend-persisted branding endpoint exists,
 * only this file needs to change to source `companyLogo`/`favicon` from
 * that API instead of localStorage — every consumer already reads through
 * this same store/hook shape.
 */
export const useBrandingStore = create<BrandingState>()(
  persist(
    (set) => ({
      companyLogo: null,
      favicon: null,
      setCompanyLogo: (asset) => set({ companyLogo: asset }),
      setFavicon: (asset) => set({ favicon: asset }),
    }),
    { name: "nexora-branding" },
  ),
)
