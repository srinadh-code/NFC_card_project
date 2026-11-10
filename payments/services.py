import logging
import re
import time
import uuid
from decimal import Decimal
from types import SimpleNamespace

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, OperationalError, connection, transaction
from django.db.models.functions import Lower
from django.utils import timezone

from accounts import onboarding
from accounts.models import CustomerOnboarding, User
from common.discounts import calculate_first_order_discount, get_catalog_product
from customer_management.customer_addresses import pincode as pincode_service
from customer_management.customer_addresses.models import CustomerAddress
from customer_management.customer_cart.services import clear_cart, get_or_create_cart
from orders.models import (
    Order,
    OrderItem,
    OrderRecipient,
    RecipientEmailAllocation,
    RecipientEmailReservation,
    Transaction,
)
from orders.pricing import ProductUnavailable, price_lines
from orders.services import compose_shipping_snapshot

from . import razorpay, verification
from .models import CheckoutSession, CheckoutVerification

logger = logging.getLogger("payments")

MAX_LINE_QUANTITY = 10
RECIPIENT_EMAIL_AVAILABLE_MESSAGE = "Email available for NFC card allocation."
RECIPIENT_EMAIL_ALLOCATED_MESSAGE = "This email is already assigned to another NFC card. Please enter a different email."
RECIPIENT_EMAIL_INVALID_MESSAGE = "Please enter a valid email address."
RECIPIENT_PHONE_INVALID_MESSAGE = "Enter a valid Indian mobile number with or without +91."
# Recipient mobile: 9876543210, 919876543210 or +919876543210, where the
# 10-digit number starts with 6-9. ASCII digits only ([0-9], not \d, which
# also matches non-ASCII digits). Mirrors INDIAN_MOBILE_RE in
# frontend/src/lib/checkout-recipients.ts — keep the two in sync.
RECIPIENT_MOBILE_RE = re.compile(r"(?:\+91|91)?([6-9][0-9]{9})")


def normalize_recipient_mobile(value):
    """Return the bare 10-digit mobile number for an accepted recipient
    phone (optional +91/91 prefix removed), or None when it is invalid."""
    if not isinstance(value, str):
        return None
    match = RECIPIENT_MOBILE_RE.fullmatch(value.strip())
    return match.group(1) if match else None


ADDRESS_FIELDS = (
    "address_line1",
    "address_line2",
    "landmark",
    "locality",
    "city",
    "district",
    "state",
    "pincode",
    "country",
)


class CheckoutError(Exception):
    """A checkout request that can't proceed — message is safe to show."""

    def __init__(self, message, *, errors=None, status=400):
        super().__init__(message)
        self.message = message
        self.errors = errors or {}
        self.status = status


def guest_lines(items):
    """Turns a guest's [{product_id, qty}] into priceable lines using only
    the catalogue — names, card types and prices never come from the client."""
    if not isinstance(items, list) or not items:
        raise CheckoutError("Your cart is empty.")
    lines = []
    for raw in items:
        if not isinstance(raw, dict):
            raise CheckoutError("Each cart item must be an object.")
        product_id = str(raw.get("product_id", "")).strip()
        raw_qty = raw.get("qty", 0)
        qty = int(raw_qty) if type(raw_qty) is int or (isinstance(raw_qty, str) and re.fullmatch(r"[0-9]+", raw_qty)) else 0
        if qty < 1 or qty > MAX_LINE_QUANTITY:
            raise CheckoutError(f"Quantity must be between 1 and {MAX_LINE_QUANTITY}.")
        product = get_catalog_product(None, product_id) if product_id else None
        if product is None:
            raise CheckoutError("One of the products in your cart is no longer available. Please update your cart.")
        lines.append(
            SimpleNamespace(
                product_id=product_id.upper(),
                name=product.name,
                card_type=product.card_type,
                color_name=product.color_name,
                qty=qty,
                price=product.price,
            )
        )
    return lines


