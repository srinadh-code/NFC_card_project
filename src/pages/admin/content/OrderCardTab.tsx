import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SingletonSectionCard } from "@/components/admin/content/SingletonSectionCard"
import { ImageUploadField } from "@/components/admin/content/ImageUploadField"
import { IconPickerInput } from "@/components/admin/content/IconPickerInput"
import { ResourceListPage } from "@/components/admin/content/ResourceListPage"
import { useSingletonSection } from "@/components/admin/content/useSingletonSection"
import { orderCardPageApi, orderCardProductsApi, orderCardTrustBadgesApi, profileTemplatePreviewsApi } from "@/lib/contentApi"
import { CARD_THEME_IDS, PROFILE_THEMES } from "@/data/constants"
import type { OrderCardPageSettings, OrderCardProduct, OrderCardTone, OrderCardTrustBadge, ProfileTemplatePreview } from "@/types/content"

const PROFILE_TEMPLATE_ID_OPTIONS = CARD_THEME_IDS.custom.map((id) => ({
  value: id,
  label: PROFILE_THEMES.find((t) => t.id === id)?.name.replace("NEXORA ", "") ?? id,
}))

function templateLabel(templateId: string): string {
  return PROFILE_TEMPLATE_ID_OPTIONS.find((o) => o.value === templateId)?.label ?? templateId
}

const CARD_TYPE_OPTIONS: { value: OrderCardProduct["card_type"]; label: string }[] = [
  { value: "CUSTOM", label: "Custom" },
  { value: "WOODEN", label: "Wooden" },
  { value: "REVIEW", label: "Google Review Card" },
]

const CARD_TONE_OPTIONS: { value: string; label: string }[] = [
  { value: "custom", label: "Custom (multi-hue)" },
  { value: "front", label: "Front (brand gradient)" },
  { value: "back", label: "Back" },
  { value: "gold", label: "Gold" },
]

