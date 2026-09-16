"""
Public, read-only endpoints. AllowAny, active content only.

Home and About are each served as a single composed payload (one HTTP call
per page instead of one per section) — the spec explicitly calls out
avoiding redundant API calls; Features/How-It-Works/FAQs/Testimonials/
Companies/Statistics/Values additionally get their own standalone endpoints
since they're each reused elsewhere (the FAQ page fetches the same `Faq`
table the Home preview slices from, etc).
"""

from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from common.response import error, success

from website_content.models import (
    AboutBuiltFromExperience,
    AboutFeatureHighlight,
    AboutMission,
    AboutPage,
    AboutWhyChoose,
    Company,
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
    HowItWorksStep,
    OrderCardPageSettings,
    OrderCardProduct,
    OrderCardTrustBadge,
    ProfileTemplatePreview,
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
    ContactMessageCreateSerializer,
    FaqSerializer,
    FeatureSerializer,
    FeaturesAnalyticsSectionSerializer,
    FeaturesCTASerializer,
    FeaturesPageCardSerializer,
    FeaturesPageSettingsSerializer,
    FeaturesShowcaseSectionSerializer,
    HomeBottomBarItemSerializer,
    HomeCTASerializer,
    HomeHeroFeatureHighlightSerializer,
    HomeHeroSerializer,
    HomeHowItFeelsPointSerializer,
    HomeHowItFeelsSerializer,
    HowItWorksStepSerializer,
    OrderCardPageSettingsSerializer,
    OrderCardProductSerializer,
    OrderCardTrustBadgeSerializer,
    ProfileTemplatePreviewSerializer,
    PublicGeneralSettingsSerializer,
    StatisticSerializer,
    TestimonialSerializer,
    ValueSerializer,
)

from .base import PublicListAPIView, PublicSingletonAPIView

HOME_FAQ_PREVIEW_COUNT = 5


class HomePublicView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        hero = HomeHero.objects.filter(is_active=True).first()
        how_it_feels = HomeHowItFeels.objects.filter(is_active=True).first()
        cta = HomeCTA.objects.filter(is_active=True).first()

        data = {
            "hero": HomeHeroSerializer(hero).data if hero else None,
            "hero_features": HomeHeroFeatureHighlightSerializer(
                HomeHeroFeatureHighlight.objects.filter(is_active=True), many=True
            ).data,
            "bottom_bar": HomeBottomBarItemSerializer(
                HomeBottomBarItem.objects.filter(is_active=True), many=True
            ).data,
            "how_it_feels": (
                {
                    **HomeHowItFeelsSerializer(how_it_feels).data,
                    "points": HomeHowItFeelsPointSerializer(
                        HomeHowItFeelsPoint.objects.filter(is_active=True), many=True
                    ).data,
                }
                if how_it_feels
                else None
            ),
            "companies": CompanySerializer(Company.objects.filter(is_active=True), many=True).data,
            "statistics": StatisticSerializer(
                Statistic.objects.filter(is_active=True, page=Statistic.Page.HOME), many=True
            ).data,
            "values": ValueSerializer(Value.objects.filter(is_active=True), many=True).data,
            "testimonials": TestimonialSerializer(
                Testimonial.objects.filter(is_active=True), many=True
            ).data,
            "faqs_preview": FaqSerializer(
                Faq.objects.filter(is_active=True)[:HOME_FAQ_PREVIEW_COUNT], many=True
            ).data,
            "cta": HomeCTASerializer(cta).data if cta else None,
        }
        return success(data)


class AboutPublicView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        page = AboutPage.objects.filter(is_active=True).first()
        mission = AboutMission.objects.filter(is_active=True).first()
        experience = AboutBuiltFromExperience.objects.filter(is_active=True).first()

        if page is None:
            return error("About page content not found.", status=404)

        data = {
            "page": AboutPageSerializer(page).data,
            "story_features": AboutFeatureHighlightSerializer(
                AboutFeatureHighlight.objects.filter(is_active=True), many=True
            ).data,
            "mission": AboutMissionSerializer(mission).data if mission else None,
            "why_choose": AboutWhyChooseSerializer(
                AboutWhyChoose.objects.filter(is_active=True), many=True
            ).data,
            "built_from_experience": (
                AboutBuiltFromExperienceSerializer(experience).data if experience else None
            ),
            "statistics": StatisticSerializer(
                Statistic.objects.filter(is_active=True, page=Statistic.Page.ABOUT), many=True
            ).data,
            "values": ValueSerializer(Value.objects.filter(is_active=True), many=True).data,
        }
        return success(data)


