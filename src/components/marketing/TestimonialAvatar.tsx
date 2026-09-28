import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

/** The customer's uploaded photo, or their initials — never a generated
 *  placeholder face. Shared by the public card, customer and admin pages. */
export function TestimonialAvatar({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  return (
    <Avatar className={cn("size-11 bg-secondary", className)}>
      {src ? <AvatarImage src={src} alt={name} className="object-cover" /> : null}
      <AvatarFallback className="bg-gradient-brand text-xs font-semibold text-white">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