def serialize_priced_lines(priced_items):
    def money(value):
        return None if value is None else str(value)

    return [
        {
            "product_id": p["item"].product_id,
            "name": p["item"].name,
            "card_type": p["item"].card_type,
            "color": p["item"].color_name,
            "qty": p["item"].qty,
            "unit_price": money(p["unit_price"]),
            "original_price": money(p["original_price"]),
            "discount_type": p["discount_type"],
            "discount_value": money(p["discount_value"]),
            "discount_amount": money(p["discount_amount"]),
            "promo_code_used": p["promo_code_used"],
            "applied_offer_id": p["applied_offer"].pk if p["applied_offer"] else None,
            "pricing_tier": p["pricing_tier"],
        }
        for p in priced_items
    ]


def _verify_address(address):
    try:
        result = pincode_service.verify_address(
            locality=address.locality,
            city=address.city,
            district=address.district,
            state=address.state,
            pincode=address.pincode,
        )
    except pincode_service.PincodeServiceUnavailable:
        raise CheckoutError(pincode_service.UNAVAILABLE_MESSAGE, status=503)
    if result.errors:
        raise CheckoutError(
            "Your delivery address could not be verified. Please check the PIN code and address.",
            errors=result.errors,
        )


def normalize_recipient_email(value):
    return (value or "").strip().lower()


def is_recipient_email_available(email, buyer_email="", *, checkout_session_id=None):
    normalized_email = normalize_recipient_email(email)
    buyer_email = normalize_recipient_email(buyer_email)
    allocation = RecipientEmailAllocation.objects.filter(normalized_email=normalized_email).first()
    if allocation is not None:
        if not (
            checkout_session_id
            and buyer_email
            and allocation.owner_email == buyer_email
            and not allocation.recipients.exists()
            and allocation.reservations.filter(checkout_session_id=checkout_session_id).exists()
            and not allocation.reservations.exclude(checkout_session_id=checkout_session_id).exists()
        ):
            return False
        return not _recipient_email_has_assigned_card(normalized_email)
    if _recipient_email_has_assigned_card(normalized_email):
        return False
    return True


def _recipient_email_has_assigned_card(normalized_email):
    if User.objects.annotate(normalized_email=Lower("email")).filter(
        normalized_email=normalized_email,
        role=User.Role.ADMIN,
    ).exists():
        return True
    if OrderRecipient.objects.annotate(normalized_email=Lower("email")).filter(
        normalized_email=normalized_email,
        assigned_card__isnull=False,
    ).exists():
        return True
    return User.objects.annotate(normalized_email=Lower("email")).filter(
        normalized_email=normalized_email,
        nfc_cards__status__in=("ACTIVE", "ASSIGNED", "INACTIVE", "BLOCKED", "LOST"),
    ).exists()


def _recipient_email_conflict(index, email):
    detail = f"{RECIPIENT_EMAIL_ALLOCATED_MESSAGE} Recipient: {email}."
    return CheckoutError(
        RECIPIENT_EMAIL_ALLOCATED_MESSAGE,
        errors={"recipients": {str(index): {"email": [detail]}}},
    )


def _is_sqlite_lock_error(exc):
    return connection.vendor == "sqlite" and "locked" in str(exc).lower()


def claim_recipient_email(email, buyer_email, *, index=0):
    normalized_email = normalize_recipient_email(email)
    try:
        with transaction.atomic():
            return RecipientEmailAllocation.objects.create(
                normalized_email=normalized_email,
                owner_email=normalize_recipient_email(buyer_email),
            )
    except IntegrityError:
        raise _recipient_email_conflict(index, normalized_email)


def reserve_recipient_emails(checkout_session_id, recipients, buyer_email):
    normalized_buyer_email = normalize_recipient_email(buyer_email)
    for attempt in range(5):
        try:
            with transaction.atomic():
                for index, recipient in enumerate(recipients):
                    normalized_email = normalize_recipient_email(recipient["email"])
                    allocation = claim_recipient_email(normalized_email, normalized_buyer_email, index=index)
                    RecipientEmailReservation.objects.create(
                        allocation=allocation,
                        checkout_session_id=checkout_session_id,
                    )
            return
        except CheckoutError:
            raise
        except IntegrityError:
            raise CheckoutError(
                RECIPIENT_EMAIL_ALLOCATED_MESSAGE,
                errors={"recipients": [RECIPIENT_EMAIL_ALLOCATED_MESSAGE]},
            )
        except OperationalError as exc:
            if not _is_sqlite_lock_error(exc) or connection.in_atomic_block or attempt == 4:
                raise
            time.sleep(0.05 * (attempt + 1))


