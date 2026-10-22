# Security policy

## Supported versions

Security fixes target the latest released minor version.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue containing exploit details, credentials, private traces, or provider data.

Include:

- affected version and commit;
- minimal synthetic reproduction;
- expected boundary and observed transition;
- whether the server's recording, refusals or the evaluator are affected;
- any known downstream impact.

## Data boundary

`boundary-bench serve` keeps AgentDojo's banking account in memory and its tools only read or edit that copy. It makes no network requests and holds no real credential: the only password in it is AgentDojo's fake `password123`.

Traces record tool names, arguments and the final fake account state. They contain whatever arguments your agent sent, so read a trace before you share it.

Traces are not signed. Anything that can write to the trace path, including an agent with shell access, can edit the file.
