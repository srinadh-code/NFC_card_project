import { useState } from "react"
import { Outlet } from "react-router-dom"
import { PurchaserSidebar } from "@/components/layout/PurchaserSidebar"
import { CustomerTopbar } from "@/components/layout/CustomerTopbar"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

/**
 * Chrome for the Purchaser Dashboard (/purchaser/*): orders, payments and
 * delivery for cards bought, with no digital-profile features. Auth is
 * enforced upstream by <ProtectedRoute role="CUSTOMER"/> in App.tsx.
 */
export default function PurchaserLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 shrink-0 border-r border-[#0F172A] md:block">
        <div className="sticky top-0 h-screen">
          <PurchaserSidebar />
        </div>
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 bg-[#0F172A] p-0 text-white">
          <SheetHeader className="sr-only">
            <SheetTitle>Purchaser Dashboard navigation</SheetTitle>
          </SheetHeader>
          <PurchaserSidebar onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <CustomerTopbar variant="purchaser" onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
