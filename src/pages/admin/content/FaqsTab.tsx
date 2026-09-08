import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ResourceListPage } from "@/components/admin/content/ResourceListPage"
import { faqsApi } from "@/lib/contentApi"
import type { Faq } from "@/types/content"

export default function FaqsTab() {
  return (
    <ResourceListPage<Faq>
      api={faqsApi}
      queryKey={["content", "faqs"]}
      resourceLabel="FAQ"
      getRowLabel={(item) => item.question}
      searchPredicate={(item, q) => item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)}
      createDefaults={(existing) => ({ question: "", answer: "", display_order: existing.length, is_active: true })}
      columns={[
        { key: "question", label: "Question", render: (item) => item.question },
        {
          key: "answer",
          label: "Answer",
          render: (item) => <span className="line-clamp-2 text-muted-foreground">{item.answer}</span>,
        },
      ]}
      renderForm={({ values, setField }) => (
        <>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Question</Label>
            <Input value={values.question ?? ""} onChange={(e) => setField("question", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Answer</Label>
            <Textarea rows={5} value={values.answer ?? ""} onChange={(e) => setField("answer", e.target.value)} />
          </div>
        </>
      )}
    />
  )
}
