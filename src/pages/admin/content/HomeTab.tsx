import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SingletonSectionCard } from "@/components/admin/content/SingletonSectionCard"
import { ImageUploadField } from "@/components/admin/content/ImageUploadField"
import { IconPickerInput } from "@/components/admin/content/IconPickerInput"
import { ResourceListPage } from "@/components/admin/content/ResourceListPage"
import { useSingletonSection } from "@/components/admin/content/useSingletonSection"
import { ctaApi, heroApi, heroFeaturesApi, howItFeelsApi, howItFeelsPointsApi } from "@/lib/contentApi"
import type { Cta, Hero, HeroFeature, HowItFeels, HowItFeelsPoint } from "@/types/content"

function HeroSection() {
  const hero = useSingletonSection<Hero>({
    queryKey: ["content", "home", "hero"],
    get: heroApi.get,
    update: heroApi.update,
    label: "Hero",
  })

  return (
    <SingletonSectionCard title="Hero" description="The top banner shown at the very top of the home page." isLoading={hero.isLoading} isSaving={hero.isSaving} onSave={hero.save}>
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hero-primary-text">Primary CTA Text</Label>
        <Input id="hero-primary-text" value={hero.values.primary_cta_text ?? ""} onChange={(e) => hero.setField("primary_cta_text", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hero-primary-link">Primary CTA Link</Label>
        <Input id="hero-primary-link" placeholder="/shop" value={hero.values.primary_cta_link ?? ""} onChange={(e) => hero.setField("primary_cta_link", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hero-secondary-text">Secondary CTA Text</Label>
        <Input id="hero-secondary-text" value={hero.values.secondary_cta_text ?? ""} onChange={(e) => hero.setField("secondary_cta_text", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hero-secondary-link">Secondary CTA Link</Label>
        <Input id="hero-secondary-link" value={hero.values.secondary_cta_link ?? ""} onChange={(e) => hero.setField("secondary_cta_link", e.target.value)} />
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
    <SingletonSectionCard title="How It Feels" description="The 'just tap, that's it' section." isLoading={howItFeels.isLoading} isSaving={howItFeels.isSaving} onSave={howItFeels.save}>
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
    <SingletonSectionCard title="Bottom CTA" description="The closing call-to-action banner." isLoading={cta.isLoading} isSaving={cta.isSaving} onSave={cta.save}>
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

export default function HomeTab() {
  return (
    <div className="flex flex-col gap-6">
      <HeroSection />
      <HeroFeaturesSection />
      <HowItFeelsSection />
      <HowItFeelsPointsSection />
      <CtaSection />
    </div>
  )
}
