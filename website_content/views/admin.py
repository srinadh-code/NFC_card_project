"""
Admin-facing CRUD endpoints. IsAdminRole only. Every concrete class is a
thin APIView subclass (model + serializer_class) built on the shared
plumbing in base.py — reorder and image-upload sub-endpoints are opt-in per
resource, only where the spec calls for them.
"""

from rest_framework.views import APIView

from common.pagination import StandardPagination
from common.permissions import IsAdminRole
from common.response import error, success

from website_content.models import (
    AboutBuiltFromExperience,
    AboutFeatureHighlight,
    AboutMission,
    AboutPage,
    AboutWhyChoose,
    Company,
    ContactMessage,
    ContactMessageReply,
    EmailSettings,
    Faq,
    Feature,
    FeaturesAnalyticsSection,
    FeaturesCTA,
    FeaturesPageCard,
    FeaturesPageSettings,
    FeaturesShowcaseSection,
    GeneralSettings,
    HomeBottomBarItem,
    HomeCTA,
    HomeHero,
    HomeHeroFeatureHighlight,
    HomeHowItFeels,
    HomeHowItFeelsPoint,
    HomeOurStory,
    HowItWorksStep,
    OrderCardPageSettings,
    OrderCardProduct,
    OrderCardTrustBadge,
    ProfileTemplatePreview,
    PaymentSettings,
    SecuritySettings,
    ShippingSettings,
    Statistic,
    Testimonial,
    Value,
)
from website_content.serializers import (
    AboutBuiltFromExperienceSerializer,
    AboutFeatureHighlightSerializer,
    AboutMissionSerializer,
    AboutPageSerializer,
    AboutWhyChooseSerializer,
    CompanySerializer,
    ContactMessageReplyCreateSerializer,
    ContactMessageSerializer,
    EmailSettingsSerializer,
    FaqSerializer,
    FeatureSerializer,
    FeaturesAnalyticsSectionSerializer,
    FeaturesCTASerializer,
    FeaturesPageCardSerializer,
    FeaturesPageSettingsSerializer,
    FeaturesShowcaseSectionSerializer,
    GeneralSettingsSerializer,
    HomeBottomBarItemSerializer,
    HomeCTASerializer,
    HomeHeroFeatureHighlightSerializer,
    HomeHeroSerializer,
    HomeHowItFeelsPointSerializer,
    HomeHowItFeelsSerializer,
    HomeOurStorySerializer,
    HowItWorksStepSerializer,
    OrderCardPageSettingsSerializer,
    OrderCardProductSerializer,
    OrderCardTrustBadgeSerializer,
    ProfileTemplatePreviewSerializer,
    PaymentSettingsSerializer,
    SecuritySettingsSerializer,
    ShippingSettingsSerializer,
    StatisticSerializer,
    TestimonialSerializer,
    ValueSerializer,
)

from .base import (
    AdminDetailAPIView,
    AdminImageUploadAPIView,
    AdminListCreateAPIView,
    AdminReorderAPIView,
    AdminSingletonAPIView,
    AdminSingletonImageUploadAPIView,
)

# ---------------------------------------------------------------------------
# Home
# ---------------------------------------------------------------------------


class HomeHeroAdminView(AdminSingletonAPIView):
    model = HomeHero
    serializer_class = HomeHeroSerializer


class HomeHeroPhoneImageAdminView(AdminSingletonImageUploadAPIView):
    model = HomeHero
    serializer_class = HomeHeroSerializer
    url_field = "phone_image_url"
    public_id_field = "phone_image_public_id"
    folder = "website/home"


class HomeHeroNfcCardImageAdminView(AdminSingletonImageUploadAPIView):
    model = HomeHero
    serializer_class = HomeHeroSerializer
    url_field = "nfc_card_image_url"
    public_id_field = "nfc_card_image_public_id"
    folder = "website/home"


class HomeHeroFeatureHighlightAdminListView(AdminListCreateAPIView):
    model = HomeHeroFeatureHighlight
    serializer_class = HomeHeroFeatureHighlightSerializer


