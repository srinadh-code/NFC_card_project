import { useQueryClient } from "@tanstack/react-query"
import { Star } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ImageUploadField } from "@/components/admin/content/ImageUploadField"
import { ResourceListPage } from "@/components/admin/content/ResourceListPage"
import { testimonialsApi } from "@/lib/contentApi"
import type { Testimonial } from "@/types/content"

const QUERY_KEY = ["content", "testimonials"]

export default function TestimonialsTab() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  return (
    <ResourceListPage<Testimonial>
      api={testimonialsApi}
      queryKey={QUERY_KEY}
      resourceLabel="Testimonial"
      getRowLabel={(item) => item.name}
      searchPredicate={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.company.toLowerCase().includes(q) ||
        item.review.toLowerCase().includes(q)
      }
      createDefaults={(existing) => ({
        name: "",
        designation: "",
        company: "",
        review: "",
        rating: 5,
        display_order: existing.length,
        is_active: true,
      })}
      columns={[
        {
          key: "photo",
          label: "Photo",
          render: (item) => (
            <ImageUploadField
              currentUrl={item.image_url}
              onUpload={async (file) => {
                await testimonialsApi.uploadImage(item.id, file)
                invalidate()
              }}
              onRemove={async () => {
                await testimonialsApi.removeImage(item.id)
                invalidate()
              }}
            />
          ),
        },
        { key: "name", label: "Name", render: (item) => item.name },
        {
          key: "designation",
          label: "Designation / Company",
          render: (item) => (
            <span className="text-muted-foreground">
              {item.designation}
              {item.company ? ` · ${item.company}` : ""}
            </span>
          ),
        },
        {
          key: "rating",
          label: "Rating",
          render: (item) => (
            <span className="inline-flex items-center gap-1">
              {item.rating} <Star className="size-3.5 fill-current text-warning" />
            </span>
          ),
        },
      ]}
      renderForm={({ values, setField }) => (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={values.name ?? ""} onChange={(e) => setField("name", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Designation</Label>
            <Input value={values.designation ?? ""} onChange={(e) => setField("designation", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Company</Label>
            <Input value={values.company ?? ""} onChange={(e) => setField("company", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Rating (1-5)</Label>
            <Input
              type="number"
              min={1}
              max={5}
              value={values.rating ?? 5}
              onChange={(e) => setField("rating", Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Review</Label>
            <Textarea rows={4} value={values.review ?? ""} onChange={(e) => setField("review", e.target.value)} />
          </div>
        </>
      )}
    />
  )
}
