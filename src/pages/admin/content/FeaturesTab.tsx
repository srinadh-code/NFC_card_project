import { useQueryClient } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { SingletonSectionCard } from "@/components/admin/content/SingletonSectionCard"
import { ImageUploadField } from "@/components/admin/content/ImageUploadField"
import { IconPickerInput } from "@/components/admin/content/IconPickerInput"
import { ResourceListPage } from "@/components/admin/content/ResourceListPage"
import { useSingletonSection } from "@/components/admin/content/useSingletonSection"
import { StatisticsForPage } from "./StatisticsTab"
import {
  featuresAnalyticsApi,
  featuresCardsApi,
  featuresCTAApi,
  featuresPageApi,
  featuresShowcaseApi,
} from "@/lib/contentApi"
import type {
  FeaturesAnalyticsSection,
  FeaturesCTA,
  FeaturesPageCard,
  FeaturesPageSettings,
  FeaturesShowcaseSection,
} from "@/types/content"

function HeroSection() {
  const page = useSingletonSection<FeaturesPageSettings>({
    queryKey: ["content", "features", "page"],
    get: featuresPageApi.get,
    update: featuresPageApi.update,
    label: "Features Page",
  })

  return (
    <SingletonSectionCard
      title="Hero & Page Settings"
      description="The top of the Features page: hero copy, CTAs, trust line, and the feature-grid section's own heading."
      isLoading={page.isLoading}
      isSaving={page.isSaving}
      onSave={page.save}
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Hero Image</Label>
        <ImageUploadField
          currentUrl={page.values.hero_image_url}
          disabled={!page.data}
          onUpload={async (file) => page.applyServerUpdate(await featuresPageApi.uploadHeroImage(file))}
          onRemove={async () => page.applyServerUpdate(await featuresPageApi.removeHeroImage())}
        />
        <p className="text-xs text-muted-foreground">
          JPEG, PNG, WEBP or SVG, up to 5MB. Optional — the hero shows the built-in NFC card
          graphic when no image is uploaded.
        </p>
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fp-title">Page Title</Label>
        <Input id="fp-title" value={page.values.page_title ?? ""} onChange={(e) => page.setField("page_title", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fp-subtitle">Page Subtitle</Label>
        <Textarea id="fp-subtitle" value={page.values.page_subtitle ?? ""} onChange={(e) => page.setField("page_subtitle", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fp-hero-badge">Hero Badge</Label>
        <Input id="fp-hero-badge" value={page.values.hero_badge ?? ""} onChange={(e) => page.setField("hero_badge", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fp-heading-1">Hero Heading — Line 1</Label>
        <Input
          id="fp-heading-1"
          value={page.values.hero_heading_line1 ?? ""}
          onChange={(e) => page.setField("hero_heading_line1", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fp-heading-2">Hero Heading — Line 2 (gradient)</Label>
        <Input
          id="fp-heading-2"
          value={page.values.hero_heading_line2 ?? ""}
          onChange={(e) => page.setField("hero_heading_line2", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fp-hero-description">Hero Description</Label>
        <Textarea
          id="fp-hero-description"
          value={page.values.hero_description ?? ""}
          onChange={(e) => page.setField("hero_description", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fp-primary-cta-text">Primary Button Text</Label>
        <Input
          id="fp-primary-cta-text"
          value={page.values.primary_cta_text ?? ""}
          onChange={(e) => page.setField("primary_cta_text", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fp-primary-cta-url">Primary Button URL</Label>
        <Input
          id="fp-primary-cta-url"
          placeholder="/shop"
          value={page.values.primary_cta_url ?? ""}
          onChange={(e) => page.setField("primary_cta_url", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fp-secondary-cta-text">Secondary Button Text</Label>
        <Input
          id="fp-secondary-cta-text"
          value={page.values.secondary_cta_text ?? ""}
          onChange={(e) => page.setField("secondary_cta_text", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fp-secondary-cta-url">Secondary Button URL</Label>
        <Input
          id="fp-secondary-cta-url"
          placeholder="Leave blank to open the demo dialog instead of navigating"
          value={page.values.secondary_cta_url ?? ""}
          onChange={(e) => page.setField("secondary_cta_url", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fp-trusted-count">Trusted Users Count</Label>
        <Input
          id="fp-trusted-count"
          placeholder="10,000+"
          value={page.values.trusted_users_count ?? ""}
          onChange={(e) => page.setField("trusted_users_count", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fp-trust-badge">Trust Line Label</Label>
        <Input
          id="fp-trust-badge"
          placeholder="professionals"
          value={page.values.trust_badge_text ?? ""}
          onChange={(e) => page.setField("trust_badge_text", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Renders as "Trusted by {"{count}"} {"{this label}"}".</p>
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fp-grid-heading">Feature Grid Heading</Label>
        <Input
          id="fp-grid-heading"
          value={page.values.features_grid_heading ?? ""}
          onChange={(e) => page.setField("features_grid_heading", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fp-grid-subtitle">Feature Grid Subtitle</Label>
        <Textarea
          id="fp-grid-subtitle"
          value={page.values.features_grid_subtitle ?? ""}
          onChange={(e) => page.setField("features_grid_subtitle", e.target.value)}
        />
      </div>
    </SingletonSectionCard>
  )
}

function FeatureCardsSection() {
  const queryClient = useQueryClient()
  const queryKey = ["content", "features", "cards"]
  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  return (
    <ResourceListPage<FeaturesPageCard>
      api={featuresCardsApi}
      queryKey={queryKey}
      resourceLabel="Feature Card"
      description='The "Everything You Need, Built In" grid.'
      getRowLabel={(item) => item.title}
      searchPredicate={(item, q) => item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)}
      createDefaults={(existing) => ({
        icon: "Zap",
        title: "",
        description: "",
        gradient: "",
        cta_text: "",
        cta_url: "",
        display_order: existing.length,
        is_active: true,
      })}
      columns={[
        {
          key: "image",
          label: "Image",
          render: (item) => (
            <ImageUploadField
              currentUrl={item.image_url}
              onUpload={async (file) => {
                await featuresCardsApi.uploadImage(item.id, file)
                invalidate()
              }}
              onRemove={async () => {
                await featuresCardsApi.removeImage(item.id)
                invalidate()
              }}
            />
          ),
        },
        { key: "icon", label: "Icon", render: (item) => item.icon },
        { key: "title", label: "Title", render: (item) => item.title },
        {
          key: "description",
          label: "Description",
          className: "max-w-xs truncate whitespace-normal",
          render: (item) => <span className="line-clamp-2 text-muted-foreground">{item.description}</span>,
        },
      ]}
      renderForm={({ values, setField }) => (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Icon</Label>
            <IconPickerInput value={values.icon ?? ""} onChange={(v) => setField("icon", v)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={values.title ?? ""} onChange={(e) => setField("title", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea value={values.description ?? ""} onChange={(e) => setField("description", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Gradient (optional CSS gradient — used when no image is uploaded)</Label>
            <Input
              placeholder="linear-gradient(135deg,#4F46E5,#7C3AED)"
              value={values.gradient ?? ""}
              onChange={(e) => setField("gradient", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Card Link Text (optional)</Label>
            <Input value={values.cta_text ?? ""} onChange={(e) => setField("cta_text", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Card Link URL (optional)</Label>
            <Input value={values.cta_url ?? ""} onChange={(e) => setField("cta_url", e.target.value)} />
          </div>
        </>
      )}
    />
  )
}

function AnalyticsSection() {
  const analytics = useSingletonSection<FeaturesAnalyticsSection>({
    queryKey: ["content", "features", "analytics"],
    get: featuresAnalyticsApi.get,
    update: featuresAnalyticsApi.update,
    label: "Analytics Section",
  })

  return (
    <SingletonSectionCard
      title="Analytics Section"
      description='The "Track Your Connections in Real Time" showcase.'
      isLoading={analytics.isLoading}
      isSaving={analytics.isSaving}
      onSave={analytics.save}
      extra={
        <div className="flex items-center gap-2">
          <Label htmlFor="fa-active" className="text-sm font-normal text-muted-foreground">
            Show on site
          </Label>
          <Switch
            id="fa-active"
            checked={analytics.values.is_active ?? true}
            onCheckedChange={(v) => analytics.setField("is_active", v)}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Dashboard Image</Label>
        <ImageUploadField
          currentUrl={analytics.values.dashboard_image_url}
          disabled={!analytics.data}
          onUpload={async (file) => analytics.applyServerUpdate(await featuresAnalyticsApi.uploadImage(file))}
          onRemove={async () => analytics.applyServerUpdate(await featuresAnalyticsApi.removeImage())}
        />
        <p className="text-xs text-muted-foreground">
          Optional — shows the built-in dashboard mockup graphic when no image is uploaded.
        </p>
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fa-badge">Badge</Label>
        <Input id="fa-badge" value={analytics.values.badge ?? ""} onChange={(e) => analytics.setField("badge", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fa-heading">Heading</Label>
        <Input id="fa-heading" value={analytics.values.heading ?? ""} onChange={(e) => analytics.setField("heading", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fa-description">Description</Label>
        <Textarea
          id="fa-description"
          value={analytics.values.description ?? ""}
          onChange={(e) => analytics.setField("description", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fa-cta-text">Button Text</Label>
        <Input id="fa-cta-text" value={analytics.values.cta_text ?? ""} onChange={(e) => analytics.setField("cta_text", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fa-cta-url">Button URL</Label>
        <Input id="fa-cta-url" value={analytics.values.cta_url ?? ""} onChange={(e) => analytics.setField("cta_url", e.target.value)} />
      </div>
    </SingletonSectionCard>
  )
}

function ShowcaseSection() {
  const showcase = useSingletonSection<FeaturesShowcaseSection>({
    queryKey: ["content", "features", "showcase"],
    get: featuresShowcaseApi.get,
    update: featuresShowcaseApi.update,
    label: "Showcase Section",
  })

  return (
    <SingletonSectionCard
      title="Showcase Section"
      description="An optional product-showcase panel with two images. Off by default — turn it on once you've added content."
      isLoading={showcase.isLoading}
      isSaving={showcase.isSaving}
      onSave={showcase.save}
      extra={
        <div className="flex items-center gap-2">
          <Label htmlFor="fs-active" className="text-sm font-normal text-muted-foreground">
            Show on site
          </Label>
          <Switch
            id="fs-active"
            checked={showcase.values.is_active ?? false}
            onCheckedChange={(v) => showcase.setField("is_active", v)}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-1.5">
        <Label>Main Image</Label>
        <ImageUploadField
          currentUrl={showcase.values.main_image_url}
          disabled={!showcase.data}
          onUpload={async (file) => showcase.applyServerUpdate(await featuresShowcaseApi.uploadMainImage(file))}
          onRemove={async () => showcase.applyServerUpdate(await featuresShowcaseApi.removeMainImage())}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Card Image</Label>
        <ImageUploadField
          currentUrl={showcase.values.card_image_url}
          disabled={!showcase.data}
          onUpload={async (file) => showcase.applyServerUpdate(await featuresShowcaseApi.uploadCardImage(file))}
          onRemove={async () => showcase.applyServerUpdate(await featuresShowcaseApi.removeCardImage())}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fs-badge">Badge</Label>
        <Input id="fs-badge" value={showcase.values.badge ?? ""} onChange={(e) => showcase.setField("badge", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fs-heading">Heading</Label>
        <Input id="fs-heading" value={showcase.values.heading ?? ""} onChange={(e) => showcase.setField("heading", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fs-description">Description</Label>
        <Textarea
          id="fs-description"
          value={showcase.values.description ?? ""}
          onChange={(e) => showcase.setField("description", e.target.value)}
        />
      </div>
    </SingletonSectionCard>
  )
}

function CTASection() {
  const cta = useSingletonSection<FeaturesCTA>({
    queryKey: ["content", "features", "cta"],
    get: featuresCTAApi.get,
    update: featuresCTAApi.update,
    label: "CTA Section",
  })

  return (
    <SingletonSectionCard
      title="Closing CTA"
      description="The banner at the very bottom of the Features page."
      isLoading={cta.isLoading}
      isSaving={cta.isSaving}
      onSave={cta.save}
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Background Image (optional)</Label>
        <ImageUploadField
          currentUrl={cta.values.background_image_url}
          disabled={!cta.data}
          onUpload={async (file) => cta.applyServerUpdate(await featuresCTAApi.uploadImage(file))}
          onRemove={async () => cta.applyServerUpdate(await featuresCTAApi.removeImage())}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fcta-heading">Heading</Label>
        <Input id="fcta-heading" value={cta.values.heading ?? ""} onChange={(e) => cta.setField("heading", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="fcta-description">Description</Label>
        <Textarea id="fcta-description" value={cta.values.description ?? ""} onChange={(e) => cta.setField("description", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fcta-button-text">Button Text</Label>
        <Input id="fcta-button-text" value={cta.values.button_text ?? ""} onChange={(e) => cta.setField("button_text", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fcta-button-url">Button URL</Label>
        <Input id="fcta-button-url" value={cta.values.button_url ?? ""} onChange={(e) => cta.setField("button_url", e.target.value)} />
      </div>
    </SingletonSectionCard>
  )
}

export default function FeaturesTab() {
  return (
    <div className="flex flex-col gap-6">
      <HeroSection />
      <FeatureCardsSection />
      <AnalyticsSection />
      {/* Same live rows as Website Content → Statistics → "Features Page". */}
      <StatisticsForPage page="features" />
      <ShowcaseSection />
      <CTASection />
    </div>
  )
}
