"""
Profile template registry — the backend's mirror of the frontend's
PROFILE_THEMES / CARD_THEME_IDS (src/data/constants.ts). Kept here in
`common` (no models, no app dependencies) so both `profiles` (owns the
selected-template field) and `orders` (owns plan resolution) can import it
without a circular dependency between those two apps.

Plan tier is derived from `orders.OrderItem.card_type`. NEXORA Classic and
NEXORA Premium have since been retired (removed from NfcCard.CardType, and
existing rows referencing them deleted) — CUSTOM is the only sellable tier
left, so it's the only OrderItem.card_type value CARD_TYPE_TO_PLAN below can
actually see going forward. The "classic" and "premium" plan tiers (and
their template sets) are kept as-is regardless: "classic" is still the base
entitlement every customer without a paid order defaults to, and a customer
who already resolved to "premium" before the retirement keeps that plan
label for as long as evidence of that purchase exists. WOODEN predates the
NEXORA tiers and isn't sold as a tiered plan, so it falls back to the base
(Classic) entitlement rather than unlocking anything.

Template *selection* (which of the 9 registered ids a customer may actually
pick) is a separate, later product decision from plan *resolution* above:
every customer can now pick any of the 5 ids under CUSTOM_PLAN regardless of
which plan they resolve to — see orders.services.get_allowed_templates,
the only place CUSTOM_PLAN is used for that purpose. `resolve_customer_plan`
and PLAN_TEMPLATES/PLAN_RANK below are unchanged and still meaningful (e.g.
the profile API's informational `plan` field) — only what gates template
*selection* changed.
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
# The plan whose 5 templates every customer may select from, regardless of
# their own resolved plan — see the module docstring and
# orders.services.get_allowed_templates.
CUSTOM_PLAN = "custom"

# Higher rank = more templates included; used to pick the best plan when a
# customer's paid orders span more than one tier.
PLAN_RANK = {"classic": 0, "premium": 1, "custom": 2}

# NfcCard.CardType value -> plan id. CLASSIC/PREMIUM removed: those values
# can no longer occur (the enum no longer defines them, and no OrderItem row
# can carry them), so mapping them here would be dead code.
CARD_TYPE_TO_PLAN = {
    "CUSTOM": "custom",
    "WOODEN": "classic",
}


def templates_for_plan(plan):
    return PLAN_TEMPLATES.get(plan, PLAN_TEMPLATES[DEFAULT_PLAN])
