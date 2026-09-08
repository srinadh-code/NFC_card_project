"""
Idempotent seed for the Website Content module.

Populates every table from the copy that is (or, for genuinely new sections
like Companies, was) hardcoded in the public frontend today, so the site
looks identical the moment the frontend switches from static arrays to the
API. Safe to run more than once: singletons are created only if missing,
and collection rows are keyed by their natural text field (question, title,
label, ...) via get_or_create, so re-running never duplicates rows or
clobbers edits an admin has already made.
"""

from django.core.management.base import BaseCommand

from website_content.models import (
    AboutBuiltFromExperience,
    AboutFeatureHighlight,
    AboutMission,
    AboutPage,
    AboutWhyChoose,
    Company,
    Faq,
    Feature,
    HomeCTA,
    HomeHero,
    HomeHeroFeatureHighlight,
    HomeHowItFeels,
    HomeHowItFeelsPoint,
    HowItWorksStep,
    Statistic,
    Testimonial,
    Value,
)


class Command(BaseCommand):
    help = "Seed the Website Content tables from the current public-site copy."

    def handle(self, *args, **options):
        self._seed_home()
        self._seed_about()
        self._seed_values()
        self._seed_features()
        self._seed_how_it_works()
        self._seed_faqs()
        self._seed_testimonials()
        self._seed_companies()
        self._seed_statistics()
        self.stdout.write(self.style.SUCCESS("Website content seeded."))

    # -- Home -----------------------------------------------------------

    def _seed_home(self):
        HomeHero.objects.get_or_create(
            defaults=dict(
                badge="VR'S NEXORA · DIGITAL IDENTITY PLATFORM",
                heading="One Tap. Unlimited Connections.",
                description=(
                    "Transform every introduction into a lasting digital connection "
                    "using NFC-powered smart identity cards."
                ),
                primary_cta_text="Order Your Card",
                primary_cta_link="/shop",
                secondary_cta_text="Watch Demo",
                secondary_cta_link="",
            )
        )

        highlights = [
            ("UserCog", "Digital Business Profile"),
            ("Nfc", "NFC & QR Code"),
            ("BarChart3", "Real-time Analytics"),
            ("Zap", "Easy to Use"),
        ]
        for order, (icon, label) in enumerate(highlights):
            HomeHeroFeatureHighlight.objects.get_or_create(
                label=label, defaults=dict(icon=icon, display_order=order)
            )

        HomeHowItFeels.objects.get_or_create(
            defaults=dict(
                badge="HOW IT FEELS",
                heading="Just Tap. That's It.",
                description=(
                    "No fumbling for a paper card, no typing a number into a new "
                    "contact. Hold your VR's NEXORA card near any smartphone and "
                    "your entire digital identity appears instantly on their screen."
                ),
            )
        )

        points = [
            ("Zap", "Instant sharing — your profile opens in under a second."),
            ("Smartphone", "No app required — works straight from any browser."),
            ("Globe", "Compatible with every smartphone, NFC tap or QR fallback."),
        ]
        for order, (icon, text) in enumerate(points):
            HomeHowItFeelsPoint.objects.get_or_create(
                text=text, defaults=dict(icon=icon, display_order=order)
            )

        HomeCTA.objects.get_or_create(
            defaults=dict(
                heading="Still have questions?",
                description=(
                    "Our team is happy to help you pick the right setup, answer "
                    "questions about your order, or troubleshoot your card."
                ),
                button_text="Contact Us",
                button_link="/contact",
            )
        )

    # -- About ------------------------------------------------------------

    def _seed_about(self):
        AboutPage.objects.get_or_create(
            defaults=dict(
                page_title="About VR's NEXORA",
                page_subtitle=(
                    "We're on a mission to replace paper business cards with a "
                    "smarter, greener, more memorable way to connect."
                ),
                story_badge="OUR STORY",
                story_title="A smarter way to introduce yourself",
                story_paragraph_1=(
                    "VR's NEXORA is a digital business card platform built for the "
                    "modern professional. Instead of printing hundreds of cards "
                    "that end up in a drawer, our NFC-enabled cards let you share "
                    "a rich, always up-to-date profile with a single tap — no app "
                    "required on the recipient's end."
                ),
                story_paragraph_2=(
                    "Founded by a small team of designers and engineers who were "
                    "tired of running out of paper cards at networking events, "
                    "VR's NEXORA has grown into a platform trusted by individuals, "
                    "startups, and enterprise teams across the globe to make every "
                    "introduction count."
                ),
            )
        )

        feature_highlights = [
            ("Zap", "One Tap Sharing"),
            ("Nfc", "NFC Technology"),
            ("QrCode", "QR Code Backup"),
            ("RefreshCw", "Real-Time Updates"),
            ("Smartphone", "No App Required"),
            ("Lock", "Secure Digital Identity"),
        ]
        for order, (icon, label) in enumerate(feature_highlights):
            AboutFeatureHighlight.objects.get_or_create(
                label=label, defaults=dict(icon=icon, display_order=order)
            )

        AboutMission.objects.get_or_create(
            defaults=dict(
                badge="OUR MISSION",
                heading="Empowering Connections. Every Time.",
                description=(
                    "To empower every professional with a networking tool that's "
                    "instant, sustainable, and endlessly customizable — turning "
                    "every handshake into a lasting digital connection."
                ),
            )
        )

        why_choose = [
            (
                "Zap",
                "Instant Sharing",
                "Share your entire profile instantly with a single tap.",
                "linear-gradient(135deg,#4F46E5,#7C3AED)",
            ),
            (
                "UserCog",
                "Custom Profiles",
                "Fully personalize your bio, photo, branding, and layout.",
                "linear-gradient(135deg,#EC4899,#F472B6)",
            ),
            (
                "Nfc",
                "NFC & QR Code",
                "Every card works via NFC tap and a printed QR code.",
                "linear-gradient(135deg,#2563EB,#06B6D4)",
            ),
            (
                "BarChart3",
                "Real-time Analytics",
                "See exactly who's viewing your profile, when, and from where.",
                "linear-gradient(135deg,#22C55E,#10B981)",
            ),
        ]
        for order, (icon, title, description, gradient) in enumerate(why_choose):
            AboutWhyChoose.objects.get_or_create(
                title=title,
                defaults=dict(icon=icon, description=description, gradient=gradient, display_order=order),
            )

        AboutBuiltFromExperience.objects.get_or_create(
            defaults=dict(
                heading="Built From Experience",
                subtitle="From a frustrating networking event to a platform used in 120+ countries.",
                paragraph_1=(
                    "It started with a simple frustration — running out of paper "
                    "cards at the exact moment a great connection was made. We "
                    "asked ourselves: why hasn't the business card evolved in over "
                    "a century?"
                ),
                paragraph_2=(
                    "So we built VR's NEXORA: a durable NFC card paired with a "
                    "beautiful, editable digital profile. Update your details "
                    "anytime, track every tap and scan, and never run out of "
                    "cards again."
                ),
            )
        )

    # -- Shared -------------------------------------------------------------

    def _seed_values(self):
        values = [
            ("Sparkles", "Innovation", "Constantly evolving networking technology."),
            ("Feather", "Simplicity", "Effortless setup, effortless sharing."),
            ("ShieldCheck", "Trust", "Your data protected at every step."),
            ("Trophy", "Excellence", "Premium materials, premium experience."),
        ]
        for order, (icon, title, description) in enumerate(values):
            Value.objects.get_or_create(
                title=title, defaults=dict(icon=icon, description=description, display_order=order)
            )

    def _seed_features(self):
        features = [
            ("Zap", "Instant Sharing", "Share your complete profile instantly with a single tap."),
            ("UserCog", "Custom Profiles", "Personalize your bio, photo, branding, and layout."),
            ("Nfc", "NFC & QR Code", "Works via NFC tap and QR code, compatible with every device."),
            (
                "BarChart3",
                "Real-time Analytics",
                "See exactly who's viewing your profile, when, and from where.",
            ),
            (
                "Share2",
                "Social Integrations",
                "Link LinkedIn, Instagram, WhatsApp and more to connect instantly.",
            ),
            ("RefreshCcw", "Easy Updates", "Change your details anytime — no need to reprint a card."),
        ]
        for order, (icon, title, description) in enumerate(features):
            Feature.objects.get_or_create(
                title=title, defaults=dict(icon=icon, description=description, display_order=order)
            )

    def _seed_how_it_works(self):
        steps = [
            (
                "ShoppingBag",
                "Order Your Card",
                "Pick your card type, color, and quantity, then place your order in minutes.",
            ),
            (
                "PackageCheck",
                "Receive Your NFC Card",
                "Your card ships within 1-2 days and arrives at your doorstep in 5-7 business days.",
            ),
            (
                "Nfc",
                "Activate Your Card",
                "Scan the card once and link it to your VR's NEXORA account to activate it instantly.",
            ),
            (
                "UserCircle2",
                "Create Your Profile",
                "Add your name, photo, bio, and social links to build your digital business card.",
            ),
            (
                "Share2",
                "Start Sharing",
                "Tap your card on any smartphone to instantly share your profile — no app needed.",
            ),
        ]
        for index, (icon, title, description) in enumerate(steps):
            HowItWorksStep.objects.get_or_create(
                title=title,
                defaults=dict(
                    step_number=index + 1, icon=icon, description=description, display_order=index
                ),
            )

    def _seed_faqs(self):
        faqs = [
            (
                "What is an NFC card?",
                "An NFC (Near Field Communication) card is a smart card embedded with a "
                "chip that lets you share your digital business card, social profiles, "
                "and contact details with a single tap on any NFC-enabled smartphone — "
                "no app required.",
            ),
            (
                "How does VR's NEXORA card work?",
                "Simply tap your VR's NEXORA card on the back of any NFC-enabled "
                "smartphone. Your digital profile opens instantly in the recipient's "
                "browser, letting them view your details, save your contact, and "
                "connect on social media. If NFC isn't supported, they can scan the "
                "QR code instead.",
            ),
            (
                "Do I need any app to use the card?",
                "No. Recipients don't need to install any app to view your profile. "
                "You only need to sign in to your VR's NEXORA dashboard to activate "
                "and manage your card and profile.",
            ),
            (
                "Can I update my profile details later?",
                "Yes, absolutely. You can update your name, designation, company, "
                "photo, bio, and social links anytime from your customer dashboard. "
                "Changes reflect instantly on your live profile without needing a "
                "new card.",
            ),
            (
                "Is my data secure?",
                "Yes. We use industry-standard encryption for all stored data and "
                "never share your information with third parties without consent. "
                "You have full control over which details are visible on your "
                "public profile.",
            ),
            (
                "What if my card is lost or damaged?",
                "You can order a replacement card from your dashboard and simply "
                "reassign your existing profile to the new card's UID. Your profile "
                "link and QR code remain unaffected.",
            ),
            (
                "How long does delivery take?",
                "Orders are typically processed within 1-2 business days and "
                "delivered within 5-7 business days across India via our logistics "
                "partners.",
            ),
            (
                "Can I use one VR's NEXORA card for a business team?",
                "Yes, our Business and Enterprise plans support bulk card ordering "
                "and centralized team management from a single admin panel.",
            ),
        ]
        for order, (question, answer) in enumerate(faqs):
            Faq.objects.get_or_create(question=question, defaults=dict(answer=answer, display_order=order))

    def _seed_testimonials(self):
        testimonials = [
            (
                "Ananya Reddy",
                "Founder & CEO",
                "Nimbus Growth Studio",
                5,
                "https://api.dicebear.com/9.x/notionists/svg?seed=ananya-reddy",
                "VR's NEXORA replaced an entire box of paper cards. I tap my phone at "
                "every event now and my whole profile — portfolio, socials, contact — "
                "opens instantly for the other person.",
            ),
            (
                "Rahul Menon",
                "VP of Sales",
                "Orbital Systems",
                5,
                "https://api.dicebear.com/9.x/notionists/svg?seed=rahul-menon",
                "Our field sales team activated 40 cards in a day. The analytics "
                "dashboard alone justified the switch — we finally know which "
                "conversations turn into leads.",
            ),
            (
                "Priya Nair",
                "Freelance Designer",
                "Studio Nair",
                5,
                "https://api.dicebear.com/9.x/notionists/svg?seed=priya-nair",
                "Clients are always impressed when I tap my card on their phone. "
                "Updating my portfolio link takes ten seconds and everyone who has "
                "my card automatically sees the latest version.",
            ),
            (
                "Karthik Iyer",
                "Co-Founder",
                "Ledgerly",
                4,
                "https://api.dicebear.com/9.x/notionists/svg?seed=karthik-iyer",
                "Setup took less than five minutes. The QR fallback is a nice touch "
                "for people whose phones don't support NFC — nobody gets left out.",
            ),
            (
                "Sneha Kulkarni",
                "HR Business Partner",
                "Vertex Retail",
                5,
                "https://api.dicebear.com/9.x/notionists/svg?seed=sneha-kulkarni",
                "We rolled out VR's NEXORA cards to the whole leadership team. "
                "Managing everyone's cards from one admin panel makes onboarding new "
                "hires painless.",
            ),
            (
                "Arjun Desai",
                "Business Development Manager",
                "Skyline Exports",
                4,
                "https://api.dicebear.com/9.x/notionists/svg?seed=arjun-desai",
                "I travel constantly for trade shows. Being able to update my number "
                "and email from my phone the moment they change — without "
                "reprinting anything — has saved me real money.",
            ),
        ]
        for order, (name, designation, company, rating, avatar, review) in enumerate(testimonials):
            Testimonial.objects.get_or_create(
                name=name,
                defaults=dict(
                    designation=designation,
                    company=company,
                    rating=rating,
                    image_url=avatar,
                    review=review,
                    display_order=order,
                ),
            )

    def _seed_companies(self):
        companies = ["Google", "Microsoft", "Amazon", "Airtel", "Tata", "Flipkart"]
        for order, name in enumerate(companies):
            Company.objects.get_or_create(name=name, defaults=dict(display_order=order))

    def _seed_statistics(self):
        home_stats = [
            ("10K+", "Happy Customers"),
            ("50K+", "Cards Delivered"),
            ("1M+", "Taps Recorded"),
            ("120+", "Countries Served"),
        ]
        for order, (value, label) in enumerate(home_stats):
            Statistic.objects.get_or_create(
                page=Statistic.Page.HOME,
                label=label,
                defaults=dict(value=value, display_order=order),
            )

        about_stats = [
            ("100,000+", "Connections Shared", "Users"),
            ("50,000+", "Active Users", "User"),
            ("99.9%", "Uptime", "ShieldCheck"),
            ("120+", "Countries Reached", "Globe"),
        ]
        for order, (value, label, icon) in enumerate(about_stats):
            Statistic.objects.get_or_create(
                page=Statistic.Page.ABOUT,
                label=label,
                defaults=dict(value=value, icon=icon, display_order=order),
            )
