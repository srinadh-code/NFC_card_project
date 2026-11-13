import { useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ResourceListPage } from "@/components/admin/content/ResourceListPage"
import { trustedCompaniesAdminApi } from "@/lib/trusted-companies-admin"
import type { Company } from "@/types/content"

const QUERY_KEY = ["content", "companies"]

export default function CompaniesTab() {
  const queryClient = useQueryClient()
  const api = useMemo(() => trustedCompaniesAdminApi(queryClient), [queryClient])

  return (
    <ResourceListPage<Company>
      api={api}
      queryKey={QUERY_KEY}
      resourceLabel="Company"
      description="Trusted Companies — only enable names backed by verifiable business evidence. Drag rows or edit Display Order to arrange them."
      getRowLabel={(item) => item.name}
      searchPredicate={(item, q) => item.name.toLowerCase().includes(q)}
      createDefaults={(existing) => ({
        name: "",
        display_order: existing.length ? Math.min(2147483647, Math.max(...existing.map((item) => item.display_order)) + 1) : 0,
        is_active: false,
      })}
      columns={[
        { key: "name", label: "Company Name", render: (item) => item.name },
        { key: "display_order", label: "Display Order", render: (item) => item.display_order },
      ]}
      renderForm={({ values, setField }) => (
        <>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="trusted-company-name">Company Name</Label>
            <Input id="trusted-company-name" maxLength={150} required value={values.name ?? ""} onChange={(e) => setField("name", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trusted-company-order">Display Order</Label>
            <Input id="trusted-company-order" type="number" min={0} max={2147483647} step={1} value={values.display_order ?? 0} onChange={(e) => setField("display_order", Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-3 self-end pb-2">
            <Switch id="trusted-company-active" checked={values.is_active ?? false} onCheckedChange={(checked) => setField("is_active", checked)} />
            <Label htmlFor="trusted-company-active">Is Active</Label>
          </div>
        </>
      )}
    />
  )
}
