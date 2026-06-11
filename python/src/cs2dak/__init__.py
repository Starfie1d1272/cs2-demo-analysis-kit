"""cs2dak — CS2 .dem -> cs2-demo-format v2 ZIP.

Pipeline: .dem --(parse_worker via demoparser2)--> raw rows --(exporter)--> ZIP.
"""

__version__ = "0.4.0"

# The contract this exporter targets. Must match cs2-demo-format manifest.
SCHEMA_VERSION = "cs2-demo-format/2.0"
