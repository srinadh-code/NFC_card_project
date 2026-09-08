import { AlertTriangle, WifiOff } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ApiError, NetworkError } from "@/lib/api"

interface ErrorStateProps {
  error?: unknown
  onRetry?: () => void
  className?: string
}

function describeError(error: unknown): { title: string; description: string; retryLabel: string } {
  if (error instanceof NetworkError) {
    return {
      title: "You're offline",
      description: "Couldn't reach the server. Check your connection and try again.",
      retryLabel: "Try Again",
    }
  }
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return {
        title: "Session expired",
        description: "Please log in again to continue.",
        retryLabel: "Log In Again",
      }
    }
    if (error.status === 403) {
      return {
        title: "Access denied",
        description: "You don't have permission to view this.",
        retryLabel: "Try Again",
      }
    }
    if (error.status === 404) {
      return {
        title: "Not found",
        description: "We couldn't find what you were looking for.",
        retryLabel: "Try Again",
      }
    }
    if (error.status >= 500) {
      return {
        title: "Server error",
        description: "Something went wrong on our end. Please try again shortly.",
        retryLabel: "Try Again",
      }
    }
    return { title: "Something went wrong", description: error.message, retryLabel: "Try Again" }
  }
  return {
    title: "Something went wrong",
    description: "An unexpected error occurred. Please try again.",
    retryLabel: "Try Again",
  }
}

/** Shared "couldn't load this" state — every API-backed page uses this instead of a blank screen. */
export function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  const navigate = useNavigate()
  const info = describeError(error)
  const Icon = error instanceof NetworkError ? WifiOff : AlertTriangle
  const isSessionExpired = error instanceof ApiError && error.status === 401
  const handleAction = isSessionExpired ? () => navigate("/login") : onRetry

  return (
    <div className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed py-16 text-center ${className ?? ""}`}>
      <Icon className="size-8 text-muted-foreground" />
      <div>
        <p className="font-medium">{info.title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{info.description}</p>
      </div>
      {(handleAction || isSessionExpired) && (
        <Button variant="outline" size="sm" onClick={handleAction}>
          {info.retryLabel}
        </Button>
      )}
    </div>
  )
}
