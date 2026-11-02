import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LEAD_STATUS_OPTIONS, LeadsTable } from "@/components/customer/LeadsTable"
import { useCustomerAuthStore } from "@/store/auth-store"
import type { LeadStatus } from "@/lib/api"

const ALL = "ALL"

export default function CustomerEnquiries() {
  const customer = useCustomerAuthStore((s) => s.customer)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<LeadStatus | "">("")

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(id)
  }, [searchInput])

  if (!customer) return null

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Enquiries</h1>
        <p className="text-sm text-muted-foreground">
          Every enquiry sent from the Contact Us section of your public profile, newest first.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">All Enquiries</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 sm:w-64"
                placeholder="Search name, email or phone"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Search enquiries"
              />
            </div>
            <Select value={status || ALL} onValueChange={(v) => setStatus(v === ALL ? "" : (v as LeadStatus))}>
              <SelectTrigger className="sm:w-40" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {LEAD_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <LeadsTable
            key={`${search}|${status}`}
            search={search}
            status={status}
            emptyMessage={
              search || status
                ? "No enquiries match this search or filter."
                : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
