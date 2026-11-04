import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SingletonSectionCard } from "@/components/admin/content/SingletonSectionCard"
import { ImageUploadField } from "@/components/admin/content/ImageUploadField"
import { DEFAULT_TIMELINE, ORDER_CARD_PRODUCTS_KEY, OrderCardProductEditor } from "@/components/admin/content/OrderCardProductEditor"
import { cloudinaryUrl } from "@/lib/order-card-pricing"
import { IconPickerInput } from "@/components/admin/content/IconPickerInput"
import { ResourceListPage } from "@/components/admin/content/ResourceListPage"
import { useSingletonSection } from "@/components/admin/content/useSingletonSection"
import { orderCardPageApi, orderCardProductsApi, orderCardTrustBadgesApi, profileTemplatePreviewsApi } from "@/lib/contentApi"
import { CARD_THEME_IDS, PROFILE_THEMES } from "@/data/constants"
import type { OrderCardPageSettings, OrderCardProduct, OrderCardTrustBadge, ProfileTemplatePreview } from "@/types/content"

const PROFILE_TEMPLATE_ID_OPTIONS = CARD_THEME_IDS.custom.map((id) => ({
  value: id,
  label: PROFILE_THEMES.find((t) => t.id === id)?.name.replace(/^(NEXORA|GATEWAY) /, "") ?? id,
}))

function templateLabel(templateId: string): string {
  return PROFILE_TEMPLATE_ID_OPTIONS.find((o) => o.value === templateId)?.label ?? templateId
}

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
      queryKey={ORDER_CARD_PRODUCTS_KEY}
      resourceLabel="Product"
      description="The cards customers can buy on the Order Card page. Only active, published products are shown; drag rows to change their order."
      getRowLabel={(item) => item.name}
      searchPredicate={(item, q) => item.name.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q)}
      dialogClassName="sm:max-w-4xl"
      createDefaults={(existing) => ({
        slug: "",
        name: "",
        short_description: "",
        full_description: "",
        price: "",
        design: "",
        best_for: "",
        card_type: "CUSTOM",
        card_tone: "custom",
        image_caption: "",
        color_name: "",
        color_hex: "",
        theme_plan_copy: "",
        feature_items: [],
        offers: [{ label: "Buy 1", min_quantity: 1, unit_price: "", savings_text: "", is_active: true }],
        timeline_stages: DEFAULT_TIMELINE,
        images: [],
        customisation_heading: "",
        customisation_description: "",
        customisation_instructions: "",
        customisation_notes: "",
        popular: false,
        display_order: existing.length,
        is_active: true,
        is_published: false,
      })}
      columns={[
        {
          key: "image",
          label: "Image",
          render: (item) =>
            item.image_url ? (
              <img src={cloudinaryUrl(item.image_url, 160)} alt="" className="h-12 w-16 rounded-md object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">No image</span>
            ),
        },
        { key: "name", label: "Name", render: (item) => item.name },
        { key: "price", label: "From", render: (item) => `₹${Number(item.price).toLocaleString("en-IN")}` },
        {
          key: "offers",
          label: "Offers",
          render: (item) => item.offers.filter((o) => o.is_active).map((o) => o.label).join(", ") || "—",
        },
        { key: "card_type", label: "Type", render: (item) => item.card_type },
        {
          key: "status",
          label: "Status",
          render: (item) => (
            <div className="flex flex-wrap gap-1">
              <span
                className={
                  item.is_published
                    ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                    : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                }
              >
                {item.is_published ? "Published" : "Unpublished"}
              </span>
              {item.popular && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Most Popular</span>
              )}
            </div>
          ),
        },
      ]}
      renderForm={({ values, setField }) => <OrderCardProductEditor values={values} setField={setField} />}
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
