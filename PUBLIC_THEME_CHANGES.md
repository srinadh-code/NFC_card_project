# Public website navy and emerald theme

The public website uses a navy-dominant palette with emerald highlights, pale green surfaces, white cards, and matching light/dark styling. Layouts, fonts, spacing, content, images, animations, and event handlers are preserved.

## Theme configuration and isolation

- `src/public-theme.css` contains the public palette, public form contrast rules, and original-theme snapshots/reset.
- `src/components/layout/PublicLayout.tsx` scopes the palette to the public routes.
- `src/lib/theme-scope.ts` propagates the scope to portaled UI without changing the body or root theme.
- Dialog, Sheet, Select, Popover, DropdownMenu, and Tooltip contents use the public palette only when rendered inside that public React context.
- Dashboard/authentication routes and live digital profiles remain outside the public scope.
- Logo regions, PhoneMockup/PhoneFrame, and ProfilePhonePreview restore the original mode-aware colors, including their original gradients.
- Shared button/card and physical-card preview colors keep original fallbacks outside the public scope.

Deep navy is #0B1730, secondary navy is #142B46, emerald is #00A86B, bright green is #18C98A, soft green is #D8F5E7, and the light background is #F5F9F8. CTA/text emerald is darkened to #007A50 for contrast; white on that shade measures 5.39:1. Dark-mode mint on navy-card backgrounds measures 6.67:1. Semantic success, warning, error, and informational states are preserved.

## Validation

- `npm.cmd run build`: TypeScript and production build pass.
- `npm.cmd test`: all 129 frontend tests pass.
- `npm.cmd run lint`: exits successfully with existing repository warnings.
- `git diff --check`: passes.
- Browser fixtures verify original root/dashboard tokens, public tokens, all six portal types, and all five unchanged template palettes in both light and dark modes.
- Template inner markup and uploaded-image src/alt/classes remain identical across public/default theme contexts.
- The production build was smoke-tested at all 14 public entry routes. The empty guest checkout fixture correctly redirects from `/checkout` to `/checkout/verify`.
- Representative Home, Features, Shop/template gallery, How It Works, Contact, Cart, verification, success, and mobile-menu screenshots were checked at desktop/mobile widths without horizontal overflow.
- Navigating from the public site to `/purchaser` or `/u/visual` removes all public scopes; original light/dark root colors remain unchanged.
- Public Input/Textarea borders match #78968A/#648E7D, focus colors #007A50/#18C98A, and invalid borders the original red #EF4444/#F87171 in light/dark modes. Select border styling was checked with a SelectTrigger-slot CSS probe.
- No backend/database changes, form submissions, profile assignment writes, payment attempts, or deployment were performed.

## Visual limitations

- Original logos, uploaded artwork, and digital-template artwork retain their existing colors by design.
- Semantic status colors and the blue recipient-information notice are intentionally retained.
- Razorpay's external widget retains its existing theme; no Razorpay integration code was changed.
- App-wide neutral/semantic toasts remain outside the public layout scope.
- Browser checks use fixtures/mocked data and do not validate a real payment or production order submission.
- Public-page fixtures omit external CMS imagery; uploaded images were protected by unchanged source/URL/class rendering and template image-markup comparisons, rather than a pixel comparison against live remote assets.
- The existing large-bundle production warning and unrelated lint warnings remain.

## Modified source files (37)

- `src/components/checkout/DesignerContactNotice.tsx`
- `src/components/layout/Footer.tsx`
- `src/components/layout/Navbar.tsx`
- `src/components/layout/PublicLayout.tsx`
- `src/components/marketing/AnnouncementBanner.tsx`
- `src/components/marketing/CtaBanner.tsx`
- `src/components/marketing/DashboardMockup.tsx`
- `src/components/marketing/FeatureCard.tsx`
- `src/components/marketing/MissionShowcase.tsx`
- `src/components/marketing/NfcCardShowcase.tsx`
- `src/components/marketing/NfcShowcase.tsx`
- `src/components/marketing/PremiumCard.tsx`
- `src/components/marketing/ProfilePhonePreview.tsx`
- `src/components/marketing/ProfileThemeShowcase.tsx`
- `src/components/marketing/StatCounter.tsx`
- `src/components/marketing/StatWidget.tsx`
- `src/components/marketing/StatsShowcaseCard.tsx`
- `src/components/marketing/TestimonialCard.tsx`
- `src/components/shop/ProductDetails.tsx`
- `src/components/shop/ProductSelection.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/tooltip.tsx`
- `src/index.css`
- `src/lib/theme-scope.ts`
- `src/pages/public/About.tsx`
- `src/pages/public/CheckoutVerify.tsx`
- `src/pages/public/Contact.tsx`
- `src/pages/public/Features.tsx`
- `src/pages/public/Home.tsx`
- `src/pages/public/HowItWorks.tsx`
- `src/pages/public/Shop.tsx`
- `src/public-theme.css`

This report is also added as `PUBLIC_THEME_CHANGES.md`.
