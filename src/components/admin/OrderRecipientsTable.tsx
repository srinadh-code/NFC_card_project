import { Link } from "react-router-dom"
import { AccountStatusBadge } from "@/components/admin/AccountStatusBadge"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { OrderRecipient } from "@/types"

export function OrderRecipientsTable({ recipients, showAdminDetails = true }: {
  recipients: OrderRecipient[]
  showAdminDetails?: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Card</TableHead><TableHead>Recipient</TableHead><TableHead>Phone</TableHead>
            <TableHead>Physical Card</TableHead><TableHead>Card Activation</TableHead>
            {showAdminDetails && <><TableHead>Account</TableHead><TableHead>Profile</TableHead></>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {recipients.map((recipient, index) => (
            <TableRow key={recipient.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                {showAdminDetails && recipient.userId ? (
                  <Link className="font-medium text-primary hover:underline" to={`/admin/customers/${recipient.userId}`}>
                    {recipient.name}
                  </Link>
                ) : <p className="font-medium">{recipient.name}</p>}
                <p className="whitespace-nowrap text-muted-foreground">{recipient.email}</p>
              </TableCell>
              <TableCell className="whitespace-nowrap">{recipient.phone || "Not recorded"}</TableCell>
              <TableCell>
                {recipient.assignedCardId ? (
                  <div className="space-y-1">
                    <p className="font-mono text-xs">{recipient.assignedCardSerial || recipient.assignedCardUid}</p>
                    {recipient.assignedCardUid && <p className="font-mono text-xs text-muted-foreground">UID: {recipient.assignedCardUid}</p>}
                    <StatusBadge status={(recipient.assignedCardStatus ?? "ASSIGNED").toLowerCase().replace(/^./, (s) => s.toUpperCase())} />
                  </div>
                ) : <StatusBadge status="Unassigned" />}
              </TableCell>
              <TableCell><StatusBadge status={recipient.activationStatus === "ACTIVE" ? "Active" : recipient.assignedCardId ? "Pending" : "Unassigned"} /></TableCell>
              {showAdminDetails && (
                <>
                  <TableCell>
                    <AccountStatusBadge status={recipient.accountStatus ?? "PENDING_PROCESSING"} />
                  </TableCell>
                  <TableCell>
                    {recipient.profileUsername ? (
                      <a className="text-primary hover:underline" href={`/u/${encodeURIComponent(recipient.profileUsername)}`} target="_blank" rel="noreferrer">
                        @{recipient.profileUsername}
                      </a>
                    ) : <span className="text-muted-foreground">Pending</span>}
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
          {recipients.length === 0 && (
            <TableRow><TableCell colSpan={showAdminDetails ? 7 : 5} className="py-8 text-center text-muted-foreground">
              Recipient details were not recorded for this historical order.
            </TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
