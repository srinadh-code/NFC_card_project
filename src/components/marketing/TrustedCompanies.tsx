import { useId } from "react"
import type { CSSProperties } from "react"
import type { PublicCompany } from "@/types/content"
import styles from "./TrustedCompanies.module.css"

interface TrustedCompaniesProps {
  companies: readonly Pick<PublicCompany, "id" | "name">[]
}

export default function TrustedCompanies({ companies }: TrustedCompaniesProps) {
  const headingId = useId()
  const names = companies.filter((company) => company.name.trim().length > 0)
  if (names.length === 0) return null

  const moving = names.length > 1
  // The homepage container is at most 1440px. Twelve cells of at least
  // 120px fill it even with just two names, before accounting for gaps.
  // Both copies have identical content and end padding, so -50% is one
  // complete group with no blank frame or jump at the animation boundary.
  const repetitions = Math.ceil(12 / names.length)
  const loop = Array.from({ length: repetitions }, () => names).flat()
  const estimatedWidth = loop.reduce((width, company) => width + Math.max(120, company.name.length * 11) + 48, 0)
  const animationStyle = { "--marquee-duration": `${Math.max(40, estimatedWidth / 32)}s` } as CSSProperties

  return (
    <section className="border-y border-border bg-secondary py-8" aria-labelledby={headingId}>
      <div className="container-page">
        <p id={headingId} className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Trusted by professionals at
        </p>
        <div className={styles.companies}>
          {/* Read once by assistive technology; also the static reduced-motion view. */}
          <ul className={moving ? styles.accessibleList : styles.staticList}>
            {names.map((company) => <li key={company.id} className={styles.company}>{company.name}</li>)}
          </ul>
          {moving && (
            <div className={styles.viewport} tabIndex={0} role="group" aria-label="Company names. Focus to pause scrolling.">
              <div className={styles.track} style={animationStyle} aria-hidden="true">
                {[0, 1].map((copy) => (
                  <div key={copy} className={styles.group} data-company-loop>
                    {loop.map((company, index) => (
                      <span key={`${company.id}-${index}`} className={styles.company}>{company.name}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