def release_checkout_reservations(session):
    with transaction.atomic():
        RecipientEmailReservation.objects.filter(checkout_session_id=session.public_id).delete()
        RecipientEmailAllocation.objects.filter(
            recipients__isnull=True,
            reservations__isnull=True,
        ).delete()


def fail_checkout_session(session):
    with transaction.atomic():
        locked_session = CheckoutSession.objects.select_for_update().get(pk=session.pk)
        if locked_session.status == CheckoutSession.Status.CREATED:
            locked_session.status = CheckoutSession.Status.FAILED
            locked_session.save(update_fields=["status", "updated_at"])
        release_checkout_reservations(locked_session)


def validate_recipients(raw_recipients, total_quantity, buyer_email="", *, checkout_session_id=None, indian_mobile=True):
    """Validate one distinct, available email allocation for every card.

    ``indian_mobile`` (the default for every new checkout/order) requires each
    recipient phone to be an Indian mobile number and stores it as the bare
    10 digits. ``_fulfill`` passes False when re-checking a session that was
    already validated and paid for, so sessions created before this rule
    existed are not stranded after payment.
    """
    if type(total_quantity) is not int or not 1 <= total_quantity <= MAX_LINE_QUANTITY:
        raise CheckoutError("Choose between 1 and 10 cards.", errors={"quantity": ["Must be an integer from 1 to 10."]})
    if not isinstance(raw_recipients, list) or len(raw_recipients) != total_quantity:
        raise CheckoutError(
            "Enter recipient details for every card.",
            errors={"recipients": [f"Exactly {total_quantity} recipient entries are required."]},
        )
    cleaned = []
    for index, raw in enumerate(raw_recipients, start=1):
        if not isinstance(raw, dict):
            raise CheckoutError("Recipient details are invalid.", errors={"recipients": [f"Recipient {index} is invalid."]})
        name = raw.get("full_name", "")
        email = raw.get("email", "")
        phone = raw.get("phone", "")
        name = name.strip() if isinstance(name, str) else ""
        email = normalize_recipient_email(email) if isinstance(email, str) else ""
        phone = phone.strip() if isinstance(phone, str) else ""
        errors = {}
        if not name or len(name) > 150 or not any(c.isalpha() for c in name) or any(ord(c) < 32 or ord(c) == 127 for c in name):
            errors["full_name"] = ["Enter a full name of at most 150 characters."]
        try:
            validate_email(email)
            if len(email) > 254:
                raise ValidationError("Email too long")
        except ValidationError:
            errors["email"] = ["Enter a valid email address."]
        if indian_mobile:
            normalized_phone = normalize_recipient_mobile(phone)
            if normalized_phone is None:
                errors["phone"] = [RECIPIENT_PHONE_INVALID_MESSAGE]
        else:
            digits = re.sub(r"\D", "", phone)
            if not re.fullmatch(r"\+?[0-9 ().-]+", phone) or not 7 <= len(digits) <= 15 or len(phone) > 20:
                errors["phone"] = ["Enter a phone number with 7 to 15 digits; a country code is allowed."]
            normalized_phone = ("+" if phone.startswith("+") else "") + digits
        if errors:
            raise CheckoutError(f"Please check recipient {index}.", errors={"recipients": {str(index - 1): errors}})
        cleaned.append({"full_name": name, "email": email, "phone": normalized_phone})
    seen_emails = set()
    for index, recipient in enumerate(cleaned):
        if recipient["email"] in seen_emails:
            raise CheckoutError(
                "Use a different email address for each NFC card.",
                errors={"recipients": {str(index): {"email": ["Recipient emails must be unique within checkout."]}}},
            )
        seen_emails.add(recipient["email"])
        if not is_recipient_email_available(
            recipient["email"],
            buyer_email,
            checkout_session_id=checkout_session_id,
        ):
            raise _recipient_email_conflict(index, recipient["email"])
    if User.objects.filter(role=User.Role.ADMIN).annotate(normalized_email=Lower("email")).filter(normalized_email__in=[r["email"] for r in cleaned]).exists():
        raise CheckoutError("An administrator account cannot be used as a card recipient. Please use a customer email.", errors={"recipients": ["Use customer email addresses for recipients."]})
    return cleaned


