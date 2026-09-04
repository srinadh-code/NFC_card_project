import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import {
  Nfc,
  ThumbsUp,
  Camera,
  AtSign,
  Briefcase,
  PlayCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

const QUICK_LINKS = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/features", label: "Features" },
  { to: "/shop", label: "Order Card" },
  { to: "/how-it-works", label: "How It Works" },
]

const SHOP_LINKS = [
  { to: "/shop", label: "Order Card" },
  { to: "/track-order", label: "Track Order" },
  { to: "/faq", label: "FAQs" },
  { to: "/contact", label: "Contact Us" },
]

const LEGAL_LINKS = [
  { to: "/terms", label: "Terms & Conditions" },
  { to: "/privacy-policy", label: "Privacy Policy" },
]

const SUPPORT_LINKS = [
  { to: "/contact", label: "Help Center" },
  { to: "/contact", label: "Contact Support" },
]

const SOCIALS = [
  { icon: ThumbsUp, label: "Facebook" },
  { icon: Camera, label: "Instagram" },
  { icon: AtSign, label: "Twitter" },
  { icon: Briefcase, label: "LinkedIn" },
  { icon: PlayCircle, label: "YouTube" },
]

export default function Footer() {
  const [email, setEmail] = useState("")

  function handleSubscribe(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      toast.error("Please enter a valid email address.")
      return
    }
    toast.success("Subscribed! Check your inbox for updates.")
    setEmail("")
  }

  return (
    <footer className="bg-[#0F172A]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6 lg:gap-6">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#4F46E5] via-[#7C3AED] to-[#EC4899] text-white">
                <Nfc className="size-4" />
              </span>
              <span className="text-base font-bold tracking-tight text-white">VR's NEXORA</span>
            </Link>
            <p className="mt-2.5 max-w-xs text-sm text-slate-400">
              Smart NFC digital business cards that help professionals share their contact
              details, social profiles, and portfolios with a single tap.
            </p>
            <div className="mt-3 flex items-center gap-1.5">
              {SOCIALS.map(({ icon: Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="flex size-8 items-center justify-center rounded-full border border-white/15 text-slate-400 transition-all duration-200 hover:border-[#EC4899]/50 hover:bg-white/10 hover:text-white hover:shadow-[0_0_16px_rgba(236,72,153,0.35)]"
                >
                  <Icon className="size-3.5" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white">Quick Links</h4>
            <ul className="mt-2.5 space-y-1.5">
              {QUICK_LINKS.map((l) => (
                <li key={l.label}>
                  <Link to={l.to} className="text-sm text-slate-400 transition-colors duration-200 hover:text-[#EC4899]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white">Shop</h4>
            <ul className="mt-2.5 space-y-1.5">
              {SHOP_LINKS.map((l) => (
                <li key={l.label}>
                  <Link to={l.to} className="text-sm text-slate-400 transition-colors duration-200 hover:text-[#EC4899]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white">Legal</h4>
            <ul className="mt-2.5 space-y-1.5">
              {LEGAL_LINKS.map((l) => (
                <li key={l.label}>
                  <Link to={l.to} className="text-sm text-slate-400 transition-colors duration-200 hover:text-[#EC4899]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <h4 className="mt-3.5 text-sm font-semibold text-white">Support</h4>
            <ul className="mt-2.5 space-y-1.5">
              {SUPPORT_LINKS.map((l, i) => (
                <li key={l.label + i}>
                  <Link to={l.to} className="text-sm text-slate-400 transition-colors duration-200 hover:text-[#EC4899]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <h4 className="text-sm font-semibold text-white">Newsletter</h4>
            <p className="mt-2.5 text-sm text-slate-400">
              Get product updates and offers in your inbox.
            </p>
            <form onSubmit={handleSubscribe} className="mt-2.5 flex flex-col gap-2">
              <Input
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-8 border-white/15 bg-white/5 text-sm text-white placeholder:text-slate-500 focus-visible:border-[#EC4899]/50 focus-visible:ring-[#EC4899]/30"
              />
              <Button
                type="submit"
                size="sm"
                className="w-full rounded-xl bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#EC4899] text-white shadow-[0_4px_14px_rgba(79,70,229,0.4)] transition-all duration-200 hover:shadow-[0_6px_20px_rgba(79,70,229,0.55)] hover:brightness-110"
              >
                Subscribe
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-3.5 sm:flex-row">
          <p className="text-xs text-slate-500">
            © 2026 VR's NEXORA. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            {["VISA", "Mastercard", "UPI"].map((p) => (
              <span
                key={p}
                className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-slate-400"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
