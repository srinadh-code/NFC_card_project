import { QueryClient } from "@tanstack/react-query"

// Session changes clear this shared client before the next account renders.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})
