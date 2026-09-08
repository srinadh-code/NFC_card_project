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
    HomeCTASerializer,
    HomeHeroFeatureHighlightSerializer,
    HomeHeroSerializer,
    HomeHowItFeelsPointSerializer,
    HomeHowItFeelsSerializer,
    HowItWorksStepSerializer,
    StatisticSerializer,
    TestimonialSerializer,
    ValueSerializer,
)

from .base import PublicListAPIView

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
    model = Feature
    serializer_class = FeatureSerializer


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
        if page in (Statistic.Page.HOME, Statistic.Page.ABOUT):
            queryset = queryset.filter(page=page)
        return success(StatisticSerializer(queryset, many=True).data)


class ContactMessagePublicCreateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ContactMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success(None, message="Message sent! We'll get back to you within 24 hours.", status=201)
