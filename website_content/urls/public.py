from django.urls import path

from website_content.views.public import (
    AboutPublicView,
    CompaniesPublicView,
    ContactMessagePublicCreateView,
    FaqsPublicView,
    FeaturesPublicView,
    GeneralSettingsPublicView,
    HomePublicView,
    HowItWorksPublicView,
    StatisticsPublicView,
    TestimonialsPublicView,
    ValuesPublicView,
)

urlpatterns = [
    path("home/", HomePublicView.as_view(), name="public-home"),
    path("about/", AboutPublicView.as_view(), name="public-about"),
    path("features/", FeaturesPublicView.as_view(), name="public-features"),
    path("how-it-works/", HowItWorksPublicView.as_view(), name="public-how-it-works"),
    path("faqs/", FaqsPublicView.as_view(), name="public-faqs"),
    path("testimonials/", TestimonialsPublicView.as_view(), name="public-testimonials"),
    path("companies/", CompaniesPublicView.as_view(), name="public-companies"),
    path("statistics/", StatisticsPublicView.as_view(), name="public-statistics"),
    path("values/", ValuesPublicView.as_view(), name="public-values"),
    path("contact/", ContactMessagePublicCreateView.as_view(), name="public-contact-create"),
    path("settings/", GeneralSettingsPublicView.as_view(), name="public-settings"),
]
