import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

function getPageWindow(current: number, total: number): (number | "ellipsis")[] {
  const pages: (number | "ellipsis")[] = []
  const delta = 1
  const range: number[] = []
  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
    range.push(i)
  }
  pages.push(1)
  if (range[0] > 2) pages.push("ellipsis")
  pages.push(...range)
  if (range[range.length - 1] < total - 1) pages.push("ellipsis")
  if (total > 1) pages.push(total)
  return pages
}

export function TablePagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  totalItems?: number
  pageSize?: number
}) {
  if (totalPages <= 1) {
    if (totalItems === undefined) return null
    return (
      <p className="text-sm text-muted-foreground">
        Showing {totalItems} {totalItems === 1 ? "result" : "results"}
      </p>
    )
  }

  const pages = getPageWindow(page, totalPages)
  const rangeStart = pageSize ? (page - 1) * pageSize + 1 : undefined
  const rangeEnd = pageSize && totalItems ? Math.min(page * pageSize, totalItems) : undefined

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      {totalItems !== undefined && rangeStart !== undefined && (
        <p className="text-sm text-muted-foreground">
          Showing {rangeStart}-{rangeEnd} of {totalItems}
        </p>
      )}
      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e) => {
                e.preventDefault()
                if (page > 1) onPageChange(page - 1)
              }}
              aria-disabled={page === 1}
              className={page === 1 ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
          {pages.map((p, idx) =>
            p === "ellipsis" ? (
              <PaginationItem key={`ellipsis-${idx}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={p}>
                <PaginationLink
                  href="#"
                  isActive={p === page}
                  onClick={(e) => {
                    e.preventDefault()
                    onPageChange(p)
                  }}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e) => {
                e.preventDefault()
                if (page < totalPages) onPageChange(page + 1)
              }}
              aria-disabled={page === totalPages}
              className={page === totalPages ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
