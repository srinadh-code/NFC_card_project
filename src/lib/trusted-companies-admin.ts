import type { QueryClient } from "@tanstack/react-query"
import { companiesApi } from "./contentApi"
import type { Company } from "@/types/content"

// Keep public Home data fresh when this CMS collection changes, using the
// existing composed homepage request rather than another company fetch.
export function trustedCompaniesAdminApi(queryClient: QueryClient) {
  async function changed<T>(mutation: Promise<T>): Promise<T> {
    const result = await mutation
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["content", "public-home"] }),
      queryClient.invalidateQueries({ queryKey: ["content", "public-companies"] }),
    ])
    return result
  }

  return {
    list: companiesApi.list,
    create: (body: Partial<Company>) => changed(companiesApi.create(body)),
    update: (id: number, body: Partial<Company>) => changed(companiesApi.update(id, body)),
    remove: (id: number) => changed(companiesApi.remove(id)),
    reorder: (order: number[]) => changed(companiesApi.reorder(order)),
  }
}
