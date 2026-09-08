import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { IconPickerInput } from "@/components/admin/content/IconPickerInput"
import { ResourceListPage } from "@/components/admin/content/ResourceListPage"
import { featuresApi } from "@/lib/contentApi"
import type { Feature } from "@/types/content"

export default function FeaturesTab() {
  return (
    <ResourceListPage<Feature>
      api={featuresApi}
      queryKey={["content", "features"]}
      resourceLabel="Feature"
      getRowLabel={(item) => item.title}
      searchPredicate={(item, q) => item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)}
      createDefaults={(existing) => ({ icon: "Zap", title: "", description: "", display_order: existing.length, is_active: true })}
      columns={[
        { key: "icon", label: "Icon", render: (item) => item.icon },
        { key: "title", label: "Title", render: (item) => item.title },
        {
          key: "description",
          label: "Description",
          render: (item) => <span className="line-clamp-2 text-muted-foreground">{item.description}</span>,
        },
      ]}
      renderForm={({ values, setField }) => (
        <>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Icon</Label>
            <IconPickerInput value={values.icon ?? ""} onChange={(v) => setField("icon", v)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Title</Label>
            <Input value={values.title ?? ""} onChange={(e) => setField("title", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea value={values.description ?? ""} onChange={(e) => setField("description", e.target.value)} />
          </div>
        </>
      )}
    />
  )
}
