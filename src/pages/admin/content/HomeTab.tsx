import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { SingletonSectionCard } from "@/components/admin/content/SingletonSectionCard"
import { ImageUploadField } from "@/components/admin/content/ImageUploadField"
import { IconPickerInput } from "@/components/admin/content/IconPickerInput"
import { ResourceListPage } from "@/components/admin/content/ResourceListPage"
import { useSingletonSection } from "@/components/admin/content/useSingletonSection"
import { ctaApi, heroApi, heroFeaturesApi, howItFeelsApi, howItFeelsPointsApi } from "@/lib/contentApi"
import type { Cta, Hero, HeroFeature, HowItFeels, HowItFeelsPoint } from "@/types/content"

// Small uppercase divider that groups the fields below it under the actual
// visual section of the public Home page they control — the Home tab
// otherwise reads as one flat list of cards with no indication of page order.
function SectionGroupLabel({ children }: { children: string }) {
  return (
    <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
      {children}
    </p>
  )
}

function HeroSection() {
  const hero = useSingletonSection<Hero>({
    queryKey: ["content", "home", "hero"],
    get: heroApi.get,
    update: heroApi.update,
    label: "Hero",
  })

  return (
    <SingletonSectionCard
      title="Hero Banner"
      description="The very first thing visitors see at the top of the Home page: badge, big heading, description, the two buttons, and the hero image."
      isLoading={hero.isLoading}
      isSaving={hero.isSaving}
      onSave={hero.save}
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Hero Image</Label>
        <ImageUploadField
          currentUrl={hero.values.hero_image_url}
          disabled={!hero.data}
          onUpload={async (file) => hero.applyServerUpdate(await heroApi.uploadImage(file))}
          onRemove={async () => hero.applyServerUpdate(await heroApi.removeImage())}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="hero-badge">Badge</Label>
        <Input id="hero-badge" value={hero.values.badge ?? ""} onChange={(e) => hero.setField("badge", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="hero-heading">Heading</Label>
        <Input id="hero-heading" value={hero.values.heading ?? ""} onChange={(e) => hero.setField("heading", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="hero-description">Description</Label>
        <Textarea id="hero-description" value={hero.values.description ?? ""} onChange={(e) => hero.setField("description", e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <SectionGroupLabel>Primary Button (solid, e.g. "Order Your Card")</SectionGroupLabel>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hero-primary-text">Primary Button Text</Label>
        <Input id="hero-primary-text" value={hero.values.primary_cta_text ?? ""} onChange={(e) => hero.setField("primary_cta_text", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hero-primary-link">Primary Button Link</Label>
        <Input id="hero-primary-link" placeholder="/shop" value={hero.values.primary_cta_link ?? ""} onChange={(e) => hero.setField("primary_cta_link", e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <SectionGroupLabel>Secondary Button (outlined, e.g. "Watch Demo")</SectionGroupLabel>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hero-secondary-text">Secondary Button Text</Label>
        <Input id="hero-secondary-text" value={hero.values.secondary_cta_text ?? ""} onChange={(e) => hero.setField("secondary_cta_text", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hero-secondary-link">Secondary Button Link</Label>
        <Input id="hero-secondary-link" placeholder="leave blank to open the demo popup instead of navigating" value={hero.values.secondary_cta_link ?? ""} onChange={(e) => hero.setField("secondary_cta_link", e.target.value)} />
      </div>
    </SingletonSectionCard>
  )
}

function HeroFeaturesSection() {
  return (
    <ResourceListPage<HeroFeature>
      api={heroFeaturesApi}
      queryKey={["content", "home", "hero-features"]}
      resourceLabel="Hero Highlight"
      description='The small checkmark bullet list under the Hero description (e.g. "Instant Sharing", "Cloud Backup").'
      getRowLabel={(item) => item.label}
      createDefaults={(existing) => ({ icon: "Zap", label: "", display_order: existing.length, is_active: true })}
      columns={[
        { key: "icon", label: "Icon", render: (item) => item.icon },
        { key: "label", label: "Label", render: (item) => item.label },
      ]}
      renderForm={({ values, setField }) => (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Icon</Label>
            <IconPickerInput value={values.icon ?? ""} onChange={(v) => setField("icon", v)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Label</Label>
            <Input value={values.label ?? ""} onChange={(e) => setField("label", e.target.value)} />
          </div>
        </>
      )}
    />
  )
}

function HowItFeelsSection() {
  const howItFeels = useSingletonSection<HowItFeels>({
    queryKey: ["content", "home", "how-it-feels"],
    get: howItFeelsApi.get,
    update: howItFeelsApi.update,
    label: "How It Feels",
  })

  return (
    <SingletonSectionCard
      title="NFC Showcase Section"
      description={'The section right after the Hero — the badge + heading + description shown above the tap-gesture illustration (e.g. "How It Feels").'}
      isLoading={howItFeels.isLoading}
      isSaving={howItFeels.isSaving}
      onSave={howItFeels.save}
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="hif-badge">Badge</Label>
        <Input id="hif-badge" value={howItFeels.values.badge ?? ""} onChange={(e) => howItFeels.setField("badge", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="hif-heading">Heading</Label>
        <Input id="hif-heading" value={howItFeels.values.heading ?? ""} onChange={(e) => howItFeels.setField("heading", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="hif-description">Description</Label>
        <Textarea id="hif-description" value={howItFeels.values.description ?? ""} onChange={(e) => howItFeels.setField("description", e.target.value)} />
      </div>
    </SingletonSectionCard>
  )
}

function HowItFeelsPointsSection() {
  return (
    <ResourceListPage<HowItFeelsPoint>
      api={howItFeelsPointsApi}
      queryKey={["content", "home", "how-it-feels-points"]}
      resourceLabel="Point"
      description="The bullet points listed inside the NFC Showcase card, each with its own icon."
      getRowLabel={(item) => item.text}
      createDefaults={(existing) => ({ icon: "Zap", text: "", display_order: existing.length, is_active: true })}
      columns={[
        { key: "icon", label: "Icon", render: (item) => item.icon },
        { key: "text", label: "Text", render: (item) => item.text },
      ]}
      renderForm={({ values, setField }) => (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Icon</Label>
            <IconPickerInput value={values.icon ?? ""} onChange={(v) => setField("icon", v)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Text</Label>
            <Input value={values.text ?? ""} onChange={(e) => setField("text", e.target.value)} />
          </div>
        </>
      )}
    />
  )
}

function CtaSection() {
  const cta = useSingletonSection<Cta>({
    queryKey: ["content", "home", "cta"],
    get: ctaApi.get,
    update: ctaApi.update,
    label: "CTA",
  })

  return (
    <SingletonSectionCard
      title="Bottom CTA Section"
      description='The closing "Contact CTA" card near the bottom of the Home page, just above the final banner.'
      isLoading={cta.isLoading}
      isSaving={cta.isSaving}
      onSave={cta.save}
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="cta-heading">Heading</Label>
        <Input id="cta-heading" value={cta.values.heading ?? ""} onChange={(e) => cta.setField("heading", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="cta-description">Description</Label>
        <Textarea id="cta-description" value={cta.values.description ?? ""} onChange={(e) => cta.setField("description", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cta-button-text">Button Text</Label>
        <Input id="cta-button-text" value={cta.values.button_text ?? ""} onChange={(e) => cta.setField("button_text", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cta-button-link">Button Link</Label>
        <Input id="cta-button-link" placeholder="/contact" value={cta.values.button_link ?? ""} onChange={(e) => cta.setField("button_link", e.target.value)} />
      </div>
    </SingletonSectionCard>
  )
}

// Not editable here, but real sections of the Home page all the same — this
// is the map an admin needs so "Home" doesn't feel like it's missing content
// that's visibly on the page. Kept read-only/static: pointing this at the
// wrong tab or a stale row count would be worse than no map at all.
function OtherHomeSectionsNote() {
  const rows: { section: string; managedIn: string }[] = [
    { section: '"Trusted by" company logos', managedIn: "Companies tab" },
    { section: "Stats row (e.g. taps, users)", managedIn: 'Statistics tab, filtered to "Home"' },
    { section: '"Our Story" values grid', managedIn: "Values tab" },
    { section: '"Why Choose" feature cards', managedIn: "Features tab" },
    { section: "Testimonials", managedIn: "Testimonials tab" },
    { section: "FAQ preview (shares data with the full FAQ page)", managedIn: "FAQs tab" },
  ]

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Other Sections on This Page</h3>
          <p className="text-sm text-muted-foreground">
            These also appear on the public Home page but are shared with other pages, so they're
            managed in their own tabs rather than duplicated here.
          </p>
        </div>
        <ul className="flex flex-col gap-1.5 text-sm">
          {rows.map((row) => (
            <li key={row.section} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b py-1.5 last:border-b-0">
              <span className="text-foreground">{row.section}</span>
              <span className="text-muted-foreground">{row.managedIn}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Two more bits of Home page text ("Our Story" paragraphs and the final "Ready to
          Experience..." banner) are still hardcoded in the page itself and aren't editable from
          here yet.
        </p>
      </CardContent>
    </Card>
  )
}

export default function HomeTab() {
  return (
    <div className="flex flex-col gap-6">
      <HeroSection />
      <HeroFeaturesSection />
      <HowItFeelsSection />
      <HowItFeelsPointsSection />
      <CtaSection />
      <OtherHomeSectionsNote />
    </div>
  )
}
