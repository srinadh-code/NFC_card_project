const SECTIONS = [
  {
    title: "Introduction",
    body: "TapLink Technologies Pvt. Ltd. (\"TapLink\", \"we\", \"us\") provides NFC-enabled digital business cards and profile hosting services. This Privacy Policy explains how we collect, use, and protect your information when you purchase a card, create a profile, or otherwise use our website and services.",
  },
  {
    title: "Information We Collect",
    body: "We collect information you provide directly, such as your name, email, phone number, company, designation, shipping address, and profile content (photo, bio, social links). We also collect usage data such as card taps, QR scans, and profile views to power your analytics dashboard.",
  },
  {
    title: "How We Use Information",
    body: "We use your information to process orders, activate and manage your NFC card, host and display your public profile, provide analytics on profile engagement, send order and account updates, and improve our products and support.",
  },
  {
    title: "Data Security",
    body: "We apply industry-standard technical and organizational measures, including encryption in transit and at rest, to protect your personal data from unauthorized access, alteration, or disclosure. Access to customer data is restricted to authorized personnel only.",
  },
  {
    title: "Cookies",
    body: "Our website uses cookies and similar technologies to remember your preferences, keep you signed in, and understand how visitors use our site. You can control cookies through your browser settings; disabling them may affect certain features.",
  },
  {
    title: "Your Rights",
    body: "You may access, update, or delete your profile information at any time from your customer dashboard. You can also request a copy of your data or ask us to delete your account by contacting our support team.",
  },
  {
    title: "Contact for Privacy",
    body: "If you have questions about this Privacy Policy or how your data is handled, please reach out to us at support@taplink.com or write to TapLink Technologies Pvt. Ltd., Hyderabad, Telangana, India.",
  },
]

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: January 15, 2026</p>

      <div className="mt-10 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-lg font-semibold text-foreground">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
