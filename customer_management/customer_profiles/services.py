from profiles.models import Profile


def get_or_create_profile(user):
    return Profile.ensure_for_user(user)


def update_profile(profile, serializer_data_provider):
    """Runs the given (already-validated) serializer's save and returns the instance."""
    return serializer_data_provider.save()


def set_profile_image(profile, file):
    profile.avatar = file
    profile.save(update_fields=["avatar", "updated_at"])
    return profile


def set_cover_image(profile, file):
    profile.cover_image = file
    profile.save(update_fields=["cover_image", "updated_at"])
    return profile
