import { useLayoutEffect, useRef } from "react"

interface TypewriterOptions {
  content: string
  trigger?: "load" | "viewport"
}

/** Reveal CMS text in order without per-character React renders or changing its layout. */
export function useTypewriter<T extends HTMLElement>({ content, trigger = "load" }: TypewriterOptions) {
  const rootRef = useRef<T>(null)
  const played = useRef(false)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    let offset = 0
    const parts = Array.from(root.querySelectorAll<HTMLElement>("[data-typewriter-part]")).map((element) => {
      const characters = Array.from(element.querySelectorAll<HTMLElement>("[data-typewriter-character]"))
      const cap = Number(element.dataset.typewriterMaxDuration) || Infinity
      const duration = Math.min(characters.length * 40, cap)
      const part = { characters, duration, offset, shown: 0 }
      offset += duration
      return part
    }).filter(({ characters }) => characters.length > 0)

    const caret = root.querySelector<HTMLElement>("[data-typewriter-cursor]")
    const showFullText = () => {
      parts.forEach(({ characters }) => characters.forEach((character) => {
        character.style.visibility = ""
      }))
      if (caret) {
        caret.style.display = "none"
        caret.removeAttribute("data-typing-caret")
      }
      root.style.removeProperty("--typewriter-caret-opacity")
    }

    showFullText()
    if (
      played.current || parts.length === 0 ||
      typeof window.matchMedia !== "function" ||
      typeof window.requestAnimationFrame !== "function" ||
      (trigger === "viewport" && typeof IntersectionObserver === "undefined")
    ) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reducedMotion.matches) {
      played.current = true
      return
    }

    let frame = 0
    let observer: IntersectionObserver | undefined
    const start = (startedAt: number) => {
      if (played.current) return
      played.current = true
      observer?.disconnect()

      const tick = (now: number) => {
        // Keep one blink phase while the caret moves between characters.
        const opacity = (now - startedAt) % 700 < 490 ? "1" : "0"
        if (root.style.getPropertyValue("--typewriter-caret-opacity") !== opacity) {
          root.style.setProperty("--typewriter-caret-opacity", opacity)
        }
        let active: { character: HTMLElement; position: string } | undefined
        parts.forEach((part) => {
          const elapsed = now - startedAt - part.offset
          const count = Math.min(part.characters.length, Math.max(0, Math.floor(elapsed / part.duration * part.characters.length)))
          for (let index = part.shown; index < count; index++) part.characters[index].style.visibility = ""
          part.shown = count
          if (!active && elapsed >= 0 && count < part.characters.length) {
            active = { character: part.characters[Math.max(0, count - 1)], position: count === 0 ? "before" : "after" }
          }
        })
        if (active) {
          if (caret) {
            const characterRect = active.character.getBoundingClientRect()
            const rootRect = root.getBoundingClientRect()
            caret.style.left = `${characterRect.left - rootRect.left + (active.position === "after" ? characterRect.width : 0)}px`
            caret.style.top = `${characterRect.top - rootRect.top + characterRect.height * 0.1}px`
            caret.style.height = `${characterRect.height * 0.85}px`
            caret.style.display = "block"
            caret.setAttribute("data-typing-caret", active.position)
          }
          frame = window.requestAnimationFrame(tick)
        } else {
          showFullText()
        }
      }
      tick(startedAt)
    }

    const handleMotionChange = () => {
      if (!reducedMotion.matches) return
      played.current = true
      observer?.disconnect()
      window.cancelAnimationFrame(frame)
      showFullText()
    }

    parts.forEach(({ characters }) => characters.forEach((character) => {
      character.style.visibility = "hidden"
    }))
    reducedMotion.addEventListener?.("change", handleMotionChange)
    if (trigger === "viewport") {
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !played.current) frame = window.requestAnimationFrame(start)
      }, { threshold: 0.15 })
      observer.observe(root)
    } else {
      // Defer marking it played until the frame, so StrictMode's setup cleanup is safe.
      frame = window.requestAnimationFrame(start)
    }

    return () => {
      observer?.disconnect()
      window.cancelAnimationFrame(frame)
      reducedMotion.removeEventListener?.("change", handleMotionChange)
      showFullText()
    }
  }, [content, trigger])

  return rootRef
}
