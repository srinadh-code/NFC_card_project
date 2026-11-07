import { request, requestRaw, toFrontendOrder } from "@/lib/api"
import type { ApiAdminOrder } from "@/lib/api"
import type { Order } from "@/types"

interface ApiPurchaser {
  id: number
  order_number: string | null
  customer_id: number
  name: string
  email: string
  phone: string
  total_cards_purchased: number
  total_amount_paid: string
  purchase_date: string
  total_cards_assigned: number
  total_cards_activated: number
}

export interface AdminPurchaser {
  id: string
  orderNumber: string | null
  customerId: string
  name: string
  email: string
  phone: string
  totalCardsPurchased: number
  totalAmountPaid: number
  purchaseDate: string
  totalCardsAssigned: number
  totalCardsActivated: number
}

function purchaser(row: ApiPurchaser): AdminPurchaser {
  return {
    id: String(row.id), orderNumber: row.order_number, customerId: String(row.customer_id),
    name: row.name, email: row.email, phone: row.phone,
    totalCardsPurchased: row.total_cards_purchased,
    totalAmountPaid: Number(row.total_amount_paid), purchaseDate: row.purchase_date,
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
  async get(id: string): Promise<AdminPurchaser & { order: Order }> {
    const row = await request<ApiPurchaser & { order: ApiAdminOrder }>(
      `/admin/purchasers/${encodeURIComponent(id)}/`, { area: "admin" },
    )
    return { ...purchaser(row), order: toFrontendOrder(row.order) }
  },
}