def validate_purchaser_contact(raw, *, default_name="", default_phone=""):
    """Validate contact snapshots without accepting a client-controlled identity.

    Older authenticated clients omit the object; preserve their established
    account/address fallback. New checkout forms send both required fields.
    """
    if raw is None:
        return {"full_name": default_name, "phone": default_phone}
    if not isinstance(raw, dict):
        raise CheckoutError("Please check your purchaser details.", errors={"purchaser_contact": ["Enter a name and phone number."]})
    name, phone = raw.get("full_name"), raw.get("phone")
    name = name.strip() if isinstance(name, str) else ""
    phone = phone.strip() if isinstance(phone, str) else ""
    digits = re.sub(r"\D", "", phone)
    errors = {}
    if not name or len(name) > 150 or not any(c.isalpha() for c in name) or any(ord(c) < 32 or ord(c) == 127 for c in name):
        errors["full_name"] = ["Enter your full name (up to 150 characters)."]
    if not re.fullmatch(r"\+?[0-9 ().-]+", phone) or not 7 <= len(digits) <= 15 or len(phone) > 20:
        errors["phone"] = ["Enter your phone number with 7 to 15 digits; a country code is allowed."]
    if errors:
        raise CheckoutError("Please check your purchaser details.", errors={"purchaser_contact": errors})
    return {"full_name": name, "phone": ("+" if phone.startswith("+") else "") + digits}


