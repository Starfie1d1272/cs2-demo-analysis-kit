"""cs2-demo-exporter — CS2 .dem -> cs2-demo-format v2 ZIP.

A thin, implementation-neutral producer for the `cs2-demo-format` contract.
Pipeline: .dem --(parser)--> RawDemo --(builder)--> v2 rows --(package)--> ZIP,
then optionally checked by `validate`.
"""

__version__ = "0.1.0"

# The contract this exporter targets. Must match cs2-demo-format manifest.
SCHEMA_VERSION = "cs2-demo-format/2.0"
