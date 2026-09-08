import { Outlet } from "react-router-dom"

/**
 * Layout for authentication pages (login, register, forgot/reset password,
 * verify email, OTP, and any future auth screens). Deliberately renders no
 * public-site navbar or footer — completely separate from PublicLayout so
 * auth pages never inherit the marketing site chrome. Each auth page owns
 * its own full-screen branded layout (left illustration panel + form).
 */
export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  )
}
