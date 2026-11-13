"""Keep untrusted text inert when a CSV is opened in a spreadsheet."""


def safe_csv_cell(value):
    if not isinstance(value, str):
        return value
    stripped = value.lstrip()
    if value.startswith(("\t", "\r", "\n")) or stripped.startswith(("=", "+", "-", "@")):
        return "'" + value
    return value