class HomeHeroFeatureHighlightAdminDetailView(AdminDetailAPIView):
    model = HomeHeroFeatureHighlight
    serializer_class = HomeHeroFeatureHighlightSerializer


class HomeHeroFeatureHighlightAdminReorderView(AdminReorderAPIView):
    model = HomeHeroFeatureHighlight


class HomeBottomBarItemAdminListView(AdminListCreateAPIView):
    model = HomeBottomBarItem
    serializer_class = HomeBottomBarItemSerializer


class HomeBottomBarItemAdminDetailView(AdminDetailAPIView):
    model = HomeBottomBarItem
    serializer_class = HomeBottomBarItemSerializer


class HomeBottomBarItemAdminReorderView(AdminReorderAPIView):
    model = HomeBottomBarItem


class HomeHowItFeelsAdminView(AdminSingletonAPIView):
    model = HomeHowItFeels
    serializer_class = HomeHowItFeelsSerializer


class HomeHowItFeelsImageAdminView(AdminSingletonImageUploadAPIView):
    model = HomeHowItFeels
    serializer_class = HomeHowItFeelsSerializer
    url_field = "image_url"
    public_id_field = "image_public_id"
    folder = "website/home"


class HomeHowItFeelsPointAdminListView(AdminListCreateAPIView):
    model = HomeHowItFeelsPoint
    serializer_class = HomeHowItFeelsPointSerializer


class HomeHowItFeelsPointAdminDetailView(AdminDetailAPIView):
    model = HomeHowItFeelsPoint
    serializer_class = HomeHowItFeelsPointSerializer


class HomeHowItFeelsPointAdminReorderView(AdminReorderAPIView):
    model = HomeHowItFeelsPoint


class HomeOurStoryAdminView(AdminSingletonAPIView):
    model = HomeOurStory
    serializer_class = HomeOurStorySerializer


class HomeOurStoryImageAdminView(AdminSingletonImageUploadAPIView):
    model = HomeOurStory
    serializer_class = HomeOurStorySerializer
    url_field = "image_url"
    public_id_field = "image_public_id"
    folder = "website/home"


class HomeCTAAdminView(AdminSingletonAPIView):
    model = HomeCTA
    serializer_class = HomeCTASerializer


# ---------------------------------------------------------------------------
# About
# ---------------------------------------------------------------------------


class AboutPageAdminView(AdminSingletonAPIView):
    model = AboutPage
    serializer_class = AboutPageSerializer


class AboutPageStoryImageAdminView(AdminSingletonImageUploadAPIView):
    model = AboutPage
    serializer_class = AboutPageSerializer
    url_field = "story_image_url"
    public_id_field = "story_image_public_id"
    folder = "website/about"


class AboutFeatureHighlightAdminListView(AdminListCreateAPIView):
    model = AboutFeatureHighlight
    serializer_class = AboutFeatureHighlightSerializer


class AboutFeatureHighlightAdminDetailView(AdminDetailAPIView):
    model = AboutFeatureHighlight
    serializer_class = AboutFeatureHighlightSerializer


class AboutFeatureHighlightAdminReorderView(AdminReorderAPIView):
    model = AboutFeatureHighlight


class AboutMissionAdminView(AdminSingletonAPIView):
    model = AboutMission
    serializer_class = AboutMissionSerializer


class AboutWhyChooseAdminListView(AdminListCreateAPIView):
    model = AboutWhyChoose
    serializer_class = AboutWhyChooseSerializer


class AboutWhyChooseAdminDetailView(AdminDetailAPIView):
    model = AboutWhyChoose
    serializer_class = AboutWhyChooseSerializer


class AboutWhyChooseAdminReorderView(AdminReorderAPIView):
    model = AboutWhyChoose


class AboutBuiltFromExperienceAdminView(AdminSingletonAPIView):
    model = AboutBuiltFromExperience
    serializer_class = AboutBuiltFromExperienceSerializer


