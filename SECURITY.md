# Security policy

## Supported versions

Security fixes target the latest released minor version.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue containing exploit details, credentials, private traces, or provider data.

Include:

- affected version and commit;
- minimal synthetic reproduction;
- expected boundary and observed transition;
- whether receipt verification, redaction, or signature handling is affected;
- any known downstream impact.

## Data boundary

The committed fixture pack is synthetic and credential-free. BoundaryBench rejects common raw-body field names, but that is defense in depth—not a data-loss-prevention guarantee. Recorders must remove prompts, responses, headers, tokens, secrets, and customer data before adapter ingestion.

The CLI reads and writes local files only. The reference benchmark performs no network requests and runs no external candidate process.
