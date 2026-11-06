import { request, requestRaw, toFrontendOrder } from "@/lib/api"
import type { ApiAdminOrder } from "@/lib/api"
import type { Order } from "@/types"

interface ApiPurchaser {
  id: number
  name: string
  email: string
  phone: string
  paid_order_count: number
  total_cards_purchased: number
  total_amount_paid: string
  last_purchase_date: string
  total_cards_assigned: number
  total_cards_activated: number
}

export interface AdminPurchaser {
  id: string
  name: string
  email: string
  phone: string
  paidOrderCount: number
  totalCardsPurchased: number
  totalAmountPaid: number
  lastPurchaseDate: string
  totalCardsAssigned: number
  totalCardsActivated: number
}

function purchaser(row: ApiPurchaser): AdminPurchaser {
  return {
    id: String(row.id), name: row.name, email: row.email, phone: row.phone,
    paidOrderCount: row.paid_order_count, totalCardsPurchased: row.total_cards_purchased,
    totalAmountPaid: Number(row.total_amount_paid), lastPurchaseDate: row.last_purchase_date,
    totalCardsAssigned: row.total_cards_assigned, totalCardsActivated: row.total_cards_activated,
  }
}

export const adminPurchaserApi = {
  async list(params: { page?: number; search?: string } = {}) {
    const query = new URLSearchParams()
    if (params.page) query.set("page", String(params.page))
    if (params.search) query.set("search", params.search)
    const result = await requestRaw<ApiPurchaser[]>(`/admin/purchasers/?${query}`, { area: "admin" })
    return {
      data: (result.data ?? []).map(purchaser), count: result.pagination?.count ?? 0,
      numPages: result.pagination?.num_pages ?? 1,
    }
  },
  async get(id: string): Promise<AdminPurchaser & { orders: Order[] }> {
    const row = await request<ApiPurchaser & { orders: ApiAdminOrder[] }>(
      `/admin/purchasers/${encodeURIComponent(id)}/`, { area: "admin" },
    )
    return { ...purchaser(row), orders: row.orders.map(toFrontendOrder) }
  },
}
