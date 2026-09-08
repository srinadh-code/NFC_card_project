import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SingletonSectionCard } from "@/components/admin/content/SingletonSectionCard"
import { ImageUploadField } from "@/components/admin/content/ImageUploadField"
import { IconPickerInput } from "@/components/admin/content/IconPickerInput"
import { ResourceListPage } from "@/components/admin/content/ResourceListPage"
import { useSingletonSection } from "@/components/admin/content/useSingletonSection"
import {
  aboutFeaturesApi,
  aboutPageApi,
  builtFromExperienceApi,
  missionApi,
  whyChooseApi,
} from "@/lib/contentApi"
import type { AboutFeature, AboutPage, BuiltFromExperience, Mission, WhyChoose } from "@/types/content"

function AboutPageSection() {
  const page = useSingletonSection<AboutPage>({
    queryKey: ["content", "about", "page"],
    get: aboutPageApi.get,
    update: aboutPageApi.update,
    label: "About Page",
  })

  return (
    <SingletonSectionCard title="Page Header & Story" description="The top of the About page and the story section." isLoading={page.isLoading} isSaving={page.isSaving} onSave={page.save}>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="ap-title">Page Title</Label>
        <Input id="ap-title" value={page.values.page_title ?? ""} onChange={(e) => page.setField("page_title", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="ap-subtitle">Page Subtitle</Label>
        <Textarea id="ap-subtitle" value={page.values.page_subtitle ?? ""} onChange={(e) => page.setField("page_subtitle", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="ap-story-badge">Story Badge</Label>
        <Input id="ap-story-badge" value={page.values.story_badge ?? ""} onChange={(e) => page.setField("story_badge", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="ap-story-title">Story Title</Label>
        <Input id="ap-story-title" value={page.values.story_title ?? ""} onChange={(e) => page.setField("story_title", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="ap-story-p1">Story Paragraph 1</Label>
        <Textarea id="ap-story-p1" value={page.values.story_paragraph_1 ?? ""} onChange={(e) => page.setField("story_paragraph_1", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="ap-story-p2">Story Paragraph 2</Label>
        <Textarea id="ap-story-p2" value={page.values.story_paragraph_2 ?? ""} onChange={(e) => page.setField("story_paragraph_2", e.target.value)} />
      </div>
    </SingletonSectionCard>
  )
}

function AboutFeaturesSection() {
  return (
    <ResourceListPage<AboutFeature>
      api={aboutFeaturesApi}
      queryKey={["content", "about", "features"]}
      resourceLabel="Story Highlight"
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

function MissionSection() {
  const mission = useSingletonSection<Mission>({
    queryKey: ["content", "about", "mission"],
    get: missionApi.get,
    update: missionApi.update,
    label: "Mission",
  })

  return (
    <SingletonSectionCard title="Mission" isLoading={mission.isLoading} isSaving={mission.isSaving} onSave={mission.save}>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="mission-badge">Badge</Label>
        <Input id="mission-badge" value={mission.values.badge ?? ""} onChange={(e) => mission.setField("badge", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="mission-heading">Heading</Label>
        <Input id="mission-heading" value={mission.values.heading ?? ""} onChange={(e) => mission.setField("heading", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="mission-description">Description</Label>
        <Textarea id="mission-description" value={mission.values.description ?? ""} onChange={(e) => mission.setField("description", e.target.value)} />
      </div>
    </SingletonSectionCard>
  )
}

function WhyChooseSection() {
  return (
    <ResourceListPage<WhyChoose>
      api={whyChooseApi}
      queryKey={["content", "about", "why-choose"]}
      resourceLabel="Why Choose Item"
      getRowLabel={(item) => item.title}
      createDefaults={(existing) => ({
        icon: "Zap",
        title: "",
        description: "",
        gradient: "",
        display_order: existing.length,
        is_active: true,
      })}
      columns={[
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
            <Label>Gradient (optional CSS gradient)</Label>
            <Input
              placeholder="linear-gradient(135deg,#4F46E5,#7C3AED)"
              value={values.gradient ?? ""}
              onChange={(e) => setField("gradient", e.target.value)}
            />
          </div>
        </>
      )}
    />
  )
}

function BuiltFromExperienceSection() {
  const experience = useSingletonSection<BuiltFromExperience>({
    queryKey: ["content", "about", "built-from-experience"],
    get: builtFromExperienceApi.get,
    update: builtFromExperienceApi.update,
    label: "Built From Experience",
  })

  return (
    <SingletonSectionCard title="Built From Experience" isLoading={experience.isLoading} isSaving={experience.isSaving} onSave={experience.save}>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Image</Label>
        <ImageUploadField
          currentUrl={experience.values.image_url}
          disabled={!experience.data}
          onUpload={async (file) => experience.applyServerUpdate(await builtFromExperienceApi.uploadImage(file))}
          onRemove={async () => experience.applyServerUpdate(await builtFromExperienceApi.removeImage())}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="bfe-heading">Heading</Label>
        <Input id="bfe-heading" value={experience.values.heading ?? ""} onChange={(e) => experience.setField("heading", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="bfe-subtitle">Subtitle</Label>
        <Textarea id="bfe-subtitle" value={experience.values.subtitle ?? ""} onChange={(e) => experience.setField("subtitle", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="bfe-p1">Paragraph 1</Label>
        <Textarea id="bfe-p1" value={experience.values.paragraph_1 ?? ""} onChange={(e) => experience.setField("paragraph_1", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="bfe-p2">Paragraph 2</Label>
        <Textarea id="bfe-p2" value={experience.values.paragraph_2 ?? ""} onChange={(e) => experience.setField("paragraph_2", e.target.value)} />
      </div>
    </SingletonSectionCard>
  )
}

export default function AboutTab() {
  return (
    <div className="flex flex-col gap-6">
      <AboutPageSection />
      <AboutFeaturesSection />
      <MissionSection />
      <WhyChooseSection />
      <BuiltFromExperienceSection />
    </div>
  )
}
