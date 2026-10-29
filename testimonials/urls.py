from django.urls import path

from . import views

# Mounted at /api/testimonials/ (config/urls.py). Admin moderation lives
# under /api/admin/testimonials/ (admin_api/urls.py).
urlpatterns = [
    path("", views.PublicTestimonialListAPIView.as_view(), name="testimonial-public-list"),
    path("my/", views.MyTestimonialListAPIView.as_view(), name="testimonial-my-list"),
    path("eligibility/", views.TestimonialEligibilityAPIView.as_view(), name="testimonial-eligibility"),
    path("create/", views.TestimonialCreateAPIView.as_view(), name="testimonial-create"),
    path("<int:pk>/update/", views.TestimonialUpdateAPIView.as_view(), name="testimonial-update"),
    path("<int:pk>/delete/", views.TestimonialDeleteAPIView.as_view(), name="testimonial-delete"),
]
