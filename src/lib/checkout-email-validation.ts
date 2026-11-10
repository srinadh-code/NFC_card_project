const LOCAL_PART_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i
const DOMAIN_LABEL_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/i

export function checkoutEmailError(value: string): string | null {
  const email = value.trim()
  if (!email) return "Enter your email address."

  const separator = email.indexOf("@")
  if (separator <= 0 || separator !== email.lastIndexOf("@")) return "Enter a valid email address."

  const localPart = email.slice(0, separator)
  const domain = email.slice(separator + 1)
  const domainLabels = domain.split(".")
  if (
    localPart.length > 64 ||
    !LOCAL_PART_PATTERN.test(localPart) ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    domain.length > 253 ||
    domainLabels.length < 2 ||
    domainLabels.some((label) => label.length > 63 || !DOMAIN_LABEL_PATTERN.test(label)) ||
    domainLabels[domainLabels.length - 1].length < 2
  ) {
    return "Enter a valid email address."
  }

  return null
}
