import styles from "./TypewriterText.module.css"

interface TypewriterTextProps {
  text: string
  maxDurationMs?: number
}

export function TypewriterCursor() {
  return <span aria-hidden="true" data-typewriter-cursor className={styles.cursor} />
}

/** Full inline text reserves its final wrapping; only its glyph visibility changes. */
export function TypewriterText({ text, maxDurationMs }: TypewriterTextProps) {
  const characters = typeof Intl.Segmenter === "function"
    ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), ({ segment }) => segment)
    : Array.from(text)

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" data-typewriter-part data-typewriter-max-duration={maxDurationMs}>
        {characters.map((character, index) => (
          <span key={index} className={styles.character} data-typewriter-character>{character}</span>
        ))}
      </span>
    </>
  )
}