class AboutBuiltFromExperienceImageAdminView(AdminSingletonImageUploadAPIView):
    model = AboutBuiltFromExperience
    serializer_class = AboutBuiltFromExperienceSerializer
    url_field = "image_url"
    public_id_field = "image_public_id"
    folder = "website/about"


# ---------------------------------------------------------------------------
# Features Page — page-specific sections (hero/settings, cards, analytics,
# showcase, CTA). Statistics for this page reuse the shared Statistic model
# (page="features", see the Shared section below) rather than a dedicated
# model — Statistic was already built to be page-parameterized.
# ---------------------------------------------------------------------------


class FeaturesPageSettingsAdminView(AdminSingletonAPIView):
    model = FeaturesPageSettings
    serializer_class = FeaturesPageSettingsSerializer


class FeaturesPageHeroImageAdminView(AdminSingletonImageUploadAPIView):
    model = FeaturesPageSettings
    serializer_class = FeaturesPageSettingsSerializer
    url_field = "hero_image_url"
    public_id_field = "hero_image_public_id"
    folder = "website/features"


class FeaturesPageCardAdminListView(AdminListCreateAPIView):
    model = FeaturesPageCard
    serializer_class = FeaturesPageCardSerializer


class FeaturesPageCardAdminDetailView(AdminDetailAPIView):
    model = FeaturesPageCard
    serializer_class = FeaturesPageCardSerializer
    image_public_id_field = "image_public_id"


class FeaturesPageCardAdminReorderView(AdminReorderAPIView):
    model = FeaturesPageCard


class FeaturesPageCardImageAdminView(AdminImageUploadAPIView):
    model = FeaturesPageCard
    serializer_class = FeaturesPageCardSerializer
    url_field = "image_url"
    public_id_field = "image_public_id"
    folder = "website/features"


class FeaturesAnalyticsSectionAdminView(AdminSingletonAPIView):
    model = FeaturesAnalyticsSection
    serializer_class = FeaturesAnalyticsSectionSerializer


class FeaturesAnalyticsSectionImageAdminView(AdminSingletonImageUploadAPIView):
    model = FeaturesAnalyticsSection
    serializer_class = FeaturesAnalyticsSectionSerializer
    url_field = "dashboard_image_url"
    public_id_field = "dashboard_image_public_id"
    folder = "website/features"


class FeaturesShowcaseSectionAdminView(AdminSingletonAPIView):
    model = FeaturesShowcaseSection
    serializer_class = FeaturesShowcaseSectionSerializer


class FeaturesShowcaseMainImageAdminView(AdminSingletonImageUploadAPIView):
    model = FeaturesShowcaseSection
    serializer_class = FeaturesShowcaseSectionSerializer
    url_field = "main_image_url"
    public_id_field = "main_image_public_id"
    folder = "website/features"


class FeaturesShowcaseCardImageAdminView(AdminSingletonImageUploadAPIView):
    model = FeaturesShowcaseSection
    serializer_class = FeaturesShowcaseSectionSerializer
    url_field = "card_image_url"
    public_id_field = "card_image_public_id"
    folder = "website/features"


class FeaturesCTAAdminView(AdminSingletonAPIView):
    model = FeaturesCTA
    serializer_class = FeaturesCTASerializer


class FeaturesCTAImageAdminView(AdminSingletonImageUploadAPIView):
    model = FeaturesCTA
    serializer_class = FeaturesCTASerializer
    url_field = "background_image_url"
    public_id_field = "background_image_public_id"
    folder = "website/features"


# ---------------------------------------------------------------------------
# Order Card Page — the /shop page's catalog (products, trust badges,
# header/theme-section copy). Replaces the frontend's formerly-hardcoded
# NEXORA_CARD_TYPES/TRUST_BADGES constants as the real source of truth.
# ---------------------------------------------------------------------------


class OrderCardPageSettingsAdminView(AdminSingletonAPIView):
    model = OrderCardPageSettings
    serializer_class = OrderCardPageSettingsSerializer


