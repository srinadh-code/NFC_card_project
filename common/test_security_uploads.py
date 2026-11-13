import io
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from django.urls import reverse
from PIL import Image
from rest_framework.exceptions import ValidationError

from common.image_storage import upload_image, validate_image_file
from common.test_utils import AuthenticatedAPITestCase
from common.uploads import image_upload_error
from common.video_storage import upload_video


def image_file(fmt="PNG", content_type="image/png"):
    data = io.BytesIO()
    Image.new("RGB", (32, 32), color="blue").save(data, format=fmt)
    return SimpleUploadedFile("sample." + fmt.lower(), data.getvalue(), content_type=content_type)


class UploadValidationSecurityTests(SimpleTestCase):
    def test_spoofed_image_is_rejected_before_provider_call(self):
        file = SimpleUploadedFile("fake.png", b"<html>not an image</html>", content_type="image/png")
        self.assertIsNotNone(image_upload_error(file))
        with self.assertRaises(ValidationError):
            validate_image_file(file)

    def test_active_svg_is_rejected_and_static_svg_is_preserved(self):
        malicious = [
            b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
            b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            b'<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>',
            b'<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/x.svg#x"/></svg>',
            b'<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://evil.example";</style></svg>',
            b'<svg xmlns="http://www.w3.org/2000/svg" style="background-image:image-set(&quot;https://evil.example/x.png&quot; 1x)"/>',
            b'<!DOCTYPE svg [<!ENTITY payload "abc">]><svg/>',
        ]
        for content in malicious:
            with self.subTest(content=content), self.assertRaises(ValidationError):
                validate_image_file(SimpleUploadedFile("icon.svg", content, content_type="image/svg+xml"))
        safe = SimpleUploadedFile("icon.svg", b'<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop stop-color="red"/></linearGradient></defs><path style="fill:url(#g)" d="M0 0h10v10z"/></svg>', content_type="image/svg+xml")
        validate_image_file(safe)
        self.assertEqual(safe.tell(), 0)

    def test_safe_svg_accessibility_labels_and_export_metadata_are_preserved(self):
        safe = SimpleUploadedFile("export.svg", b'<svg xmlns="http://www.w3.org/2000/svg" aria-label="Email @brand behavior"><metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="https://example.com"/></rdf:RDF></metadata><rect width="10" height="10" fill="red"/></svg>', content_type="image/svg+xml")
        validate_image_file(safe)
        self.assertEqual(safe.tell(), 0)

    def test_valid_raster_formats_remain_accepted_and_file_is_rewound(self):
        for fmt, mime in [("PNG", "image/png"), ("JPEG", "image/jpeg"), ("WEBP", "image/webp"), ("ICO", "image/x-icon")]:
            with self.subTest(fmt=fmt):
                file = image_file(fmt, mime)
                validate_image_file(file)
                self.assertEqual(file.tell(), 0)

    def test_valid_gif_profile_upload_remains_supported(self):
        self.assertIsNone(image_upload_error(image_file("GIF", "image/gif")))

    @patch("common.image_storage._cloudinary_configured", return_value=True)
    @patch("common.image_storage.cloudinary.uploader.upload", side_effect=RuntimeError("provider-secret-value"))
    def test_image_provider_exception_is_redacted(self, _upload, _configured):
        with self.assertRaises(ValidationError) as caught:
            upload_image(image_file(), folder="test")
        self.assertNotIn("provider-secret-value", str(caught.exception.detail))
        self.assertIn("Image upload failed", str(caught.exception.detail))

    @patch("common.video_storage._cloudinary_configured", return_value=True)
    @patch("common.video_storage.cloudinary.uploader.upload_large", side_effect=RuntimeError("provider-secret-value"))
    def test_video_provider_exception_is_redacted(self, _upload, _configured):
        file = SimpleUploadedFile("video.mp4", b"\x00\x00\x00\x18ftypisom" + b"\x00" * 32, content_type="video/mp4")
        with self.assertRaises(ValidationError) as caught:
            upload_video(file, folder="test")
        self.assertNotIn("provider-secret-value", str(caught.exception.detail))

    def test_decompression_bomb_warning_is_rejected(self):
        with patch.object(Image, "MAX_IMAGE_PIXELS", 32):
            file = image_file()
            self.assertIsNotNone(image_upload_error(file))


class UploadEndpointSecurityTests(AuthenticatedAPITestCase):
    def test_all_profile_upload_routes_reject_forged_images_without_storage(self):
        for name, field in [("profile-me-avatar", "avatar"), ("customer-profile-upload-image", "image"), ("customer-profile-upload-cover", "image")]:
            with self.subTest(route=name), patch("django.core.files.storage.InMemoryStorage._save", return_value="unexpected.png") as storage:
                file = SimpleUploadedFile("fake.png", b"not-an-image", content_type="image/png")
                response = self.client.post(reverse(name), {field: file}, format="multipart")
                self.assertEqual(response.status_code, 400)
                storage.assert_not_called()
