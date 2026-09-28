from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from common.image_storage import delete_image

from .models import Testimonial


@receiver(post_delete, sender=Testimonial)
def delete_testimonial_image(sender, instance, **kwargs):
    """Clean up the Cloudinary asset whenever a testimonial row goes away —
    customer delete, admin delete, or a cascade from the user being removed
    (cascades never call Model.delete(), but they do send post_delete).
    Deferred to on_commit so a rolled-back delete never destroys an image a
    surviving row still points at."""
    public_id = instance.profile_image_public_id
    if public_id:
        transaction.on_commit(lambda: delete_image(public_id))
