from django.db import models


class FeaturesPageSettings(models.Model):
    """Singleton — the Features page's hero section and page-level copy.

    Deliberately a separate model from HomeHero/AboutPage rather than a
    shared one: the Features page's hero has its own badge/CTA/trust-line
    shape that doesn't map onto either. The `Feature` model already used by
    Home's "Why Choose" section is likewise NOT reused here (see
    FeaturesPageCard below) — this page's cards need image/gradient/CTA
    fields Home's simpler cards don't, and coupling them would mean every
    edit here risks changing Home's section too.
    """

    page_title = models.CharField(max_length=200, blank=True, default="")
    page_subtitle = models.TextField(blank=True, default="")

    hero_badge = models.CharField(max_length=150, blank=True, default="")
    # Two-part heading, same convention as HomeHero: line 2 renders in the
    # brand gradient (e.g. "A Smarter Way to Connect." styled, under a plain
    # "More Than a Card." first line).
    hero_heading_line1 = models.CharField(max_length=255, blank=True, default="")
    hero_heading_line2 = models.CharField(max_length=255, blank=True, default="")
    hero_description = models.TextField(blank=True, default="")
    hero_image_url = models.URLField(max_length=500, blank=True, default="")
    hero_image_public_id = models.CharField(max_length=255, blank=True, default="")

    primary_cta_text = models.CharField(max_length=100, blank=True, default="")
    primary_cta_url = models.CharField(max_length=255, blank=True, default="")
    secondary_cta_text = models.CharField(max_length=100, blank=True, default="")
    secondary_cta_url = models.CharField(max_length=255, blank=True, default="")

    # The "Trusted by 10,000+ professionals" line under the hero CTAs.
    trust_badge_text = models.CharField(max_length=150, blank=True, default="")
    trusted_users_count = models.CharField(
        max_length=50, blank=True, default="", help_text="e.g. 10,000+"
    )

    # The feature-grid section's own heading/subtitle (e.g. "Everything You
    # Need, Built In") — page-level copy that isn't part of any individual
    # card, so it lives here rather than on FeaturesPageCard.
    features_grid_heading = models.CharField(max_length=255, blank=True, default="")
    features_grid_subtitle = models.TextField(blank=True, default="")

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Features Page Settings"
        verbose_name_plural = "Features Page Settings"

    def __str__(self):
        return self.page_title or "Features Page Settings"


class FeaturesPageCard(models.Model):
    """One card in the Features page's grid ("Everything You Need, Built
    In"). Structurally similar to the shared `Feature` model but
    deliberately separate — this page's cards support an image, a gradient,
    and their own CTA, none of which Home's "Why Choose" cards need."""

    title = models.CharField(max_length=150)
    description = models.TextField()
    icon = models.CharField(max_length=50, blank=True, default="", help_text="Lucide icon name")

    image_url = models.URLField(max_length=500, blank=True, default="")
    image_public_id = models.CharField(max_length=255, blank=True, default="")

    gradient = models.CharField(max_length=255, blank=True, default="", help_text="Optional CSS gradient")
    cta_text = models.CharField(max_length=100, blank=True, default="")
    cta_url = models.CharField(max_length=255, blank=True, default="")

    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Features Page Card"

    def __str__(self):
        return self.title


class FeaturesAnalyticsSection(models.Model):
    """Singleton — the "Track Your Connections in Real Time" analytics
    showcase. `dashboard_image` replaces the code-rendered DashboardMockup
    fallback on the public page once an admin uploads one."""

    badge = models.CharField(max_length=150, blank=True, default="")
    heading = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")

    dashboard_image_url = models.URLField(max_length=500, blank=True, default="")
    dashboard_image_public_id = models.CharField(max_length=255, blank=True, default="")

    cta_text = models.CharField(max_length=100, blank=True, default="")
    cta_url = models.CharField(max_length=255, blank=True, default="")

    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Features Analytics Section"
        verbose_name_plural = "Features Analytics Section"

    def __str__(self):
        return self.heading or "Features Analytics Section"


class FeaturesShowcaseSection(models.Model):
    """Singleton — a product-showcase panel (two images: a main shot and a
    smaller companion card), new to the Features page."""

    badge = models.CharField(max_length=150, blank=True, default="")
    heading = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")

    main_image_url = models.URLField(max_length=500, blank=True, default="")
    main_image_public_id = models.CharField(max_length=255, blank=True, default="")
    card_image_url = models.URLField(max_length=500, blank=True, default="")
    card_image_public_id = models.CharField(max_length=255, blank=True, default="")

    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Features Showcase Section"
        verbose_name_plural = "Features Showcase Section"

    def __str__(self):
        return self.heading or "Features Showcase Section"


class FeaturesCTA(models.Model):
    """Singleton — the Features page's own closing call-to-action banner.
    Distinct from the generic CtaBanner used elsewhere: this one carries
    real admin-editable copy and an optional background image instead of a
    single hardcoded title prop."""

    heading = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")
    button_text = models.CharField(max_length=100, blank=True, default="")
    button_url = models.CharField(max_length=255, blank=True, default="")

    background_image_url = models.URLField(max_length=500, blank=True, default="")
    background_image_public_id = models.CharField(max_length=255, blank=True, default="")

    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Features CTA Section"
        verbose_name_plural = "Features CTA Section"

    def __str__(self):
        return self.heading or "Features CTA Section"
