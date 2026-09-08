import { useState } from "react"
import { Outlet } from "react-router-dom"
import { CustomerSidebar } from "@/components/layout/CustomerSidebar"
import { CustomerTopbar } from "@/components/layout/CustomerTopbar"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

/**
 * Pure chrome (sidebar + topbar) for the customer portal. Auth is enforced
 * upstream by <ProtectedRoute role="CUSTOMER"/> in App.tsx — this component
 * never mounts unless that guard already confirmed a real customer
 * session, so it has no auth logic of its own.
 */
export default function CustomerLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 shrink-0 border-r border-[#0F172A] md:block">
        <div className="sticky top-0 h-screen">
          <CustomerSidebar />
        </div>
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <CustomerSidebar onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <CustomerTopbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
