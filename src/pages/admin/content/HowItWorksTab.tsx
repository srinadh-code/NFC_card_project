import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { IconPickerInput } from "@/components/admin/content/IconPickerInput"
import { ResourceListPage } from "@/components/admin/content/ResourceListPage"
import { howItWorksApi } from "@/lib/contentApi"
import type { HowItWorksStep } from "@/types/content"

export default function HowItWorksTab() {
  return (
    <ResourceListPage<HowItWorksStep>
      api={howItWorksApi}
      queryKey={["content", "how-it-works"]}
      resourceLabel="Step"
      getRowLabel={(item) => item.title}
      createDefaults={(existing) => ({
        step_number: existing.length + 1,
        icon: "Zap",
        title: "",
        description: "",
        display_order: existing.length,
        is_active: true,
      })}
      columns={[
        { key: "step_number", label: "#", className: "w-10", render: (item) => item.step_number },
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
          <div className="flex flex-col gap-1.5">
            <Label>Step Number</Label>
            <Input
              type="number"
              min={1}
              value={values.step_number ?? 1}
              onChange={(e) => setField("step_number", Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
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
