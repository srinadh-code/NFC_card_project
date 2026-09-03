import { UserRoundPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export function ProfileNotReady({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mx-auto max-w-lg rounded-2xl">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserRoundPlus className="size-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">We're finishing setting up your profile</h2>
          <p className="text-sm text-muted-foreground">
            This usually only takes a second. If this doesn't resolve on its own, click below to set it up now.
          </p>
        </div>
        <Button onClick={onRetry}>Set Up My Profile Now</Button>
      </CardContent>
    </Card>
  )
}
