import { Navigate, Outlet } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useGoogleReview } from "@/hooks/useGoogleReview"
import { ErrorState } from "@/components/customer/ErrorState"

export function DigitalProductRoute() {
  const access = useGoogleReview()
  if (access.isPending) return <div className="flex justify-center p-12"><Loader2 className="size-6 animate-spin" aria-label="Loading account access" /></div>
  if (access.isError) return <ErrorState error={access.error} onRetry={() => access.refetch()} />
  if (!access.data.digital_access) return <Navigate to={access.data.eligible ? "/google-review" : "/purchaser"} replace />
  return <Outlet />
}
