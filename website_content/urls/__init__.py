from django.urls import include, path

urlpatterns = [
    path("public/", include("website_content.urls.public")),
    path("admin/", include("website_content.urls.admin")),
]
