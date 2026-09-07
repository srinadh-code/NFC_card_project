from profiles.models import Profile, SocialLink


def get_social_links(user):
    profile = Profile.ensure_for_user(user)
    return profile.social_links.all()


def replace_social_links(user, items):
    """Upserts one SocialLink row per (profile, platform) pair from `items`."""
    profile = Profile.ensure_for_user(user)
    existing_by_platform = {link.platform: link for link in profile.social_links.all()}

    for index, item in enumerate(items):
        platform = item["platform"]
        link = existing_by_platform.get(platform)
        if link is None:
            link = SocialLink(profile=profile, platform=platform)

        link.url = item.get("url", "")
        link.enabled = item.get("enabled", True)
        link.display_order = item.get("display_order", index)
        link.save()

    return profile.social_links.all()
