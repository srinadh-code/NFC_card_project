import { Building2, ChevronRight, Flag, Map as MapIcon, MapPin, Navigation } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Profile } from "@/types"
import { getCustomLinkVisual, SOCIAL_BRAND, useProfileSections } from "./shared"

/** The data sections every template shares below its unique hero: social
 * links, services, contact/address, custom fields, custom links. Themed via
 * `accent` (icon-chip color) and `chipShape` so each template still reads as
 * visually distinct, without re-deriving the same filtering/sorting logic
 * and markup nine separate times. */
export function BodySections({
  profile,
  showContactInfo = true,
  accent,
  labelColor = "text-muted-foreground",
  chipShape = "circle",
  ctaColor,
}: {
  profile: Profile
  showContactInfo?: boolean
  accent: string
  labelColor?: string
  chipShape?: "circle" | "rounded" | "square"
  ctaColor: string
}) {
  const { enabledSocial, enabledCustom, customFields, activeServices, hasAddressInfo } = useProfileSections(
    profile,
    showContactInfo,
  )
  const chipRadius = chipShape === "circle" ? "rounded-full" : chipShape === "rounded" ? "rounded-2xl" : "rounded-lg"

  return (
    <>
      {enabledSocial.length > 0 && (
        <div className="mt-7 w-full">
          <SectionLabel color={labelColor} accent={accent}>
            Social Links
          </SectionLabel>
          <div className="grid grid-cols-4 gap-3">
            {enabledSocial.map((link) => {
              const brand = SOCIAL_BRAND[link.platform]
              const Icon = brand.icon
              return (
                <a
                  key={link.platform}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center gap-1"
                  title={brand.label}
                >
                  <span
                    className={cn("flex size-11 items-center justify-center text-white shadow-sm transition-transform hover:scale-105", chipRadius)}
                    style={{ background: brand.background }}
                  >
                    <Icon className={cn("size-5", brand.iconClassName)} />
                  </span>
                  <span className="truncate text-[10px] font-medium text-muted-foreground">{brand.label}</span>
                </a>
              )
            })}
          </div>
        </div>
      )}

      {activeServices.length > 0 && (
        <div className="mt-7 w-full">
          <SectionLabel color={labelColor} accent={accent}>
            Services
          </SectionLabel>
          <div className="space-y-3.5 text-left">
            {activeServices.map((service) => (
              <div key={service.id} className="flex items-start gap-3">
                <span
                  className={cn("flex size-8 shrink-0 items-center justify-center text-white", chipRadius)}
                  style={{ background: accent }}
                >
                  <Building2 className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{service.title}</p>
                  {service.description && <p className="text-xs text-muted-foreground">{service.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(hasAddressInfo || profile.googleMapsUrl) && (
        <div className="mt-7 w-full">
          <SectionLabel color={labelColor} accent={accent}>
            Contact
          </SectionLabel>
          <div className="space-y-2.5">
            {profile.address && <ContactRow icon={MapPin} accent={accent} title="Address" value={profile.address} chipRadius={chipRadius} />}
            {profile.city && <ContactRow icon={Building2} accent={accent} title="City" value={profile.city} chipRadius={chipRadius} />}
            {profile.state && <ContactRow icon={MapIcon} accent={accent} title="State" value={profile.state} chipRadius={chipRadius} />}
            {profile.country && <ContactRow icon={Flag} accent={accent} title="Country" value={profile.country} chipRadius={chipRadius} />}
            {profile.googleMapsUrl && (
              <a
                href={profile.googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5"
                style={{ background: ctaColor }}
              >
                <Navigation className="size-4" />
                Open in Maps
              </a>
            )}
          </div>
        </div>
      )}

      {customFields.length > 0 && (
        <div className="mt-7 w-full">
          <SectionLabel color={labelColor} accent={accent}>
            Custom Details
          </SectionLabel>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {customFields.map((field) => (
              <div key={field.id} className="rounded-2xl border border-border/70 bg-muted/30 px-3.5 py-2.5 text-left">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {field.label || "Untitled"}
                </p>
                <p className="truncate text-sm font-semibold text-foreground" title={field.value}>
                  {field.value || "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {enabledCustom.length > 0 && (
        <div className="mt-7 w-full">
          <SectionLabel color={labelColor} accent={accent}>
            Custom Links
          </SectionLabel>
          <div className="grid grid-cols-4 gap-3">
            {enabledCustom.map((link) => {
              const { icon: Icon, color } = getCustomLinkVisual(link.label)
              return (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center gap-1"
                  title={link.label}
                >
                  <span className={cn("flex size-11 items-center justify-center text-white shadow-sm transition-transform hover:scale-105", chipRadius)} style={{ background: color }}>
                    <Icon className="size-5" />
                  </span>
                  <span className="max-w-[56px] truncate text-[10px] font-medium text-muted-foreground">{link.label}</span>
                </a>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

function SectionLabel({ children, color, accent }: { children: React.ReactNode; color: string; accent: string }) {
  return (
    <p className={cn("mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide", color)}>
      <span className="h-px w-4" style={{ background: accent }} />
      {children}
    </p>
  )
}

function ContactRow({
  icon: Icon,
  accent,
  title,
  value,
  chipRadius,
}: {
  icon: typeof MapPin
  accent: string
  title: string
  value: string
  chipRadius: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-white p-3 shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
      <span className={cn("flex size-9 shrink-0 items-center justify-center text-white", chipRadius)} style={{ background: accent }}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[11px] font-medium text-muted-foreground">{title}</span>
        <span className="block truncate text-sm font-semibold text-foreground">{value}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </div>
  )
}