class OrderCardProductAdminListView(AdminListCreateAPIView):
    model = OrderCardProduct
    serializer_class = OrderCardProductSerializer


class OrderCardProductAdminDetailView(AdminDetailAPIView):
    model = OrderCardProduct
    serializer_class = OrderCardProductSerializer
    image_public_id_field = "image_public_id"


class OrderCardProductAdminReorderView(AdminReorderAPIView):
    model = OrderCardProduct


class OrderCardProductImageAdminView(AdminImageUploadAPIView):
    model = OrderCardProduct
    serializer_class = OrderCardProductSerializer
    url_field = "image_url"
    public_id_field = "image_public_id"
    folder = "website/order-card"


class OrderCardTrustBadgeAdminListView(AdminListCreateAPIView):
    model = OrderCardTrustBadge
    serializer_class = OrderCardTrustBadgeSerializer


class OrderCardTrustBadgeAdminDetailView(AdminDetailAPIView):
    model = OrderCardTrustBadge
    serializer_class = OrderCardTrustBadgeSerializer


class OrderCardTrustBadgeAdminReorderView(AdminReorderAPIView):
    model = OrderCardTrustBadge


class ProfileTemplatePreviewAdminListView(AdminListCreateAPIView):
    model = ProfileTemplatePreview
    serializer_class = ProfileTemplatePreviewSerializer


class ProfileTemplatePreviewAdminDetailView(AdminDetailAPIView):
    model = ProfileTemplatePreview
    serializer_class = ProfileTemplatePreviewSerializer
    image_public_id_field = "image_public_id"


class ProfileTemplatePreviewAdminReorderView(AdminReorderAPIView):
    model = ProfileTemplatePreview


class ProfileTemplatePreviewImageAdminView(AdminImageUploadAPIView):
    model = ProfileTemplatePreview
    serializer_class = ProfileTemplatePreviewSerializer
    url_field = "image_url"
    public_id_field = "image_public_id"
    folder = "website/profile-templates"


# ---------------------------------------------------------------------------
# Shared: Values, Features, How It Works, FAQs, Testimonials, Companies, Stats
# ---------------------------------------------------------------------------


class ValueAdminListView(AdminListCreateAPIView):
    model = Value
    serializer_class = ValueSerializer


class ValueAdminDetailView(AdminDetailAPIView):
    model = Value
    serializer_class = ValueSerializer


class ValueAdminReorderView(AdminReorderAPIView):
    model = Value


class FeatureAdminListView(AdminListCreateAPIView):
    model = Feature
    serializer_class = FeatureSerializer


class FeatureAdminDetailView(AdminDetailAPIView):
    model = Feature
    serializer_class = FeatureSerializer


class FeatureAdminReorderView(AdminReorderAPIView):
    model = Feature


class HowItWorksStepAdminListView(AdminListCreateAPIView):
    model = HowItWorksStep
    serializer_class = HowItWorksStepSerializer


class HowItWorksStepAdminDetailView(AdminDetailAPIView):
    model = HowItWorksStep
    serializer_class = HowItWorksStepSerializer


class HowItWorksStepAdminReorderView(AdminReorderAPIView):
    model = HowItWorksStep


class FaqAdminListView(AdminListCreateAPIView):
    model = Faq
    serializer_class = FaqSerializer


class FaqAdminDetailView(AdminDetailAPIView):
    model = Faq
    serializer_class = FaqSerializer


class FaqAdminReorderView(AdminReorderAPIView):
    model = Faq


class TestimonialAdminListView(AdminListCreateAPIView):
    model = Testimonial
    serializer_class = TestimonialSerializer


class TestimonialAdminDetailView(AdminDetailAPIView):
    model = Testimonial
    serializer_class = TestimonialSerializer
    image_public_id_field = "image_public_id"


class TestimonialAdminReorderView(AdminReorderAPIView):
    model = Testimonial


class TestimonialImageAdminView(AdminImageUploadAPIView):
    model = Testimonial
    serializer_class = TestimonialSerializer
    url_field = "image_url"
    public_id_field = "image_public_id"
    folder = "website/testimonials"


