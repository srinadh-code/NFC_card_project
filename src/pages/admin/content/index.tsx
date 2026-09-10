import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import HomeTab from "./HomeTab"
import AboutTab from "./AboutTab"
import FeaturesTab from "./FeaturesTab"
import HowItWorksTab from "./HowItWorksTab"
import FaqsTab from "./FaqsTab"
import TestimonialsTab from "./TestimonialsTab"
import CompaniesTab from "./CompaniesTab"
import StatisticsTab from "./StatisticsTab"
import ValuesTab from "./ValuesTab"
import ContactMessagesTab from "./ContactMessagesTab"

export default function AdminWebsiteContent() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Website Content</h1>
        <p className="text-sm text-muted-foreground">Manage the content shown on the public marketing site.</p>
      </div>

      <Tabs defaultValue="home">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="home">Home</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="how-it-works">How It Works</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
          <TabsTrigger value="values">Values</TabsTrigger>
          <TabsTrigger value="contact-messages">Contact Messages</TabsTrigger>
        </TabsList>

        <TabsContent value="home" className="mt-4">
          <HomeTab />
        </TabsContent>
        <TabsContent value="about" className="mt-4">
          <AboutTab />
        </TabsContent>
        <TabsContent value="features" className="mt-4">
          <FeaturesTab />
        </TabsContent>
        <TabsContent value="how-it-works" className="mt-4">
          <HowItWorksTab />
        </TabsContent>
        <TabsContent value="faqs" className="mt-4">
          <FaqsTab />
        </TabsContent>
        <TabsContent value="testimonials" className="mt-4">
          <TestimonialsTab />
        </TabsContent>
        <TabsContent value="companies" className="mt-4">
          <CompaniesTab />
        </TabsContent>
        <TabsContent value="statistics" className="mt-4">
          <StatisticsTab />
        </TabsContent>
        <TabsContent value="values" className="mt-4">
          <ValuesTab />
        </TabsContent>
        <TabsContent value="contact-messages" className="mt-4">
          <ContactMessagesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
