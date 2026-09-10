import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"
import { ApiError } from "@/lib/api"

// Shared data-loading/editing/saving logic for the six singleton sections
// (Hero, How It Feels, CTA, About Page, Mission, Built From Experience).
// Loads the section once, keeps a local editable copy in sync with the
// fetched value, and exposes a save() that PATCHes the real backend and
// only then updates the cache/UI (never optimistic).
export function useSingletonSection<T extends { id: number }>({
  queryKey,
  get,
  update,
  label,
}: {
  queryKey: QueryKey
  get: () => Promise<T>
  update: (body: Partial<T>) => Promise<T>
  label: string
}) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey, queryFn: get })
  const [values, setValues] = useState<Partial<T>>({})

  useEffect(() => {
    if (data) setValues(data)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (body: Partial<T>) => update(body),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated)
      toast.success(`${label} updated.`)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : `Failed to update ${label.toLowerCase()}.`)
    },
  })

  function setField<K extends keyof T>(key: K, value: T[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  // Lets image-upload/remove handlers (which hit their own endpoint) push
  // the backend's returned object straight into the cache + local form.
  function applyServerUpdate(updated: T) {
    queryClient.setQueryData(queryKey, updated)
    setValues(updated)
  }

  return {
    data,
    isLoading,
    values,
    setField,
    save: () => saveMutation.mutate(values),
    isSaving: saveMutation.isPending,
    applyServerUpdate,
  }
}
