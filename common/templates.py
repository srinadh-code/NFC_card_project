"""
Profile template registry — the backend's mirror of the frontend's
PROFILE_THEMES / CARD_THEME_IDS (src/data/constants.ts). Kept here in
`common` (no models, no app dependencies) so both `profiles` (owns the
selected-template field) and `orders` (owns plan resolution) can import it
without a circular dependency between those two apps.

Plan tier is derived from `orders.OrderItem.card_type`, which already reuses
NfcCard.CardType (CLASSIC/PREMIUM/CUSTOM) as the tier signal — the frontend's
NEXORA_CARD_TYPES intentionally maps each of its 3 sellable tiers onto this
same enum so a purchase flows through the existing order pipeline unchanged.
WOODEN predates the NEXORA tiers and isn't sold as a tiered plan, so it falls
back to the base (Classic) entitlement rather than unlocking anything.
"""

# Plan id -> template ids included with that plan. Disjoint sets (an id
# never appears under more than one plan) — 1 + 3 + 5 = 9 templates total.
PLAN_TEMPLATES = {
    "classic": ["classic"],
    "premium": ["signature", "creative", "executive"],
    "custom": ["luxury", "future", "nature", "glass", "impact"],
}

ALL_TEMPLATE_IDS = [tid for ids in PLAN_TEMPLATES.values() for tid in ids]
TEMPLATE_CHOICES = [(tid, tid) for tid in ALL_TEMPLATE_IDS]

DEFAULT_PLAN = "classic"
DEFAULT_TEMPLATE = "classic"

# Higher rank = more templates included; used to pick the best plan when a
# customer's paid orders span more than one tier.
PLAN_RANK = {"classic": 0, "premium": 1, "custom": 2}

# NfcCard.CardType value -> plan id.
CARD_TYPE_TO_PLAN = {
    "CLASSIC": "classic",
    "PREMIUM": "premium",
    "CUSTOM": "custom",
    "WOODEN": "classic",
}


def templates_for_plan(plan):
    return PLAN_TEMPLATES.get(plan, PLAN_TEMPLATES[DEFAULT_PLAN])
