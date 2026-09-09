import { useState, type FormEvent } from "react"
import { Mail, Phone, MapPin, Clock } from "lucide-react"
import { toast } from "sonner"
import PageHeader from "@/components/marketing/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cardClass } from "@/components/marketing/PremiumCard"
import { cn } from "@/lib/utils"

const INFO = [
  { icon: Mail, label: "Email", value: "support@vrsnexora.com" },
  { icon: Phone, label: "Phone", value: "+91 98765 43210" },
  { icon: MapPin, label: "Address", value: "VR's NEXORA Technologies Pvt. Ltd., Hyderabad, Telangana, India" },
  { icon: Clock, label: "Business Hours", value: "Mon – Sat, 9:00 AM – 6:00 PM" },
]

const INITIAL_FORM = { fullName: "", email: "", subject: "", message: "" }

export default function Contact() {
  const [form, setForm] = useState(INITIAL_FORM)

  function update<K extends keyof typeof INITIAL_FORM>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.fullName.trim() || !form.email.trim() || !form.subject.trim() || !form.message.trim()) {
      toast.error("Please fill in all fields.")
      return
    }
    toast.success("Message sent! We'll get back to you within 24 hours.")
    setForm(INITIAL_FORM)
  }

  return (
    <div>
      <PageHeader title="Get in Touch" subtitle="Have a question or need help? We'd love to hear from you." />

      <section className="bg-background px-4 py-16">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            {INFO.map((item) => (
              <div
                key={item.label}
                className={cn(cardClass, "flex items-start gap-4 p-5 bg-card border-border dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]")}
              >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-brand-br text-white shadow-md">
                  <item.icon className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.value}</p>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleSubmit}
            className={cn(
              cardClass,
              "space-y-4 bg-secondary border-border p-6 hover:translate-y-0 hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
            )}
          >
            <div className="space-y-1.5">
              <Label htmlFor="contact-name">Full Name</Label>
              <Input id="contact-name" value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-subject">Subject</Label>
              <Input id="contact-subject" value={form.subject} onChange={(e) => update("subject", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-message">Message</Label>
              <Textarea
                id="contact-message"
                rows={5}
                value={form.message}
                onChange={(e) => update("message", e.target.value)}
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full rounded-xl bg-gradient-brand text-white shadow-[0_4px_14px_rgba(139,92,246,0.4)] transition-all duration-200 hover:shadow-[0_6px_20px_rgba(139,92,246,0.55)] hover:brightness-110"
            >
              Send Message
            </Button>
          </form>
        </div>
      </section>
    </div>
  )
}
