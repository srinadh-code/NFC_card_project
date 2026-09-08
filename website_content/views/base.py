"""
Shared APIView building blocks for the Website Content module.

Every concrete view in this app still subclasses APIView directly (per the
project's "APIView only, no ViewSets/routers" rule) and is wired up through
an explicit `path()` entry. These base classes exist purely to avoid
retyping the same list/detail/reorder/singleton/image-upload plumbing across
~13 near-identical resources — they are plain Python composition, not DRF
generics or viewsets.
"""

from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from common.permissions import IsAdminRole
from common.response import error, success

from website_content.services.cloudinary import delete_image, upload_image


class PublicListAPIView(APIView):
    """GET only, open to anyone, active rows only."""

    permission_classes = [AllowAny]
    model = None
    serializer_class = None

    def get_queryset(self):
        return self.model.objects.filter(is_active=True)

    def get(self, request):
        serializer = self.serializer_class(self.get_queryset(), many=True)
        return success(serializer.data)


class PublicSingletonAPIView(APIView):
    """GET only, open to anyone, the single active row (404 if none)."""

    permission_classes = [AllowAny]
    model = None
    serializer_class = None

    def get(self, request):
        obj = self.model.objects.filter(is_active=True).first()
        if obj is None:
            return error("Content not found.", status=404)
        return success(self.serializer_class(obj).data)


class AdminListCreateAPIView(APIView):
    """GET (all rows, active + inactive) / POST for an admin-managed collection."""

    permission_classes = [IsAdminRole]
    model = None
    serializer_class = None

    def get_queryset(self):
        return self.model.objects.all()

    def get(self, request):
        serializer = self.serializer_class(self.get_queryset(), many=True)
        return success(serializer.data)

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        return success(self.serializer_class(obj).data, message="Created.", status=201)


class AdminDetailAPIView(APIView):
    """GET / PUT / PATCH / DELETE a single row of an admin-managed collection."""

    permission_classes = [IsAdminRole]
    model = None
    serializer_class = None

    def get_object(self, pk):
        try:
            return self.model.objects.get(pk=pk)
        except self.model.DoesNotExist:
            return None

    def get(self, request, pk):
        obj = self.get_object(pk)
        if obj is None:
            return error("Not found.", status=404)
        return success(self.serializer_class(obj).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        obj = self.get_object(pk)
        if obj is None:
            return error("Not found.", status=404)
        serializer = self.serializer_class(obj, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        return success(self.serializer_class(obj).data, message="Updated.")

    def delete(self, request, pk):
        obj = self.get_object(pk)
        if obj is None:
            return error("Not found.", status=404)
        obj.delete()
        return success(None, message="Deleted.")


class AdminSingletonAPIView(APIView):
    """GET / PUT / PATCH a page's one-row section (auto-created on first read)."""

    permission_classes = [IsAdminRole]
    model = None
    serializer_class = None

    def get_object(self):
        obj = self.model.objects.first()
        if obj is None:
            obj = self.model.objects.create()
        return obj

    def get(self, request):
        return success(self.serializer_class(self.get_object()).data)

    def put(self, request):
        return self._update(request, partial=False)

    def patch(self, request):
        return self._update(request, partial=True)

    def _update(self, request, partial):
        obj = self.get_object()
        serializer = self.serializer_class(obj, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        return success(self.serializer_class(obj).data, message="Updated.")


class AdminReorderAPIView(APIView):
    """PATCH {"order": [id, id, ...]} — sets display_order = position in the list."""

    permission_classes = [IsAdminRole]
    model = None

    def patch(self, request):
        order = request.data.get("order")
        if not isinstance(order, list) or not order:
            return error("`order` must be a non-empty list of ids.", status=400)

        try:
            ids = [int(v) for v in order]
        except (TypeError, ValueError):
            return error("`order` must contain only ids.", status=400)

        objects = {obj.pk: obj for obj in self.model.objects.filter(pk__in=ids)}
        if len(objects) != len(set(ids)):
            return error("`order` contains an id that does not exist.", status=400)

        updated = []
        for index, obj_id in enumerate(ids):
            obj = objects[obj_id]
            obj.display_order = index
            updated.append(obj)
        self.model.objects.bulk_update(updated, ["display_order"])

        return success(None, message="Order updated.")


class _ImageOpsMixin:
    """Upload/replace/remove logic shared by the two image-upload view flavors below."""

    url_field = "image_url"
    public_id_field = "image_public_id"
    folder = "website"

    def _apply_upload(self, obj, file_obj):
        old_public_id = getattr(obj, self.public_id_field)

        # Upload (and validate) BEFORE touching the object — if this raises,
        # nothing below runs and the database is untouched.
        new_url, new_public_id = upload_image(file_obj, folder=self.folder)

        setattr(obj, self.url_field, new_url)
        setattr(obj, self.public_id_field, new_public_id)
        obj.save(update_fields=[self.url_field, self.public_id_field])

        # Only clean up the previous asset once the new one is confirmed saved.
        if old_public_id:
            delete_image(old_public_id)
        return obj

    def _apply_remove(self, obj):
        old_public_id = getattr(obj, self.public_id_field)
        setattr(obj, self.url_field, "")
        setattr(obj, self.public_id_field, "")
        obj.save(update_fields=[self.url_field, self.public_id_field])
        if old_public_id:
            delete_image(old_public_id)
        return obj


class AdminImageUploadAPIView(_ImageOpsMixin, APIView):
    """POST/DELETE the image on a single row of an admin-managed collection."""

    permission_classes = [IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]
    model = None
    serializer_class = None

    def get_object(self, pk):
        try:
            return self.model.objects.get(pk=pk)
        except self.model.DoesNotExist:
            return None

    def post(self, request, pk):
        obj = self.get_object(pk)
        if obj is None:
            return error("Not found.", status=404)
        file_obj = request.FILES.get("image")
        if not file_obj:
            return error("No image file provided.", status=400)
        obj = self._apply_upload(obj, file_obj)
        return success(self.serializer_class(obj).data, message="Image uploaded.")

    def delete(self, request, pk):
        obj = self.get_object(pk)
        if obj is None:
            return error("Not found.", status=404)
        obj = self._apply_remove(obj)
        return success(self.serializer_class(obj).data, message="Image removed.")


class AdminSingletonImageUploadAPIView(_ImageOpsMixin, APIView):
    """POST/DELETE the image on a page's one-row section."""

    permission_classes = [IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]
    model = None
    serializer_class = None

    def get_object(self):
        obj = self.model.objects.first()
        if obj is None:
            obj = self.model.objects.create()
        return obj

    def post(self, request):
        file_obj = request.FILES.get("image")
        if not file_obj:
            return error("No image file provided.", status=400)
        obj = self._apply_upload(self.get_object(), file_obj)
        return success(self.serializer_class(obj).data, message="Image uploaded.")

    def delete(self, request):
        obj = self._apply_remove(self.get_object())
        return success(self.serializer_class(obj).data, message="Image removed.")
