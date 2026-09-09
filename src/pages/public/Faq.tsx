import { FAQS } from "@/data/constants"
import PageHeader from "@/components/marketing/PageHeader"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { cardClass } from "@/components/marketing/PremiumCard"
import { cn } from "@/lib/utils"

export default function Faq() {
  return (
    <div>
      <PageHeader
        title="Frequently Asked Questions"
        subtitle="Everything you need to know about VR's NEXORA cards and profiles."
      />

      <section className="bg-background px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <Accordion
            type="single"
            collapsible
            className={cn(
              cardClass,
              "bg-card border-border px-6 hover:translate-y-0 hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
            )}
          >
            {FAQS.map((faq, i) => (
              <AccordionItem key={faq.q} value={`item-${i}`} className="border-border">
                <AccordionTrigger className="text-base hover:no-underline">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </div>
  )
}
