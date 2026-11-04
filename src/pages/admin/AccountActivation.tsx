import { useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Mail, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TablePagination } from "@/components/admin/TablePagination"
import { ApiError, adminOnboardingApi, type ApiCustomerOnboarding } from "@/lib/api"
import { formatDate, formatDateTime } from "@/lib/mock-api"

const PAGE_SIZE = 10

const ACTIVATION_LABEL: Record<ApiCustomerOnboarding["activation_status"], string> = {
  PENDING: "Activation Pending",
  EXPIRED: "Temporary Credential Expired",
  COMPLETED: "Password Setup Completed",
}
const ACTIVATION_VARIANT = { PENDING: "warning", EXPIRED: "destructive", COMPLETED: "success" } as const

const EMAIL_LABEL: Record<ApiCustomerOnboarding["email_status"], string> = {
  PENDING: "Email Pending",
  SENT: "Email Sent",
  FAILED: "Email Failed",
}
const EMAIL_VARIANT = { PENDING: "secondary", SENT: "success", FAILED: "destructive" } as const

function titleCase(value: string | null) {
  if (!value) return "—"
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/**
 * Accounts created automatically after a paid order (accounts.
 * CustomerOnboarding): verification, activation and welcome-email status.
 * Passwords and OTPs are never shown — "Resend login details" issues a new
 * temporary password straight to the customer's inbox.
 */
export default function AdminAccountActivation() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [activation, setActivation] = useState("ALL")
  const [emailStatus, setEmailStatus] = useState("ALL")
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-onboarding", page, search, activation, emailStatus],
    queryFn: () =>
      adminOnboardingApi.list({
        page,
        search: search || undefined,
        activation: activation === "ALL" ? undefined : activation,
        emailStatus: emailStatus === "ALL" ? undefined : emailStatus,
      }),
    placeholderData: keepPreviousData,
  })
  const rows = data?.items ?? []
  const totalItems = data?.pagination?.count ?? 0
  const totalPages = Math.max(1, data?.pagination?.num_pages ?? 1)

  const resend = useMutation({
    mutationFn: (id: number) => adminOnboardingApi.resend(id),
    onSuccess: () => {
      toast.success("New login details are being emailed to the customer.")
      queryClient.invalidateQueries({ queryKey: ["admin-onboarding"] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't resend the login details."),
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account Activation</h1>
        <p className="text-sm text-muted-foreground">
          Customer accounts created automatically after a paid order — {totalItems} total
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name, email or order ID…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                aria-label="Search accounts"
              />
            </div>
            <Select value={activation} onValueChange={(v) => { setActivation(v); setPage(1) }}>
              <SelectTrigger className="w-full lg:w-60" aria-label="Activation status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All activation statuses</SelectItem>
                <SelectItem value="PENDING">Activation Pending</SelectItem>
                <SelectItem value="EXPIRED">Temporary Credential Expired</SelectItem>
                <SelectItem value="COMPLETED">Password Setup Completed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={emailStatus} onValueChange={(v) => { setEmailStatus(v); setPage(1) }}>
              <SelectTrigger className="w-full lg:w-48" aria-label="Email status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All email statuses</SelectItem>
                <SelectItem value="SENT">Email Sent</SelectItem>
                <SelectItem value="FAILED">Email Failed</SelectItem>
                <SelectItem value="PENDING">Email Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
              Couldn&apos;t load accounts.
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>OTP Verification</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Account Created</TableHead>
                    <TableHead>Activation</TableHead>
                    <TableHead>Welcome Email</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <p className="font-medium">{r.customer_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{r.customer_email}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.customer_phone || "—"}</TableCell>
                      <TableCell className="text-xs">
                        <p>Email: {r.email_verified_by_otp ? "Verified" : "—"}</p>
                        <p className="text-muted-foreground">Mobile: {r.phone_verified_by_otp ? "Verified" : "Not verified"}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-mono text-xs">{r.order_number ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{titleCase(r.order_status)}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(r.account_created_at)}</TableCell>
                      <TableCell>
                        <Badge variant={ACTIVATION_VARIANT[r.activation_status]}>{ACTIVATION_LABEL[r.activation_status]}</Badge>
                        {r.activation_status === "COMPLETED" && r.password_set_at && (
                          <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(r.password_set_at)}</p>
                        )}
                        {r.activation_status !== "COMPLETED" && r.temporary_password_expires_at && (
                          <p className="mt-1 text-xs text-muted-foreground">Expires {formatDateTime(r.temporary_password_expires_at)}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={EMAIL_VARIANT[r.email_status]}>{EMAIL_LABEL[r.email_status]}</Badge>
                        {r.email_status === "FAILED" && r.email_last_error && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {r.email_attempts} attempts · {r.email_last_error}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.activation_status !== "COMPLETED" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resend.isPending}
                            onClick={() => resend.mutate(r.id)}
                            aria-label={`Resend login details to ${r.customer_email}`}
                            title="Email a new temporary password"
                          >
                            <Mail className="size-3.5" /> Resend
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                        No automatically created accounts yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={totalItems} pageSize={PAGE_SIZE} />
        </CardContent>
      </Card>
    </div>
  )
}
