# Data migration: seeds the new Order Card ("/shop" page) CMS models with
# the exact copy that was previously hardcoded in
# frontend/src/data/constants.ts (NEXORA_CARD_TYPES) and
# frontend/src/pages/public/Shop.tsx (TRUST_BADGES, THEME_PLAN_COPY, page
# header/theme-section text), so shipping this migration doesn't change
# what a visitor sees — it just makes all of it admin-editable from here on.
#
# Deliberately no network calls here (no Cloudinary upload): migrations
# must stay deterministic and runnable offline/in CI. The Google Review
# Card's real product photo is seeded with a blank image field and
# uploaded separately by a one-off script immediately after this migration
# runs — see the implementation notes for this change. Until that script
# runs, the product simply shows the same NfcCardFace fallback graphic
# Custom already uses when it has no image.
from django.db import migrations

TRUST_BADGES = [
    {"icon": "Truck", "label": "Free Shipping"},
    {"icon": "RotateCcw", "label": "7 Days Return"},
    {"icon": "ShieldCheck", "label": "Secure Payment"},
    {"icon": "CheckCircle2", "label": "1 Year Warranty"},
]

CUSTOM_FEATURES = [
    "NFC Enabled",
    "Digital Business Profile",
    "QR Code",
    "Unlimited Profile Updates",
    "Social Links",
    "Analytics Dashboard",
    "Custom Color",
    "Custom Logo",
    "Custom Design",
]

GOOGLE_REVIEW_FEATURES = [
    "Google Review QR Code",
    "One-Scan Review Access",
    "Direct Link to Your Google Review Page",
    "Easy for Customers to Leave Feedback",
    "Durable Business Review Card",
]


def seed(apps, schema_editor):
    OrderCardPageSettings = apps.get_model("website_content", "OrderCardPageSettings")
    OrderCardProduct = apps.get_model("website_content", "OrderCardProduct")
    OrderCardTrustBadge = apps.get_model("website_content", "OrderCardTrustBadge")

    if not OrderCardPageSettings.objects.exists():
        OrderCardPageSettings.objects.create(
            page_title="Choose Your NEXORA Card",
            page_subtitle="Select the card that best fits your style and professional needs.",
            theme_section_heading="Choose Your Profile Theme",
            theme_section_subtitle="Personalize your digital identity with a profile style that matches you.",
            is_active=True,
        )

    if not OrderCardProduct.objects.exists():
        OrderCardProduct.objects.create(
            slug="custom",
            name="NEXORA Custom",
            price="999.00",
            design="Custom color, logo and design",
            best_for="Businesses & Brands",
            template_count=5,
            features="\n".join(CUSTOM_FEATURES),
            card_type="CUSTOM",
            card_tone="custom",
            color_name="Custom",
            color_hex="#7C3AED",
            theme_plan_copy="Choose one of five premium themes with full customization options.",
            popular=False,
            display_order=0,
            is_active=True,
        )
        OrderCardProduct.objects.create(
            slug="google-review",
            name="Google Review Card",
            price="499.00",
            design="Make it easy for customers to leave a Google Review with a simple scan.",
            best_for="Businesses & Local Stores",
            template_count=None,
            features="\n".join(GOOGLE_REVIEW_FEATURES),
            card_type="REVIEW",
            image_caption=(
                "Make it easy for customers to find your Google Review page and share their "
                "feedback."
            ),
            color_name="Black",
            color_hex="#111111",
            popular=False,
            display_order=1,
            is_active=True,
        )

    if not OrderCardTrustBadge.objects.exists():
        for i, badge in enumerate(TRUST_BADGES):
            OrderCardTrustBadge.objects.create(display_order=i, is_active=True, **badge)


def unseed(apps, schema_editor):
    OrderCardPageSettings = apps.get_model("website_content", "OrderCardPageSettings")
    OrderCardProduct = apps.get_model("website_content", "OrderCardProduct")
    OrderCardTrustBadge = apps.get_model("website_content", "OrderCardTrustBadge")

    OrderCardPageSettings.objects.filter(page_title="Choose Your NEXORA Card").delete()
    OrderCardProduct.objects.filter(slug__in=["custom", "google-review"]).delete()
    OrderCardTrustBadge.objects.filter(label__in=[b["label"] for b in TRUST_BADGES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("website_content", "0011_ordercardpagesettings_ordercardproduct_and_more"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
