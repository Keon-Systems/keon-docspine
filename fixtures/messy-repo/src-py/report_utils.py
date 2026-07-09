"""Small Python module for fixture defect #12.

docs/canon/reporting.md makes a symbol claim against `format_report` below.
The fixture's symbol index is built for the JS/TS side (src/), so a claim
against a Python symbol can never be confirmed true or false the normal
way — it must resolve as `unverifiable` with detail substring
`unverifiable_symbol_language`, never as `ok` or `broken`.
"""


def format_report(data):
    return {"rows": len(data)}