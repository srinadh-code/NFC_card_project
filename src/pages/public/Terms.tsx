const SECTIONS = [
  {
    title: "Acceptance of Terms",
    body: "By accessing the VR's NEXORA website, purchasing a VR's NEXORA NFC card, or using our profile hosting services, you agree to be bound by these Terms & Conditions. If you do not agree, please do not use our services.",
  },
  {
    title: "Use of Service",
    body: "VR's NEXORA grants you a limited, non-exclusive right to use your purchased card and associated digital profile for lawful personal or business networking purposes. You are responsible for the accuracy of the content you publish on your profile.",
  },
  {
    title: "Orders & Payment",
    body: "All orders placed through our shop are subject to acceptance and product availability. Prices are listed in Indian Rupees (INR) and are inclusive of applicable taxes unless stated otherwise. Payment is processed securely at checkout via UPI, card, or net banking.",
  },
  {
    title: "Cancellations & Refunds",
    body: "Orders may be cancelled within 24 hours of placement, provided they have not yet been shipped. Physical cards can be returned within 7 days of delivery if unused and in original condition. Refunds are processed to the original payment method within 7-10 business days.",
  },
  {
    title: "Intellectual Property",
    body: "The VR's NEXORA name, logo, website design, and platform software are the intellectual property of VR's NEXORA Technologies Pvt. Ltd. You retain ownership of the content you upload to your profile, but grant us a license to host and display it as part of the service.",
  },
  {
    title: "Limitation of Liability",
    body: "VR's NEXORA is provided on an \"as is\" basis. We are not liable for indirect, incidental, or consequential damages arising from use of our cards or platform, including delays in delivery or third-party service interruptions, to the maximum extent permitted by law.",
  },
  {
    title: "Governing Law",
    body: "These Terms are governed by the laws of India. Any disputes arising from these Terms or use of our services shall be subject to the exclusive jurisdiction of the courts of Hyderabad, Telangana.",
  },
]

export default function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Terms & Conditions</h1>
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
