import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, PackageSearch } from "lucide-react"
import { toast } from "sonner"
import PageHeader from "@/components/marketing/PageHeader"
import ProfileThemeShowcase from "@/components/marketing/ProfileThemeShowcase"
import { ProductDetails } from "@/components/shop/ProductDetails"
import { ProductSelection } from "@/components/shop/ProductSelection"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, ordersApi, profileApi, CARD_TYPE_MAP } from "@/lib/api"
import { customerOrderKeys } from "@/lib/customer-order-queries"
import { publicWebsiteApi } from "@/lib/contentApi"
import { CARD_THEME_IDS, PROFILE_THEMES } from "@/data/constants"
import { useCart } from "@/hooks/useCart"
import { usePublicSettings } from "@/hooks/usePublicSettings"
import { useEnsuredProfile } from "@/hooks/use-ensured-profile"
import { useCheckoutVerificationStore } from "@/store/checkout-verification-store"
import { resolveIcon } from "@/lib/icon-map"
import { clampQty, unitPriceFor } from "@/lib/order-card-pricing"
import type { OrderCardProduct } from "@/types/content"

/** The Order Card page: a product selection screen, and each product's
 * details screen shown in place on the same page (no separate route). All
 * product content comes from Website Content → Order Card. */
export default function Shop() {
  const navigate = useNavigate()
  const { addLineAsync, clearCart } = useCart()
  const { settings } = usePublicSettings()
  const queryClient = useQueryClient()
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<"cart" | "buy" | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  // The "Choose Your Profile Theme" section, target of "View N Templates".
  const themesRef = useRef<HTMLElement>(null)

  function scrollTo(ref: React.RefObject<HTMLElement | null>) {
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" }))
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["content", "public-order-card"],
    queryFn: publicWebsiteApi.getOrderCard,
  })
  const products = data?.products ?? []
  const selected = products.find((p) => p.slug === selectedSlug) ?? null

  // A product unpublished while its details are open drops back to the list.
  useEffect(() => {
    if (selectedSlug && data && !selected) setSelectedSlug(null)
  }, [data, selected, selectedSlug])

  function openProduct(slug: string | null) {
    setSelectedSlug(slug)
    scrollTo(topRef)
  }

  // Only populated for a signed-in customer (the query is disabled without
  // one) — used purely to let a logged-in customer select their profile
  // template straight from this showcase, same as the picker in Customer
  // Dashboard → QR Code.
  const { customer, profile } = useEnsuredProfile()
  const beginBulkCheckout = useCheckoutVerificationStore((state) => state.beginBulkCheckout)
  // Same real-order check the Customer Dashboard → QR Code page uses to
  // gate template selection — shares its query key, so this is a cache hit
  // whenever that page (or My Card) was already visited this session.
  const ordersQuery = useQuery({
    queryKey: customerOrderKeys.page(customer?.id),
    queryFn: () => ordersApi.list(1),
    enabled: Boolean(customer),
  })
  const hasCustomCard = (ordersQuery.data?.items ?? []).some(
    (order) => order.status !== "CANCELLED" && order.items.some((item) => item.card_type === "CUSTOM"),
  )

  // Products with no profile-template entitlement (e.g. Google Review Card)
  // simply have no entry in CARD_THEME_IDS, so the theme section stays
  // hidden for them.
  const availableThemeIds = selected ? (CARD_THEME_IDS[selected.slug] ?? []) : []
  const availableThemes = PROFILE_THEMES.filter((t) => availableThemeIds.includes(t.id))
  // Admin-uploaded image override per template id (Website Content → Order
  // Card → Profile Templates) — falls back to the code-drawn mockup for any
  // id with no active override.
  const templateImagesById = Object.fromEntries(
    (data?.profile_templates ?? []).filter((t) => t.is_active && t.image_url).map((t) => [t.template_id, t.image_url]),
  )

  // Same API call, same cache key, and same success/error handling as the
  // Customer Dashboard → QR Code template picker (ProfileTemplatesSection).
  const selectTemplateMutation = useMutation({
    mutationFn: (templateId: string) => profileApi.updateSelectedTemplate(templateId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["profile-me"], updated)
      toast.success("Profile template updated.")
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update your template. Please try again.")
    },
  })

  async function addToCart(product: OrderCardProduct, rawQty: number, action: "cart" | "buy") {
    const qty = clampQty(rawQty)
    const isGuestBulkBuy = action === "buy" && !customer
    setPendingAction(action)
    try {
      if (isGuestBulkBuy) {
        beginBulkCheckout(qty)
        clearCart()
      }
      // The backend replaces name/type/price with the catalog's own values
      // and prices the line by quantity — `price` here is only the guest
      // cart's display value until then.
      await addLineAsync({
        productId: product.product_id,
        name: product.name,
        cardType: CARD_TYPE_MAP[product.card_type] ?? "Custom",
        color: { name: product.color_name || "Standard", hex: product.color_hex },
        qty,
        price: unitPriceFor(product, qty),
      })
      if (action === "buy") {
        if (isGuestBulkBuy) {
          navigate("/checkout/verify?redirect=%2Fcheckout")
        } else {
          navigate("/checkout")
        }
      }
      else toast.success(`${product.name} × ${qty} added to cart.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add this card to your cart. Please try again.")
    } finally {
      setPendingAction(null)
    }
  }

  if (isError) {
    return (
      <div className="px-4 py-24 text-center">
        <p className="text-muted-foreground">Couldn&apos;t load the cards right now. Please try again shortly.</p>
        <Button variant="outline" className="mt-4" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="" subtitle="" />
        <section className="bg-[#F8FAFC] px-4 py-16 dark:bg-transparent">
          <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-6 sm:grid-cols-2">
            <Skeleton className="h-96 w-full rounded-[24px]" />
            <Skeleton className="h-96 w-full rounded-[24px]" />
          </div>
        </section>
      </div>
    )
  }

  return (
    <div ref={topRef} className="scroll-mt-28">
      {!selected ? (
        <>
          <PageHeader title={data?.page.page_title ?? ""} subtitle={data?.page.page_subtitle}>
            <span className="mt-5 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold tracking-wider text-primary">
              SHOP NFC CARDS
            </span>
          </PageHeader>
          <section className="bg-[#F8FAFC] px-4 pb-14 pt-10 dark:bg-transparent sm:pt-12">
            <div className="mx-auto max-w-[1100px]">
              {products.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <PackageSearch className="size-10 text-muted-foreground" />
                  <p className="font-semibold text-foreground">No cards are available right now</p>
                  <p className="text-sm text-muted-foreground">Please check back soon.</p>
                </div>
              ) : (
                <ProductSelection products={products} currency={settings.currency} onSelect={openProduct} />
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="bg-[#F8FAFC] px-4 py-8 dark:bg-transparent sm:py-10">
            <div className="mx-auto max-w-[1320px]">
              <ProductDetails
                key={selected.slug}
                product={selected}
                currency={settings.currency}
                onBack={() => openProduct(null)}
                onAddToCart={(qty) => addToCart(selected, qty, "cart")}
                onBuyNow={(qty) => addToCart(selected, qty, "buy")}
                pendingAction={pendingAction}
                extra={
                  <div className="space-y-4">
                    {availableThemes.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 focus-visible:ring-blue-400/50 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/25 dark:hover:text-blue-200"
                        onClick={() => scrollTo(themesRef)}
                      >
                        View {availableThemes.length} Templates
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </Button>
                    )}
                    {(data?.trust_badges ?? []).length > 0 && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                        {(data?.trust_badges ?? []).map((b) => {
                          const Icon = resolveIcon(b.icon)
                          return (
                            <div key={b.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
                              <Icon className="size-4 shrink-0 text-primary" />
                              <span className="text-xs font-medium text-muted-foreground">{b.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                }
              />
            </div>
          </section>

          {/* Choose Your Profile Theme — unchanged; only for a product with
              profile templates (the NFC Custom card), never for Google
              Review Card. */}
          {availableThemes.length > 0 && (
            <section ref={themesRef} id="profile-themes" className="scroll-mt-20 px-4 pb-14 pt-10 sm:pb-16 sm:pt-12">
              <div className="mx-auto max-w-[1320px]">
                <div className="mx-auto max-w-2xl text-center">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {data?.page.theme_section_heading || "Choose Your Profile Theme"}
                  </h2>
                  <p className="mt-3 text-muted-foreground">{data?.page.theme_section_subtitle}</p>

                  <span className="mt-5 inline-block rounded-full bg-[#4F46E5]/10 px-4 py-1.5 text-xs font-bold tracking-wider text-[#4F46E5]">
                    {selected.slug.toUpperCase()} • {selected.template_count}{" "}
                    {selected.template_count === 1 ? "THEME" : "THEMES"} INCLUDED
                  </span>
                  <p className="mt-3 text-sm text-muted-foreground">{selected.theme_plan_copy}</p>
                  {customer && profile ? (
                    hasCustomCard ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Signed in — click a template below to set it on your profile.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Purchase {selected.name} above to unlock template selection.
                      </p>
                    )
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <Link to="/login" className="font-semibold text-primary hover:underline">
                        Log in
                      </Link>{" "}
                      to select one of these for your own profile.
                    </p>
                  )}
                </div>

                <div className="mt-8">
                  <ProfileThemeShowcase
                    themes={availableThemes}
                    selectedId={customer && profile && hasCustomCard ? profile.selectedTemplate : undefined}
                    onSelect={
                      customer && profile && hasCustomCard
                        ? (id) => id !== profile.selectedTemplate && selectTemplateMutation.mutate(id)
                        : undefined
                    }
                    pendingId={selectTemplateMutation.isPending ? (selectTemplateMutation.variables ?? null) : null}
                    imagesByThemeId={templateImagesById}
                  />
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
