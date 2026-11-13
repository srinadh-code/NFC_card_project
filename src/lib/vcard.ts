import type { Profile } from "@/types"

/** vCard 3.0 TEXT values must not introduce properties or structured fields. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
}

/** Contact and URI values are single lines; keep valid punctuation intact. */
function singleLine(value: string): string {
  return value.replace(/[\r\n]/g, "")
}

export function buildVCard(profile: Profile, includeContact: boolean): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeText(profile.fullName)}`,
    `ORG:${escapeText(profile.company)}`,
    `TITLE:${escapeText(profile.designation)}`,
  ]
  if (includeContact) {
    if (profile.phone) lines.push(`TEL;TYPE=CELL:${singleLine(profile.phone)}`)
    if (profile.email) lines.push(`EMAIL:${singleLine(profile.email)}`)
  }
  if (profile.address) lines.push(`ADR;TYPE=WORK:;;${escapeText(profile.address)}`)
  if (profile.website) lines.push(`URL:${singleLine(profile.website)}`)
  lines.push("END:VCARD")
  return lines.join("\n")
}

export function downloadVCard(profile: Profile, includeContact: boolean) {
  const blob = new Blob([buildVCard(profile, includeContact)], { type: "text/vcard" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${profile.username}.vcf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
