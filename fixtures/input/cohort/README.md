# Cohort Fixtures

These ZIPs are sanitized from real tournament exports for cross-match aggregation tests.

Important: steam IDs must be sanitized with one global mapping across all ZIPs. Running
`python/scripts/sanitize_export_zip.py` independently for each source ZIP is not enough
for cohort fixtures because it can remap different real players to the same fake ID.