class CompanyAdminListView(AdminListCreateAPIView):
    model = Company
    serializer_class = CompanySerializer


class CompanyAdminDetailView(AdminDetailAPIView):
    model = Company
    serializer_class = CompanySerializer
    image_public_id_field = "logo_public_id"


class CompanyAdminReorderView(AdminReorderAPIView):
    model = Company


class CompanyImageAdminView(AdminImageUploadAPIView):
    model = Company
    serializer_class = CompanySerializer
    url_field = "logo_url"
    public_id_field = "logo_public_id"
    folder = "website/companies"


class StatisticAdminListView(AdminListCreateAPIView):
    model = Statistic
    serializer_class = StatisticSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        page = self.request.query_params.get("page")
        if page in (Statistic.Page.HOME, Statistic.Page.ABOUT, Statistic.Page.FEATURES):
            queryset = queryset.filter(page=page)
        return queryset


class StatisticAdminDetailView(AdminDetailAPIView):
    model = Statistic
    serializer_class = StatisticSerializer


class StatisticAdminReorderView(AdminReorderAPIView):
    model = Statistic


# ---------------------------------------------------------------------------
# Contact messages
# ---------------------------------------------------------------------------


class ContactMessageAdminListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        queryset = ContactMessage.objects.prefetch_related("replies").all()

        is_read = request.query_params.get("is_read")
        if is_read in ("true", "false"):
            queryset = queryset.filter(is_read=(is_read == "true"))

        is_resolved = request.query_params.get("is_resolved")
        if is_resolved in ("true", "false"):
            queryset = queryset.filter(is_resolved=(is_resolved == "true"))

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = ContactMessageSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class ContactMessageAdminDetailView(AdminDetailAPIView):
    model = ContactMessage
    serializer_class = ContactMessageSerializer


class ContactMessageReplyAdminView(APIView):
    """POST a reply to a contact message. Marks the message read and
    returns the full updated message (with reply history) so the admin
    UI never has to guess the result — same never-fake-success pattern
    as every other write in this app."""

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        try:
            message = ContactMessage.objects.get(pk=pk)
        except ContactMessage.DoesNotExist:
            return error("Not found.", status=404)

        serializer = ContactMessageReplyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ContactMessageReply.objects.create(
            message=message,
            admin=request.user,
            content=serializer.validated_data["content"],
        )

        if not message.is_read:
            message.is_read = True
            message.save(update_fields=["is_read"])

        return success(
            ContactMessageSerializer(message).data,
            message="Reply sent.",
            status=201,
        )


# ---------------------------------------------------------------------------
# General Settings
# ---------------------------------------------------------------------------


class GeneralSettingsAdminView(AdminSingletonAPIView):
    model = GeneralSettings
    serializer_class = GeneralSettingsSerializer


class GeneralSettingsLogoAdminView(AdminSingletonImageUploadAPIView):
    model = GeneralSettings
    serializer_class = GeneralSettingsSerializer
    url_field = "company_logo_url"
    public_id_field = "company_logo_public_id"
    folder = "website/settings"


class GeneralSettingsFaviconAdminView(AdminSingletonImageUploadAPIView):
    model = GeneralSettings
    serializer_class = GeneralSettingsSerializer
    url_field = "favicon_url"
    public_id_field = "favicon_public_id"
    folder = "website/settings"


class PaymentSettingsAdminView(AdminSingletonAPIView):
    model = PaymentSettings
    serializer_class = PaymentSettingsSerializer


class ShippingSettingsAdminView(AdminSingletonAPIView):
    model = ShippingSettings
    serializer_class = ShippingSettingsSerializer


class EmailSettingsAdminView(AdminSingletonAPIView):
    model = EmailSettings
    serializer_class = EmailSettingsSerializer


class SecuritySettingsAdminView(AdminSingletonAPIView):
    model = SecuritySettings
    serializer_class = SecuritySettingsSerializer
