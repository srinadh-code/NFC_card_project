// Client-side CSV export helper used across admin list pages (Customers,
// Cards, Orders, Analytics, Reports, ...). Builds a CSV string from an array
// of flat objects and triggers a real file download via Blob + object URL.

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  const str = String(value)
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ""
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCsvValue(row[h])).join(",")),
  ]
  return lines.join("\n")
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const csv = toCsv(rows)
  downloadTextFile(filename, csv, "text/csv;charset=utf-8;")
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8;") {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
