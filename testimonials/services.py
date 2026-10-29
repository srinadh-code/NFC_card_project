from rest_framework.exceptions import ValidationError

from common.image_storage import upload_image
from orders.models import Order

CLOUDINARY_FOLDER = "testimonials"

# Narrower than common.image_storage.ALLOWED_CONTENT_TYPES on purpose: that
# set includes SVG/ICO for admin branding uploads, but customer-supplied SVG
# can carry script, so customer photos are raster-only.
CUSTOMER_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

NOT_ELIGIBLE_MESSAGE = "Only customers who purchased an NFC card can submit testimonials."


def paid_orders(user):
    return Order.objects.filter(customer=user, payment_status=Order.PaymentStatus.PAID)


def has_purchased_card(user):
    """A customer is eligible once they have at least one successfully paid
    order — the same payment_status=PAID bar orders/services.py already uses
    for "has this customer really bought something"."""
    return paid_orders(user).exists()


def upload_testimonial_image(file_obj):
    """Validates and uploads a customer's testimonial photo. Returns
    {"url", "public_id"}; raises ValidationError (-> 400) on any failure,
    before anything touches the database."""
    if getattr(file_obj, "content_type", None) not in CUSTOMER_IMAGE_TYPES:
        raise ValidationError({"profile_image": ["Unsupported image type. Use JPEG, PNG or WEBP."]})
    try:
        return upload_image(file_obj, folder=CLOUDINARY_FOLDER)
    except ValidationError as exc:
        # Re-key common.image_storage's {"image": [...]} to this API's field name.
        detail = exc.detail.get("image") if isinstance(exc.detail, dict) else exc.detail
        raise ValidationError({"profile_image": detail})
