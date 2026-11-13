import type { ComponentPropsWithoutRef } from "react"
import { useImageReveal } from "@/hooks/use-image-reveal"

type AnimatedImageProps = ComponentPropsWithoutRef<"img"> & { reveal?: boolean }

/** A native image with an optional entrance; adds no layout wrapper or styles. */
export function AnimatedImage({ reveal = true, ...props }: AnimatedImageProps) {
  const ref = useImageReveal(props.src ?? props.srcSet, reveal)
  return <img {...props} ref={ref} />
}
