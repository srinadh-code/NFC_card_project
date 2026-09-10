import { useEffect } from "react"
import { Outlet } from "react-router-dom"
import Navbar from "@/components/layout/Navbar"
import Footer from "@/components/layout/Footer"
import { usePublicSettings } from "@/hooks/usePublicSettings"

export default function PublicLayout() {
  const { settings } = usePublicSettings()

  // index.html's static <title> is only the pre-hydration/no-JS fallback —
  // once settings load, the tab title reflects the live site name.
  useEffect(() => {
    if (settings.site_name) document.title = settings.site_name
  }, [settings.site_name])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