def create_checkout_session(
    *,
    customer=None,
    contact=None,
    purchaser_contact=None,
    address=None,
    address_id=None,
    items=None,
    recipients=None,
    email_token=None,
    phone_token=None,
    session_ref="",
    provider=CheckoutSession.Provider.RAZORPAY,
):
    """Prices the checkout server-side, stores it as a CheckoutSession and
    opens the matching Razorpay order. Returns the session.

    Signed-in customer: their own server-side cart and one of their saved
    addresses (`address_id`). Guest: `contact` (full_name/email/phone),
    `address` (address fields), `items` ([{product_id, qty}]) and the
    verification token proving the email was OTP-verified (`email_token`;
    `phone_token` too when the mobile number was verified).

    `provider` DUMMY skips Razorpay entirely: the session is then paid with
    confirm_dummy_payment(). Only allowed when DUMMY_PAYMENTS_ENABLED."""
    if provider == CheckoutSession.Provider.DUMMY:
        if not dummy_payments_enabled():
            raise CheckoutError("Test payments aren't available here.", errors={"code": "dummy_payments_disabled"}, status=403)
    elif not razorpay.is_configured():
        raise CheckoutError("Online payment isn't available right now.", errors={"code": "payments_unavailable"}, status=503)

    promo_code = ""
    total_quantity = 0
    if customer is not None:
        if address_id is None:
            raise CheckoutError("Please choose a delivery address.", errors={"address_id": ["Required."]})
        saved = CustomerAddress.objects.filter(pk=address_id, customer=customer).first()
        if saved is None:
            raise CheckoutError("Please choose a delivery address.", errors={"address_id": ["Not found."]})
        try:
            address_errors = pincode_service.verify_saved_address(saved).errors
        except pincode_service.PincodeServiceUnavailable:
            raise CheckoutError(pincode_service.UNAVAILABLE_MESSAGE, status=503)
        if address_errors:
            raise CheckoutError(
                "Your delivery address could not be verified. Please update the PIN code or address and try again.",
                errors={"address_id": list(address_errors.values()), **address_errors},
            )
        address_values = {f: getattr(saved, f) for f in ADDRESS_FIELDS}
        address_values.update(latitude=saved.latitude, longitude=saved.longitude)
        cart = get_or_create_cart(customer)
        lines = list(cart.items.all())
        if not lines:
            raise CheckoutError("Your cart is empty.")
        total_quantity = sum(int((item.qty or 0)) for item in lines)
        promo_code = cart.promo_code or ""
        selected_offer_id = cart.applied_offer_id
        contact_values = {
            "email": customer.email,
            **validate_purchaser_contact(purchaser_contact, default_name=customer.full_name or saved.full_name, default_phone=customer.phone or saved.phone),
        }
        pricing_customer, assume_new = customer, False
        verified = {"email_verified": True, "phone_verified": False}
    else:
        # The email is the future login and gets the credentials, so it must
        # be OTP-verified; a mobile token, when sent, must match the phone.
        if not verification.check_token(CheckoutVerification.Channel.EMAIL, contact["email"], email_token, session_ref):
            raise CheckoutError(
                "Please verify your email address with the code we send you.",
                errors={"code": "verification_required", "email": ["Not verified."]},
            )
        phone_verified = False
        if phone_token:
            if not verification.check_token(CheckoutVerification.Channel.SMS, contact["phone"], phone_token, session_ref):
                raise CheckoutError(
                    "Please verify your mobile number again.",
                    errors={"code": "verification_required", "phone": ["Not verified."]},
                )
            phone_verified = True
        verified = {"email_verified": True, "phone_verified": phone_verified}
        address_values = {f: (address or {}).get(f, "") for f in ADDRESS_FIELDS}
        address_values.update(latitude=(address or {}).get("latitude"), longitude=(address or {}).get("longitude"))
        _verify_address(SimpleNamespace(**address_values))
        lines = guest_lines(items)
        total_quantity = sum(int((line.qty or 0)) for line in lines)
        selected_offer_id = None
        contact_values = {
            "email": onboarding.normalize_email(contact["email"]),
            "full_name": contact["full_name"].strip(),
            "phone": contact["phone"].strip(),
        }
        # Priced for the account this email already has, if any; a brand-new
        # buyer has never ordered, so the first-order discount applies.
        pricing_customer = onboarding.find_customer_by_email(contact_values["email"])
        if pricing_customer is not None and pricing_customer.role != User.Role.CUSTOMER:
            raise CheckoutError("Please use a customer email address for this purchase.", errors={"contact": {"email": ["Administrator accounts cannot use customer checkout."]}})
        assume_new = pricing_customer is None

    delivery_phone = saved.phone if customer is not None else (address or {}).get("phone", contact_values["phone"])
    if not isinstance(delivery_phone, str) or not re.fullmatch(r"\+?[0-9 ().-]{7,20}", delivery_phone.strip()) or not 7 <= len(re.sub(r"\D", "", delivery_phone)) <= 15:
        raise CheckoutError("A valid delivery phone number is required.", errors={"address": {"phone": ["Enter a phone number with 7 to 15 digits."]}})
    validated_recipients = validate_recipients(recipients, total_quantity, contact_values["email"])

    try:
        priced_items, subtotal = price_lines(
            lines, customer=pricing_customer, promo_code=promo_code or None, selected_offer_id=selected_offer_id
        )
    except ProductUnavailable as exc:
        raise CheckoutError(f"{exc.name} is no longer available. Please remove it from your cart to continue.")
    first_order = calculate_first_order_discount(subtotal, pricing_customer, assume_eligible=assume_new)

    session_values = {
        "provider": provider,
        "customer": customer,
        **contact_values,
        **verified,
        **address_values,
        "lines": serialize_priced_lines(priced_items),
        "recipients": validated_recipients,
        "delivery_phone": delivery_phone.strip(),
        "promo_code": promo_code,
        "subtotal": subtotal,
        "first_order_discount_percentage": first_order["percentage"],
        "first_order_discount_amount": first_order["discount_amount"] if first_order["is_first_order"] else None,
        "amount": first_order["final_amount"],
        "shipping": Decimal("0"),
    }
    for attempt in range(5):
        try:
            with transaction.atomic():
                session = CheckoutSession.objects.create(**session_values)
                reserve_recipient_emails(session.public_id, validated_recipients, contact_values["email"])
            break
        except OperationalError as exc:
            if not _is_sqlite_lock_error(exc) or attempt == 4:
                raise
            time.sleep(0.05 * (attempt + 1))
    if provider == CheckoutSession.Provider.DUMMY:
        return session
    try:
        rp_order = razorpay.create_order(
            session.amount_paise, receipt=str(session.public_id), notes={"checkout": str(session.public_id)}
        )
    except razorpay.RazorpayNotConfigured:
        fail_checkout_session(session)
        raise CheckoutError("Online payment isn't available right now.", errors={"code": "payments_unavailable"}, status=503)
    except razorpay.RazorpayError:
        fail_checkout_session(session)
        raise CheckoutError("We couldn't start the payment. Please try again in a moment.", status=502)
    session.razorpay_order_id = rp_order["id"]
    session.save(update_fields=["razorpay_order_id"])
    return session


