from rest_framework.views import APIView

from common.pagination import StandardPagination


class PaginatedAPIView(APIView):
    """
    Shared pagination for plain APIView list endpoints (no ViewSets/routers
    anywhere in this project). Subclasses call `self.paginate(...)` from
    their `get()` instead of re-wiring a paginator by hand each time.
    """

    pagination_class = StandardPagination

    def paginate(self, queryset, serializer_class, context=None):
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, self.request, view=self)
        serializer = serializer_class(page, many=True, context=context or {})
        return paginator.get_paginated_response(serializer.data)
