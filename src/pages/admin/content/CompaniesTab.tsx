import { useQueryClient } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ImageUploadField } from "@/components/admin/content/ImageUploadField"
import { ResourceListPage } from "@/components/admin/content/ResourceListPage"
import { companiesApi } from "@/lib/contentApi"
import type { Company } from "@/types/content"

const QUERY_KEY = ["content", "companies"]

export default function CompaniesTab() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  return (
    <ResourceListPage<Company>
      api={companiesApi}
      queryKey={QUERY_KEY}
      resourceLabel="Company"
      getRowLabel={(item) => item.name}
      searchPredicate={(item, q) => item.name.toLowerCase().includes(q)}
      createDefaults={(existing) => ({ name: "", display_order: existing.length, is_active: true })}
      columns={[
        {
          key: "logo",
          label: "Logo",
          render: (item) => (
            <ImageUploadField
              currentUrl={item.logo_url}
              onUpload={async (file) => {
                await companiesApi.uploadImage(item.id, file)
                invalidate()
              }}
              onRemove={async () => {
                await companiesApi.removeImage(item.id)
                invalidate()
              }}
            />
          ),
        },
        { key: "name", label: "Name", render: (item) => item.name },
      ]}
      renderForm={({ values, setField }) => (
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Name</Label>
          <Input value={values.name ?? ""} onChange={(e) => setField("name", e.target.value)} />
        </div>
      )}
    />
  )
}