class FeaturesPublicView(PublicListAPIView):
    """The shared `Feature` collection — used by Home's "Why Choose"
    section. NOT the Features page's own content; see
    FeaturesPagePublicView below for that composed payload."""

    model = Feature
    serializer_class = FeatureSerializer


class FeaturesPagePublicView(APIView):
    """Composed payload for the Features page itself — same one-call-per-page
    pattern as HomePublicView/AboutPublicView. Statistics reuse the shared
    Statistic model filtered to page="features"; every other section is a
    dedicated Features-page model (see website_content.models.features_page)."""

    permission_classes = [AllowAny]

    def get(self, request):
        page = FeaturesPageSettings.objects.filter(is_active=True).first()
        analytics = FeaturesAnalyticsSection.objects.filter(is_active=True).first()
        showcase = FeaturesShowcaseSection.objects.filter(is_active=True).first()
        cta = FeaturesCTA.objects.filter(is_active=True).first()

        if page is None:
            return error("Features page content not found.", status=404)

        data = {
            "page": FeaturesPageSettingsSerializer(page).data,
            "cards": FeaturesPageCardSerializer(
                FeaturesPageCard.objects.filter(is_active=True), many=True
            ).data,
            "analytics": FeaturesAnalyticsSectionSerializer(analytics).data if analytics else None,
            "showcase": FeaturesShowcaseSectionSerializer(showcase).data if showcase else None,
            "statistics": StatisticSerializer(
                Statistic.objects.filter(is_active=True, page=Statistic.Page.FEATURES), many=True
            ).data,
            "cta": FeaturesCTASerializer(cta).data if cta else None,
        }
        return success(data)


class OrderCardPublicView(APIView):
    """Composed payload for the /shop ("Order Card") page — same
    one-call-per-page pattern as Home/About/Features. Products and trust
    badges are each their own list; there's no per-page-section grouping
    to compose beyond that."""

    permission_classes = [AllowAny]

    def get(self, request):
        page = OrderCardPageSettings.objects.filter(is_active=True).first()
        if page is None:
            return error("Order Card page content not found.", status=404)

        data = {
            "page": OrderCardPageSettingsSerializer(page).data,
            "products": OrderCardProductSerializer(
                OrderCardProduct.objects.filter(is_active=True), many=True
            ).data,
            "trust_badges": OrderCardTrustBadgeSerializer(
                OrderCardTrustBadge.objects.filter(is_active=True), many=True
            ).data,
            "profile_templates": ProfileTemplatePreviewSerializer(
                ProfileTemplatePreview.objects.filter(is_active=True), many=True
            ).data,
        }
        return success(data)


class HowItWorksPublicView(PublicListAPIView):
    model = HowItWorksStep
    serializer_class = HowItWorksStepSerializer


class FaqsPublicView(PublicListAPIView):
    model = Faq
    serializer_class = FaqSerializer


class TestimonialsPublicView(PublicListAPIView):
    model = Testimonial
    serializer_class = TestimonialSerializer


class CompaniesPublicView(PublicListAPIView):
    model = Company
    serializer_class = CompanySerializer


class ValuesPublicView(PublicListAPIView):
    model = Value
    serializer_class = ValueSerializer


class StatisticsPublicView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        page = request.query_params.get("page")
        queryset = Statistic.objects.filter(is_active=True)
        if page in (Statistic.Page.HOME, Statistic.Page.ABOUT, Statistic.Page.FEATURES):
            queryset = queryset.filter(page=page)
        return success(StatisticSerializer(queryset, many=True).data)


class ContactMessagePublicCreateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ContactMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success(None, message="Message sent! We'll get back to you within 24 hours.", status=201)


class GeneralSettingsPublicView(PublicSingletonAPIView):
    model = GeneralSettings
    serializer_class = PublicGeneralSettingsSerializer