def dummy_payments_enabled():
    """Temporary test payments — see settings.DUMMY_PAYMENTS_ENABLED."""
    return bool(getattr(settings, "DUMMY_PAYMENTS_ENABLED", False))


def _provision_user(session):
    """(user, account_created). Safe against two payments for the same new
    email landing at once — the loser of the unique-email race just uses
    the account the winner created."""
    if session.customer_id:
        return session.customer, False
    try:
        with transaction.atomic():
            return onboarding.provision_customer(email=session.email, full_name=session.full_name, phone=session.phone, create_profile=False, email_verified=True)
    except IntegrityError:
        return onboarding.find_customer_by_email(session.email), False


PAYMENT_METHOD_FOR_PROVIDER = {
    CheckoutSession.Provider.RAZORPAY: Order.PaymentMethod.RAZORPAY,
    CheckoutSession.Provider.DUMMY: Order.PaymentMethod.DUMMY,
}


def _fulfill(session, *, via, payment_ref=None):
    """Turns a paid, row-locked CheckoutSession into the real order — exactly
    once (a FULFILLED session just returns). Must run inside the caller's
    transaction. The order starts as Pending with payment Paid; the customer
    account (new ones pending activation) is linked now, and activated when
    an admin moves the order to Processing (accounts/onboarding.py)."""
    if session.status == CheckoutSession.Status.FULFILLED:
        return False
    if session.status == CheckoutSession.Status.FAILED:
        raise CheckoutError("This checkout can no longer be paid. Please start again.", status=409)

    recipients = session.recipients or [{"full_name": session.full_name, "email": session.email, "phone": session.phone}]
    validated_recipients = validate_recipients(
        recipients,
        sum(int(line.get("qty", 0)) for line in session.lines),
        session.email,
        checkout_session_id=session.public_id,
        indian_mobile=False,
    )

    user, account_created = _provision_user(session)
    method = PAYMENT_METHOD_FOR_PROVIDER[session.provider]

    order = Order(
        customer=user,
        purchaser_name=session.full_name,
        purchaser_email=session.email,
        purchaser_phone=session.phone,
        delivery_phone=session.delivery_phone or session.phone,
        amount=session.amount,
        first_order_discount_percentage=session.first_order_discount_percentage,
        first_order_discount_amount=session.first_order_discount_amount,
        shipping=session.shipping,
        payment_method=method,
        payment_status=Order.PaymentStatus.PAID,
        **compose_shipping_snapshot(session),
    )
    order.save()
    OrderItem.objects.bulk_create(
        [
            OrderItem(
                order=order,
                product_id=line["product_id"],
                name=line["name"],
                card_type=line["card_type"],
                color=line["color"],
                qty=line["qty"],
                pricing_tier=line["pricing_tier"],
                price=Decimal(line["unit_price"]),
                original_price=Decimal(line["original_price"]) if line["original_price"] else None,
                discount_type=line["discount_type"],
                discount_value=Decimal(line["discount_value"]) if line["discount_value"] else None,
                discount_amount=Decimal(line["discount_amount"]) if line["discount_amount"] else None,
                promo_code_used=line["promo_code_used"],
                applied_offer_id=line["applied_offer_id"],
            )
            for line in session.lines
        ]
    )
    recipient_rows = OrderRecipient.objects.bulk_create([
        OrderRecipient(order=order, name=recipient["full_name"], email=recipient["email"], phone=recipient["phone"])
        for recipient in validated_recipients
    ])
    for index, recipient in enumerate(recipient_rows):
        email = normalize_recipient_email(recipient.email)
        allocation = RecipientEmailAllocation.objects.select_for_update().filter(normalized_email=email).first()
        if allocation is None:
            allocation = claim_recipient_email(email, session.email, index=index)
            RecipientEmailReservation.objects.create(
                allocation=allocation,
                checkout_session_id=session.public_id,
            )
        elif not is_recipient_email_available(
            email,
            session.email,
            checkout_session_id=session.public_id,
        ):
            raise _recipient_email_conflict(index, email)
        recipient.email_allocation = allocation
        recipient.save(update_fields=["email_allocation", "updated_at"])
    RecipientEmailReservation.objects.filter(checkout_session_id=session.public_id).delete()
    onboarding.ensure_recipient_accounts(order)
    Transaction.objects.create(order=order, amount=session.total, method=method, status=Order.PaymentStatus.PAID)

    if account_created:
        CustomerAddress.objects.create(
            customer=user,
            label="Home",
            full_name=session.full_name,
            phone=session.delivery_phone or session.phone,
            is_default=True,
            latitude=session.latitude,
            longitude=session.longitude,
            **{f: getattr(session, f) for f in ADDRESS_FIELDS},
        )
        CustomerOnboarding.objects.filter(user=user, source_order__isnull=True).update(source_order=order)
    if session.customer_id:
        clear_cart(session.customer)

    session.status = CheckoutSession.Status.FULFILLED
    session.order = order
    session.razorpay_payment_id = payment_ref
    session.fulfilled_via = via
    session.paid_at = timezone.now()
    session.save(update_fields=["status", "order", "razorpay_payment_id", "fulfilled_via", "paid_at"])
    logger.info(
        "payments.fulfilled session=%s order=%s via=%s provider=%s new_account=%s",
        session.public_id, order.pk, via, session.provider, account_created,
    )
    return account_created


