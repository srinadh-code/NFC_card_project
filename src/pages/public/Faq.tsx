import { useQuery } from "@tanstack/react-query"
import PageHeader from "@/components/marketing/PageHeader"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Skeleton } from "@/components/ui/skeleton"
import { cardClass } from "@/components/marketing/PremiumCard"
import { cn } from "@/lib/utils"
import { publicWebsiteApi } from "@/lib/contentApi"

export default function Faq() {
  const { data: faqs, isLoading, isError } = useQuery({
    queryKey: ["content", "public-faqs"],
    queryFn: publicWebsiteApi.getFaqs,
  })

  return (
    <div>
      <PageHeader
        title="Frequently Asked Questions"
        subtitle="Everything you need to know about VR's NEXORA cards and profiles."
      />

      <section className="bg-background px-4 py-16">
        <div className="mx-auto max-w-3xl">
          {isError ? (
            <p className="py-16 text-center text-muted-foreground">
              Couldn&apos;t load this page&apos;s content. Please try again shortly.
            </p>
          ) : isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            faqs &&
            faqs.length > 0 && (
              <Accordion
                type="single"
                collapsible
                className={cn(
                  cardClass,
                  "px-6 hover:translate-y-0 hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                )}
              >
                {faqs.map((faq) => (
                  <AccordionItem key={faq.id} value={`item-${faq.id}`} className="border-border">
                    <AccordionTrigger className="text-base hover:no-underline">{faq.question}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )
          )}
        </div>
      </section>
    </div>
  )
}
