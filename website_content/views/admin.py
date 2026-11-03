"""
Admin-facing CRUD endpoints. IsAdminRole only. Every concrete class is a
thin APIView subclass (model + serializer_class) built on the shared
plumbing in base.py — reorder and image-upload sub-endpoints are opt-in per
resource, only where the spec calls for them.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.views import APIView

from common.image_storage import delete_image, upload_image
from common.pagination import StandardPagination
from common.permissions import IsAdminRole
from common.response import error, success
from common.video_storage import delete_video, upload_video

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
    OrderCardProductImage,
    OrderCardTrustBadge,
    ProfileTemplatePreview,
    PaymentSettings,
    SecuritySettings,
    ShippingSettings,
    Statistic,
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


class HomeHeroDemoVideoAdminView(APIView):
    """POST {video: <mp4 file>} — uploads or replaces the Home page "Watch
    Demo" video on the HomeHero singleton. Same order as the image views'
    _ImageOpsMixin: upload (and verify) first, save the row, and only then
    clean up the previous Cloudinary video — a failure at any step leaves
    the currently saved video untouched."""

    permission_classes = [IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file_obj = request.FILES.get("video")
        if not file_obj:
            return error("No video file provided.", status=400)
        original_name = file_obj.name

        uploaded = upload_video(file_obj, folder="website/home/videos")

        try:
            with transaction.atomic():
                hero = HomeHero.objects.select_for_update().order_by("pk").first()
                if hero is None:
                    hero = HomeHero.objects.create()
                old_public_id = hero.demo_video_public_id
                hero.demo_video_url = uploaded["url"]
                hero.demo_video_public_id = uploaded["public_id"]
                hero.demo_video_filename = original_name[:255]
                hero.demo_video_uploaded_at = timezone.now()
                hero.save(
                    update_fields=[
                        "demo_video_url",
                        "demo_video_public_id",
                        "demo_video_filename",
                        "demo_video_uploaded_at",
                        "updated_at",
                    ]
                )
        except Exception:
            # The new video never made it into the database — don't leave it
            # orphaned on Cloudinary.
            delete_video(uploaded["public_id"])
            raise

        if old_public_id and old_public_id != uploaded["public_id"]:
            transaction.on_commit(lambda: delete_video(old_public_id))
        return success(HomeHeroSerializer(hero).data, message="Demo video uploaded.")


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


ORDER_CARD_IMAGE_FOLDER = "website/order-card"
MAX_PRODUCT_IMAGES = 12


def _order_card_products():
    return OrderCardProduct.objects.prefetch_related("images", "feature_items", "offers", "timeline_stages")


def _sync_primary_image(product):
    """Exactly one gallery image is primary (the first, if none is chosen),
    and product.image_url mirrors it for everything that shows one picture."""
    images = list(product.images.order_by("display_order", "id"))
    primary = next((img for img in images if img.is_primary), images[0] if images else None)
    for img in images:
        should_be = img is primary
        if img.is_primary != should_be:
            img.is_primary = should_be
            img.save(update_fields=["is_primary"])
    url = primary.image_url if primary else ""
    if product.image_url != url:
        product.image_url = url
        product.save(update_fields=["image_url"])


def _product_response(product, message):
    product = _order_card_products().get(pk=product.pk)
    return success(OrderCardProductSerializer(product).data, message=message)


class OrderCardProductAdminListView(AdminListCreateAPIView):
    model = OrderCardProduct
    serializer_class = OrderCardProductSerializer

    def get_queryset(self):
        return _order_card_products()


class OrderCardProductAdminDetailView(AdminDetailAPIView):
    model = OrderCardProduct
    serializer_class = OrderCardProductSerializer

    def delete(self, request, pk):
        product = self.get_object(pk)
        if product is None:
            return error("Not found.", status=404)
        public_ids = [img.image_public_id for img in product.images.all()]
        public_ids += [product.image_public_id, product.customisation_image_public_id]
        product.delete()
        # Only after the row is gone — same ordering as AdminDetailAPIView.
        for public_id in filter(None, public_ids):
            delete_image(public_id)
        return success(None, message="Deleted.")


class OrderCardProductAdminReorderView(AdminReorderAPIView):
    model = OrderCardProduct


class OrderCardProductImagesAdminView(APIView):
    """POST multipart {image, alt_text?, is_primary?} — adds a gallery image
    (uploaded to Cloudinary first; nothing is saved if that fails)."""

    permission_classes = [IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        product = OrderCardProduct.objects.filter(pk=pk).first()
        if product is None:
            return error("Not found.", status=404)
        file_obj = request.FILES.get("image")
        if not file_obj:
            return error("No image file provided.", status=400)
        if product.images.count() >= MAX_PRODUCT_IMAGES:
            return error(f"A product can have at most {MAX_PRODUCT_IMAGES} images.", status=400)
        uploaded = upload_image(file_obj, folder=ORDER_CARD_IMAGE_FOLDER, request=request)
        last = product.images.order_by("-display_order").first()
        make_primary = str(request.data.get("is_primary", "")).lower() in {"1", "true", "yes"}
        with transaction.atomic():
            if make_primary:
                product.images.update(is_primary=False)
            product.images.create(
                image_url=uploaded["url"],
                image_public_id=uploaded["public_id"],
                alt_text=(request.data.get("alt_text") or "")[:200],
                is_primary=make_primary,
                display_order=(last.display_order + 1) if last else 0,
            )
            _sync_primary_image(product)
        return _product_response(product, "Image uploaded.")


class OrderCardProductImagesReorderAdminView(APIView):
    """PATCH {"order": [image ids]} — must list every image of the product."""

    permission_classes = [IsAdminRole]

    def patch(self, request, pk):
        product = OrderCardProduct.objects.filter(pk=pk).first()
        if product is None:
            return error("Not found.", status=404)
        order = request.data.get("order")
        try:
            ids = [int(v) for v in order]
        except (TypeError, ValueError):
            return error("`order` must be a list of image ids.", status=400)
        images = {img.pk: img for img in product.images.all()}
        if sorted(ids) != sorted(images):
            return error("`order` must list each of this product's images exactly once.", status=400)
        for index, image_id in enumerate(ids):
            images[image_id].display_order = index
        OrderCardProductImage.objects.bulk_update(images.values(), ["display_order"])
        _sync_primary_image(product)
        return _product_response(product, "Image order updated.")


class OrderCardProductImageAdminDetailView(APIView):
    """PATCH {is_primary?, alt_text?} / POST multipart {image} (replace the
    file, keeping its place) / DELETE — one gallery image."""

    permission_classes = [IsAdminRole]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def _get(self, pk, image_id):
        return OrderCardProductImage.objects.filter(pk=image_id, product_id=pk).select_related("product").first()

    def patch(self, request, pk, image_id):
        image = self._get(pk, image_id)
        if image is None:
            return error("Not found.", status=404)
        with transaction.atomic():
            if "alt_text" in request.data:
                image.alt_text = (request.data.get("alt_text") or "")[:200]
                image.save(update_fields=["alt_text"])
            if request.data.get("is_primary") in (True, "true", "1"):
                image.product.images.exclude(pk=image.pk).update(is_primary=False)
                image.is_primary = True
                image.save(update_fields=["is_primary"])
            _sync_primary_image(image.product)
        return _product_response(image.product, "Image updated.")

    def post(self, request, pk, image_id):
        image = self._get(pk, image_id)
        if image is None:
            return error("Not found.", status=404)
        file_obj = request.FILES.get("image")
        if not file_obj:
            return error("No image file provided.", status=400)
        old_public_id = image.image_public_id
        uploaded = upload_image(file_obj, folder=ORDER_CARD_IMAGE_FOLDER, request=request)
        image.image_url = uploaded["url"]
        image.image_public_id = uploaded["public_id"]
        image.save(update_fields=["image_url", "image_public_id"])
        _sync_primary_image(image.product)
        # Only once the new file is saved.
        delete_image(old_public_id)
        return _product_response(image.product, "Image replaced.")

    def delete(self, request, pk, image_id):
        image = self._get(pk, image_id)
        if image is None:
            return error("Not found.", status=404)
        product, public_id = image.product, image.image_public_id
        image.delete()
        _sync_primary_image(product)
        delete_image(public_id)
        return _product_response(product, "Image removed.")


class OrderCardProductCustomisationImageAdminView(AdminImageUploadAPIView):
    """Optional illustration in the product's customisation section."""

    model = OrderCardProduct
    serializer_class = OrderCardProductSerializer
    url_field = "customisation_image_url"
    public_id_field = "customisation_image_public_id"
    folder = ORDER_CARD_IMAGE_FOLDER


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
# Shared: Values, Features, How It Works, FAQs, Companies, Stats
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
