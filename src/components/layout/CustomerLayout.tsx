import { useState } from "react"
import { Navigate, Outlet } from "react-router-dom"
import { useCustomerAuthStore, useAdminAuthStore } from "@/store/auth-store"
import { CustomerSidebar } from "@/components/layout/CustomerSidebar"
import { CustomerTopbar } from "@/components/layout/CustomerTopbar"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

export default function CustomerLayout() {
  const customer = useCustomerAuthStore((s) => s.customer)
  const admin = useAdminAuthStore((s) => s.admin)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (!customer) {
    // Signed in as the other role — send them to their own dashboard
    // instead of bouncing a valid session back to the login screen.
    if (admin) return <Navigate to="/admin/dashboard" replace />
    return <Navigate to="/login" replace />
  }

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
