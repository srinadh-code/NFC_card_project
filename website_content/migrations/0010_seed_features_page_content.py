# Data migration: seeds the new Features-page CMS models with the exact
# copy that was previously hardcoded in frontend/src/pages/public/Features.tsx
# and components/marketing/StatsBar.tsx, so shipping this migration doesn't
# change what a visitor sees — it just makes all of it admin-editable from
# here on. See website_content/models/features_page.py.
#
# FeaturesShowcaseSection is seeded but left is_active=False: there is no
# existing "showcase" section on the page to preserve, so it ships off
# rather than inventing marketing copy that was never actually written by
# the site owner. An admin can fill it in and switch it on when ready.
from django.db import migrations

FEATURE_CARDS = [
    {
        "icon": "Zap",
        "title": "Instant Sharing",
        "description": "Share your complete profile instantly with a single tap.",
        "gradient": "linear-gradient(135deg,#4F46E5,#7C3AED)",
    },
    {
        "icon": "UserCog",
        "title": "Custom Profiles",
        "description": "Personalize your bio, photo, branding, and layout.",
        "gradient": "linear-gradient(135deg,#EC4899,#F472B6)",
    },
    {
        "icon": "Nfc",
        "title": "NFC & QR Code",
        "description": "Works via NFC tap and QR code, compatible with every device.",
        "gradient": "linear-gradient(135deg,#2563EB,#06B6D4)",
    },
    {
        "icon": "BarChart3",
        "title": "Real-time Analytics",
        "description": "See exactly who's viewing your profile, when, and from where.",
        "gradient": "linear-gradient(135deg,#22C55E,#10B981)",
    },
    {
        "icon": "Share2",
        "title": "Social Integrations",
        "description": "Link LinkedIn, Instagram, WhatsApp and more to connect instantly.",
        "gradient": "linear-gradient(135deg,#F97316,#F59E0B)",
    },
    {
        "icon": "RefreshCcw",
        "title": "Easy Updates",
        "description": "Change your details anytime — no need to reprint a card.",
        "gradient": "linear-gradient(135deg,#7C3AED,#4F46E5)",
    },
]

FEATURES_STATISTICS = [
    {"icon": "Users", "value": "10,000+", "label": "Connections Shared"},
    {"icon": "User", "value": "5,000+", "label": "Active Users"},
    {"icon": "ShieldCheck", "value": "99.9%", "label": "Uptime"},
    {"icon": "Leaf", "value": "100%", "label": "Eco-Friendly"},
]


def seed(apps, schema_editor):
    FeaturesPageSettings = apps.get_model("website_content", "FeaturesPageSettings")
    FeaturesPageCard = apps.get_model("website_content", "FeaturesPageCard")
    FeaturesAnalyticsSection = apps.get_model("website_content", "FeaturesAnalyticsSection")
    FeaturesShowcaseSection = apps.get_model("website_content", "FeaturesShowcaseSection")
    FeaturesCTA = apps.get_model("website_content", "FeaturesCTA")
    Statistic = apps.get_model("website_content", "Statistic")

    if not FeaturesPageSettings.objects.exists():
        FeaturesPageSettings.objects.create(
            hero_badge="FEATURES · Built for the Modern Professional",
            hero_heading_line1="More Than a Card.",
            hero_heading_line2="A Smarter Way to Connect.",
            hero_description=(
                "Powerful features to help you create, share, and grow your digital identity "
                "— all with a single tap."
            ),
            primary_cta_text="Order Your Card",
            primary_cta_url="/shop",
            secondary_cta_text="Watch Demo",
            secondary_cta_url="",
            trust_badge_text="professionals",
            trusted_users_count="10,000+",
            features_grid_heading="Everything You Need, Built In",
            features_grid_subtitle=(
                "Six premium capabilities that turn a simple tap into a lasting connection."
            ),
            is_active=True,
        )

    if not FeaturesPageCard.objects.exists():
        for i, card in enumerate(FEATURE_CARDS):
            FeaturesPageCard.objects.create(display_order=i, is_active=True, **card)

    if not FeaturesAnalyticsSection.objects.exists():
        FeaturesAnalyticsSection.objects.create(
            badge="ANALYTICS · Data That Drives Opportunities",
            heading="Track Your Connections in Real Time",
            description=(
                "Get insights into your profile views, taps, locations, and more. Turn every "
                "connection into an opportunity."
            ),
            cta_text="View Dashboard",
            cta_url="/login",
            is_active=True,
        )

    if not FeaturesShowcaseSection.objects.exists():
        FeaturesShowcaseSection.objects.create(
            badge="",
            heading="",
            description="",
            is_active=False,
        )

    if not FeaturesCTA.objects.exists():
        FeaturesCTA.objects.create(
            heading="Ready to Experience the Power of VR's NEXORA?",
            description="Join thousands of professionals who've upgraded the way they network.",
            button_text="Order Your Card Now",
            button_url="/shop",
            is_active=True,
        )

    if not Statistic.objects.filter(page="features").exists():
        for i, stat in enumerate(FEATURES_STATISTICS):
            Statistic.objects.create(page="features", display_order=i, is_active=True, **stat)


def unseed(apps, schema_editor):
    # Reverse: remove exactly what seed() would have created, identified by
    # content rather than a blanket delete (safe even if an admin has since
    # added their own additional rows of the same type).
    FeaturesPageSettings = apps.get_model("website_content", "FeaturesPageSettings")
    FeaturesPageCard = apps.get_model("website_content", "FeaturesPageCard")
    FeaturesAnalyticsSection = apps.get_model("website_content", "FeaturesAnalyticsSection")
    FeaturesShowcaseSection = apps.get_model("website_content", "FeaturesShowcaseSection")
    FeaturesCTA = apps.get_model("website_content", "FeaturesCTA")
    Statistic = apps.get_model("website_content", "Statistic")

    FeaturesPageSettings.objects.filter(hero_heading_line1="More Than a Card.").delete()
    FeaturesPageCard.objects.filter(title__in=[c["title"] for c in FEATURE_CARDS]).delete()
    FeaturesAnalyticsSection.objects.filter(heading="Track Your Connections in Real Time").delete()
    FeaturesShowcaseSection.objects.filter(heading="", is_active=False).delete()
    FeaturesCTA.objects.filter(heading="Ready to Experience the Power of VR's NEXORA?").delete()
    Statistic.objects.filter(page="features", label__in=[s["label"] for s in FEATURES_STATISTICS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("website_content", "0009_remove_featurespagesettings_hero_heading_and_more"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
