import { useState } from "react"
import { Navigate, Outlet } from "react-router-dom"
import { useAdminAuthStore } from "@/store/auth-store"
import { AdminSidebar } from "@/components/layout/AdminSidebar"
import { AdminTopbar } from "@/components/layout/AdminTopbar"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"

export default function AdminLayout() {
  const admin = useAdminAuthStore((s) => s.admin)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (!admin) return <Navigate to="/admin/login" replace />

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 h-screen w-64">
          <AdminSidebar />
        </div>
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 border-0 p-0 sm:max-w-64">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AdminSidebar onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
