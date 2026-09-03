import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface RevealProps {
  children: ReactNode
  className?: string
  /** "up" fades in while translating up (default); "scale" fades in while scaling from 95% */
  variant?: "up" | "scale"
  delayMs?: number
}

/** Lightweight scroll-triggered fade-up / scale-in — no animation library, just
 * an IntersectionObserver flipping a class once an element enters the viewport. */
export function Reveal({ children, className, variant = "up", delayMs = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out",
        visible
          ? "opacity-100 translate-y-0 scale-100"
          : variant === "scale"
            ? "opacity-0 scale-95"
            : "opacity-0 translate-y-6",
        className,
      )}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
    >
      {children}
    </div>
  )
}
