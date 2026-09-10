import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// Shared wrapper for the six singleton sections (Hero, How It Feels, CTA,
// About Page, Mission, Built From Experience): title + form area + a single
// Save button with its own loading/saving state.
export function SingletonSectionCard({
  title,
  description,
  isLoading,
  isSaving,
  onSave,
  children,
  extra,
}: {
  title: string
  description?: string
  isLoading?: boolean
  isSaving?: boolean
  onSave: () => void
  children: ReactNode
  extra?: ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-tight">{title}</h3>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {extra}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
            <div className="flex justify-end">
              <Button onClick={onSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                Save Changes
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
