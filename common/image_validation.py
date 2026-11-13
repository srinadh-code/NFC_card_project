"""Content checks shared by profile and CMS image uploads.

SVG is restricted to static graphics with local references. It is never
inserted as HTML by the application. Keep uploaded media on its CDN origin.
"""

import re
import warnings
from xml.etree import ElementTree

from PIL import Image, UnidentifiedImageError


SVG_NAMESPACE = "http://www.w3.org/2000/svg"
METADATA_NAMESPACES = frozenset((
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "http://purl.org/dc/elements/1.1/",
    "http://creativecommons.org/ns#",
))
STYLE_ATTRIBUTES = frozenset((
    "style", "fill", "stroke", "filter", "clip-path", "mask", "cursor",
    "marker", "marker-start", "marker-mid", "marker-end", "color-profile",
))
SVG_TAGS = frozenset((
    "svg", "g", "defs", "symbol", "use", "title", "desc", "metadata",
    "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
    "text", "tspan", "textPath", "style", "linearGradient", "radialGradient",
    "stop", "clipPath", "mask", "pattern", "marker", "filter", "feBlend",
    "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix",
    "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow",
    "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur",
    "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight",
    "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence",
))
LOCAL_REFERENCE = re.compile(r"url\(\s*(['\"]?)#[\w:.-]+\1\s*\)", re.IGNORECASE)


def _static_style(value):
    # Block escaping/comments/at-rules so forbidden URL syntax cannot be
    # disguised. Local gradient/filter references remain supported.
    lower = value.lower()
    if any(part in lower for part in ("\\", "/*", "@", "javascript:", "expression(", "behavior", "-moz-binding")):
        raise ValueError("SVG must contain only static graphics.")
    if re.search(r"(?:image-set|image|src)\s*\(", lower):
        raise ValueError("SVG external resources are not allowed.")
    if "url(" in LOCAL_REFERENCE.sub("", lower):
        raise ValueError("SVG external resources are not allowed.")


def _validate_svg(file):
    text = file.read().decode("utf-8-sig")
    if re.search(r"<!\s*(?:DOCTYPE|ENTITY)|<\?xml-stylesheet", text, re.IGNORECASE):
        raise ValueError("SVG document declarations are not allowed.")
    root = ElementTree.fromstring(text)
    if root.tag not in ("svg", "{" + SVG_NAMESPACE + "}svg"):
        raise ValueError("This file is not an SVG image.")
    metadata_children = {
        descendant
        for metadata in root.iter()
        if metadata.tag in ("metadata", "{" + SVG_NAMESPACE + "}metadata")
        for descendant in metadata.iter()
    }
    for element in root.iter():
        tag = element.tag
        inert_metadata = False
        if tag.startswith("{"):
            namespace, tag = tag[1:].split("}", 1)
            inert_metadata = element in metadata_children and namespace in METADATA_NAMESPACES
            if namespace != SVG_NAMESPACE and not inert_metadata:
                raise ValueError("SVG embedded documents are not allowed.")
        if not inert_metadata and tag not in SVG_TAGS:
            raise ValueError("SVG must contain only static graphics.")
        if tag == "style":
            _static_style("".join(element.itertext()))
        for attribute, value in element.attrib.items():
            name = attribute.rsplit("}", 1)[-1].lower()
            if name.startswith("on") or name in ("src", "base"):
                raise ValueError("SVG active content is not allowed.")
            if name == "href" and not re.fullmatch(r"#[\w:.-]+", value):
                raise ValueError("SVG external resources are not allowed.")
            if name in STYLE_ATTRIBUTES:
                _static_style(value)


def validate_image_content(file):
    """Raise ValueError for corrupt, active, or excessively large images."""
    try:
        file.seek(0)
        if getattr(file, "content_type", "") == "image/svg+xml":
            _validate_svg(file)
        else:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(file) as image:
                    image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, UnicodeError,
            ElementTree.ParseError, Image.DecompressionBombWarning,
            Image.DecompressionBombError) as exc:
        raise ValueError("Upload a valid image within the image dimension limit.") from exc
    finally:
        file.seek(0)
