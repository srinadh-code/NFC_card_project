import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { IconPickerInput } from "@/components/admin/content/IconPickerInput"
import { ResourceListPage } from "@/components/admin/content/ResourceListPage"
import { statisticsApi } from "@/lib/contentApi"
import type { Statistic, StatisticPage } from "@/types/content"

function StatisticsForPage({ page }: { page: StatisticPage }) {
  return (
    <ResourceListPage<Statistic>
      api={statisticsApi}
      queryKey={["content", "statistics", page]}
      listParams={{ page }}
      resourceLabel="Statistic"
      getRowLabel={(item) => item.label}
      createDefaults={(existing) => ({ page, value: "", label: "", icon: "TrendingUp", display_order: existing.length, is_active: true })}
      columns={[
        { key: "value", label: "Value", render: (item) => item.value },
        { key: "label", label: "Label", render: (item) => item.label },
        { key: "icon", label: "Icon", render: (item) => item.icon },
      ]}
      renderForm={({ values, setField }) => (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Value</Label>
            <Input placeholder="10K+" value={values.value ?? ""} onChange={(e) => setField("value", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Label</Label>
            <Input placeholder="Cards Activated" value={values.label ?? ""} onChange={(e) => setField("label", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Icon</Label>
            <IconPickerInput value={values.icon ?? ""} onChange={(v) => setField("icon", v)} />
          </div>
        </>
      )}
    />
  )
}

export default function StatisticsTab() {
  return (
    <Tabs defaultValue="home">
      <TabsList>
        <TabsTrigger value="home">Home Page</TabsTrigger>
        <TabsTrigger value="about">About Page</TabsTrigger>
      </TabsList>
      <TabsContent value="home" className="mt-4">
        <StatisticsForPage page="home" />
      </TabsContent>
      <TabsContent value="about" className="mt-4">
        <StatisticsForPage page="about" />
      </TabsContent>
    </Tabs>
  )
}
