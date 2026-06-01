"""Desktop GUI frontend (pywebview).

This is just another frontend on the same core library as the CLI — it owns no
parsing logic. `app.py` opens a native window rendering `web/index.html` and
exposes an `Api` bridge that drives parse -> build -> package for dropped demos.
"""