def fulfill_checkout(razorpay_order_id, razorpay_payment_id, *, via):
    """Razorpay: called by both the verify endpoint and the webhook; the row
    lock and the status check make retries/duplicates a no-op that returns
    the existing order. Returns (session, account_created)."""
    with transaction.atomic():
        session = CheckoutSession.objects.select_for_update().filter(razorpay_order_id=razorpay_order_id).first()
        if session is None:
            raise CheckoutError("Unknown payment.", status=404)
        account_created = _fulfill(session, via=via, payment_ref=razorpay_payment_id)
    return session, account_created


def confirm_dummy_payment(checkout_id, *, amount_paise=None):
    """Temporary test payment for a DUMMY CheckoutSession. Re-checks that test
    payments are enabled and, when `amount_paise` is sent, that it equals the
    server-priced amount. Confirming the same checkout again (double click,
    refresh) returns the order already created. Returns (session,
    account_created)."""
    if not dummy_payments_enabled():
        raise CheckoutError("Test payments aren't available here.", errors={"code": "dummy_payments_disabled"}, status=403)
    try:
        checkout_uuid = uuid.UUID(str(checkout_id))
    except ValueError:
        raise CheckoutError("This checkout wasn't found. Please start again.", status=404)
    with transaction.atomic():
        session = (
            CheckoutSession.objects.select_for_update()
            .filter(public_id=checkout_uuid, provider=CheckoutSession.Provider.DUMMY)
            .first()
        )
        if session is None:
            raise CheckoutError("This checkout wasn't found. Please start again.", status=404)
        if session.status == CheckoutSession.Status.FAILED:
            raise CheckoutError("This checkout can no longer be paid. Please start again.", status=409)
        if amount_paise is not None and int(amount_paise) != session.amount_paise:
            raise CheckoutError("The order amount changed. Please review your order and try again.", errors={"code": "amount_mismatch"}, status=409)
        account_created = _fulfill(session, via="dummy", payment_ref=f"TEST-{session.public_id.hex[:20].upper()}")
    return session, account_created


def mark_failed(razorpay_order_id):
    with transaction.atomic():
        session = CheckoutSession.objects.select_for_update().filter(
            razorpay_order_id=razorpay_order_id,
            status=CheckoutSession.Status.CREATED,
        ).first()
        if session is None:
            return
        session.status = CheckoutSession.Status.FAILED
        session.save(update_fields=["status", "updated_at"])
        release_checkout_reservations(session)


def cancel_checkout_session(checkout_id):
    try:
        checkout_uuid = uuid.UUID(str(checkout_id))
    except (TypeError, ValueError):
        raise CheckoutError("This checkout wasn't found. Please start again.", status=404)

    with transaction.atomic():
        session = CheckoutSession.objects.select_for_update().filter(public_id=checkout_uuid).first()
        if session is None or session.status != CheckoutSession.Status.CREATED:
            return
        session.status = CheckoutSession.Status.FAILED
        session.save(update_fields=["status", "updated_at"])
        release_checkout_reservations(session)
