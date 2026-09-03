import { Route, Routes } from "react-router-dom"

import PublicLayout from "@/components/layout/PublicLayout"
import AdminLayout from "@/components/layout/AdminLayout"
import CustomerLayout from "@/components/layout/CustomerLayout"

import Home from "@/pages/public/Home"
import About from "@/pages/public/About"
import Features from "@/pages/public/Features"
import HowItWorks from "@/pages/public/HowItWorks"
import Shop from "@/pages/public/Shop"
import Cart from "@/pages/public/Cart"
import Checkout from "@/pages/public/Checkout"
import OrderSuccess from "@/pages/public/OrderSuccess"
import TrackOrder from "@/pages/public/TrackOrder"
import Faq from "@/pages/public/Faq"
import Contact from "@/pages/public/Contact"
import Privacy from "@/pages/public/Privacy"
import Terms from "@/pages/public/Terms"

import AdminDashboard from "@/pages/admin/Dashboard"
import AdminCustomers from "@/pages/admin/Customers"
import AdminCustomerDetails from "@/pages/admin/CustomerDetails"
import AdminCards from "@/pages/admin/Cards"
import AdminOrders from "@/pages/admin/Orders"
import AdminTransactions from "@/pages/admin/Transactions"
import AdminProfiles from "@/pages/admin/Profiles"
import AdminAnalytics from "@/pages/admin/Analytics"
import AdminReports from "@/pages/admin/Reports"
import AdminSettings from "@/pages/admin/Settings"
import AdminSupport from "@/pages/admin/Support"

import Login from "@/pages/Login"
import CustomerRegister from "@/pages/customer/Register"
import CustomerDashboard from "@/pages/customer/Dashboard"
import CustomerMyCard from "@/pages/customer/MyCard"
import CustomerProfile from "@/pages/customer/Profile"
import CustomerSocialLinks from "@/pages/customer/SocialLinks"
import CustomerQrCode from "@/pages/customer/QrCode"
import CustomerAnalytics from "@/pages/customer/Analytics"
import CustomerActivity from "@/pages/customer/Activity"
import CustomerOrders from "@/pages/customer/Orders"
import CustomerSettings from "@/pages/customer/Settings"

import PublicProfile from "@/pages/profile/PublicProfile"
import NotFound from "@/pages/NotFound"

function App() {
  return (
    <Routes>
      {/* Public marketing site */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/features" element={<Features />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order-success" element={<OrderSuccess />} />
        <Route path="/track-order" element={<TrackOrder />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy-policy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        {/* Unified login (public, unauthenticated) — routes to the right
            dashboard by role after authenticating */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<CustomerRegister />} />
      </Route>

      {/* Admin portal */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="customers/:id" element={<AdminCustomerDetails />} />
        <Route path="cards" element={<AdminCards />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="transactions" element={<AdminTransactions />} />
        <Route path="profiles" element={<AdminProfiles />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="support" element={<AdminSupport />} />
      </Route>

      {/* Customer portal */}
      <Route element={<CustomerLayout />}>
        <Route path="/dashboard" element={<CustomerDashboard />} />
        <Route path="/my-card" element={<CustomerMyCard />} />
        <Route path="/profile" element={<CustomerProfile />} />
        <Route path="/social-links" element={<CustomerSocialLinks />} />
        <Route path="/qr-code" element={<CustomerQrCode />} />
        <Route path="/analytics" element={<CustomerAnalytics />} />
        <Route path="/activity" element={<CustomerActivity />} />
        <Route path="/orders" element={<CustomerOrders />} />
        <Route path="/settings" element={<CustomerSettings />} />
      </Route>

      {/* Public digital business card profile */}
      <Route path="/u/:username" element={<PublicProfile />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