function PageSettingsSection() {
  const page = useSingletonSection<OrderCardPageSettings>({
    queryKey: ["content", "order-card", "page"],
    get: orderCardPageApi.get,
    update: orderCardPageApi.update,
    label: "Order Card Page",
  })

  return (
    <SingletonSectionCard
      title="Page Header & Theme Section"
      description={`The top of the /shop page, and the "Choose Your Profile Theme" section's own heading (the theme mockups themselves are not editable here).`}
      isLoading={page.isLoading}
      isSaving={page.isSaving}
      onSave={page.save}
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="oc-title">Page Title</Label>
        <Input id="oc-title" value={page.values.page_title ?? ""} onChange={(e) => page.setField("page_title", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="oc-subtitle">Page Subtitle</Label>
        <Textarea id="oc-subtitle" value={page.values.page_subtitle ?? ""} onChange={(e) => page.setField("page_subtitle", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="oc-theme-heading">Theme Section Heading</Label>
        <Input
          id="oc-theme-heading"
          value={page.values.theme_section_heading ?? ""}
          onChange={(e) => page.setField("theme_section_heading", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="oc-theme-subtitle">Theme Section Subtitle</Label>
        <Textarea
          id="oc-theme-subtitle"
          value={page.values.theme_section_subtitle ?? ""}
          onChange={(e) => page.setField("theme_section_subtitle", e.target.value)}
        />
      </div>
    </SingletonSectionCard>
  )
}

function ProductsSection() {
  return (
    <ResourceListPage<OrderCardProduct>
      api={orderCardProductsApi}
      queryKey={["content", "order-card", "products"]}
      resourceLabel="Product"
      description='The purchasable cards shown on /shop (e.g. "NEXORA Custom", "Google Review Card").'
      getRowLabel={(item) => item.name}
      searchPredicate={(item, q) => item.name.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q)}
      createDefaults={(existing) => ({
        slug: "",
        name: "",
        price: "0.00",
        design: "",
        best_for: "",
        features: "",
        card_type: "CUSTOM",
        card_tone: "custom",
        image_caption: "",
        color_name: "",
        color_hex: "",
        theme_plan_copy: "",
        popular: false,
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
                await orderCardProductsApi.uploadImage(item.id, file)
              }}
              onRemove={async () => {
                await orderCardProductsApi.removeImage(item.id)
              }}
            />
          ),
        },
        { key: "name", label: "Name", render: (item) => item.name },
        { key: "slug", label: "Slug", render: (item) => item.slug },
        { key: "price", label: "Price", render: (item) => item.price },
        { key: "card_type", label: "Type", render: (item) => item.card_type },
      ]}
      renderForm={({ values, setField }) => (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={values.name ?? ""} onChange={(e) => setField("name", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Slug</Label>
            <Input
              placeholder="custom"
              value={values.slug ?? ""}
              onChange={(e) => setField("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            />
            <p className="text-xs text-muted-foreground">
              Stable identifier — also used to match this product's profile-theme entitlement.
              Changing it after launch can break that link.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Price</Label>
            <Input type="number" step="0.01" value={values.price ?? ""} onChange={(e) => setField("price", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Best For</Label>
            <Input value={values.best_for ?? ""} onChange={(e) => setField("best_for", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Design / Short Description</Label>
            <Input value={values.design ?? ""} onChange={(e) => setField("design", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Features (one per line)</Label>
            <Textarea
              rows={6}
              value={values.features ?? ""}
              onChange={(e) => setField("features", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Order Card Type</Label>
            <Select value={values.card_type ?? "CUSTOM"} onValueChange={(v) => setField("card_type", v as OrderCardProduct["card_type"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARD_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">What gets sent as the order line's card type at checkout.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Mockup Tone (used only when no image is uploaded)</Label>
            <Select value={values.card_tone || "custom"} onValueChange={(v) => setField("card_tone", v as OrderCardTone)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARD_TONE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Template Count (optional — leave blank for no theme entitlement)</Label>
            <Input
              type="number"
              min={0}
              value={values.template_count ?? ""}
              onChange={(e) => setField("template_count", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Image Caption (optional)</Label>
            <Input value={values.image_caption ?? ""} onChange={(e) => setField("image_caption", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Color Name</Label>
            <Input value={values.color_name ?? ""} onChange={(e) => setField("color_name", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Color (hex)</Label>
            <Input placeholder="#7C3AED" value={values.color_hex ?? ""} onChange={(e) => setField("color_hex", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Theme Plan Copy (only shown when Template Count is set)</Label>
            <Textarea
              value={values.theme_plan_copy ?? ""}
              onChange={(e) => setField("theme_plan_copy", e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">"Most Popular" badge</p>
              <p className="text-xs text-muted-foreground">Shown next to the product name on the configurator.</p>
            </div>
            <Switch checked={values.popular ?? false} onCheckedChange={(v) => setField("popular", v)} />
          </div>
        </>
      )}
    />
  )
}

function TrustBadgesSection() {
  return (
    <ResourceListPage<OrderCardTrustBadge>
      api={orderCardTrustBadgesApi}
      queryKey={["content", "order-card", "trust-badges"]}
      resourceLabel="Trust Badge"
      description='The "Free Shipping / 7 Days Return / ..." strip under the configurator.'
      getRowLabel={(item) => item.label}
      createDefaults={(existing) => ({ icon: "Truck", label: "", display_order: existing.length, is_active: true })}
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

function ProfileTemplatesSection() {
  return (
    <ResourceListPage<ProfileTemplatePreview>
      api={profileTemplatePreviewsApi}
      queryKey={["content", "order-card", "profile-templates"]}
      resourceLabel="Profile Template"
      description={`Admin-uploaded image for each of the 5 profile templates shown in the "Choose Your Profile Theme" section. A template with no active image here keeps showing its built-in mockup design.`}
      getRowLabel={(item) => templateLabel(item.template_id)}
      createDefaults={(existing) => {
        const usedIds = new Set(existing.map((item) => item.template_id))
        const nextId = PROFILE_TEMPLATE_ID_OPTIONS.find((o) => !usedIds.has(o.value))?.value ?? ""
        return { template_id: nextId, display_order: existing.length, is_active: true }
      }}
      columns={[
        {
          key: "image",
          label: "Image",
          render: (item) => (
            <ImageUploadField
              currentUrl={item.image_url}
              onUpload={async (file) => {
                await profileTemplatePreviewsApi.uploadImage(item.id, file)
              }}
              onRemove={async () => {
                await profileTemplatePreviewsApi.removeImage(item.id)
              }}
            />
          ),
        },
        { key: "template", label: "Template", render: (item) => templateLabel(item.template_id) },
        { key: "active", label: "Active", render: (item) => (item.is_active ? "Yes" : "No") },
      ]}
      renderForm={({ values, setField }) => (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Template</Label>
            <Select
              value={values.template_id ?? ""}
              onValueChange={(v) => setField("template_id", v)}
              disabled={Boolean(values.id)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROFILE_TEMPLATE_ID_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Which of the 5 profile templates this image applies to. Set once — upload/replace the image afterward
              from the list.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Show this image on /shop</p>
              <p className="text-xs text-muted-foreground">Turn off to revert this template to its built-in mockup design.</p>
            </div>
            <Switch checked={values.is_active ?? true} onCheckedChange={(v) => setField("is_active", v)} />
          </div>
        </>
      )}
    />
  )
}

export default function OrderCardTab() {
  return (
    <div className="flex flex-col gap-6">
      <PageSettingsSection />
      <ProductsSection />
      <TrustBadgesSection />
      <ProfileTemplatesSection />
    </div>
  )
}
