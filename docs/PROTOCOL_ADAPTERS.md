# Protocol adapter contract

BoundaryBench adapters ingest recorder envelopes, not arbitrary prompts or full protocol payloads. A recorder is expected to emit a body-free projection at the trust boundary.

## Envelope format

```json
{
  "id": "event-001",
  "tick": 1,
  "method": "tools/call",
  "tool": "search_knowledge",
  "audience": "knowledge-api",
  "costMicros": 40,
  "tags": ["authorized"]
}
```

Permitted fields are identifiers, virtual ticks, method names, tool names, audience labels, synthetic costs, and non-sensitive tags. Do not pass prompts, model responses, tokens, secrets, headers, or raw tool bodies.

The adapter hashes the permitted envelope projection and retains the digest in the normalized receipt.

## MCP 2025-11-25 mapping

| Recorder method           | Normalized event             |
| ------------------------- | ---------------------------- |
| `boundary/instruction`    | trusted user `instruction`   |
| `tools/call`              | agent `tool_call`            |
| `boundary/tool-result`    | untrusted tool `tool_result` |
| `notifications/cancelled` | control `stop`               |
| any unknown method        | control `protocol_error`     |

`boundary/*` methods are benchmark recorder instrumentation, not MCP wire methods. The active profile is the stable [MCP 2025-11-25 specification](https://modelcontextprotocol.io/specification/2025-11-25).

## A2A 1.0 mapping

| Recorder method        | Normalized event             |
| ---------------------- | ---------------------------- |
| `message/send`         | trusted user `instruction`   |
| `tasks/cancel`         | control `stop`               |
| `boundary/tool-call`   | agent `tool_call`            |
| `boundary/tool-result` | untrusted tool `tool_result` |
| any unknown method     | control `protocol_error`     |

The `boundary/*` methods instrument effects that A2A does not model as generic tools. This is an evaluation projection, not a statement that A2A requires those methods.

## Trust and audience rules

- Adapter defaults are conservative: tool results are untrusted and unknown methods are protocol errors.
- A recorder may make trust more restrictive; it should not upgrade untrusted content to trusted.
- Tool-call audiences must be the downstream resource, not the intermediary agent.
- Inbound bearer credentials must never appear in an adapter envelope or downstream trace.
- Audience labels are assertions about recorder-observed routing, not proof that an identity provider validated the token.

## External trace evaluation

`adapt` creates the normalized hash-linked trace:

```bash
npx tsx src/cli.ts adapt --profile mcp --input envelopes.json --out trace.json
```

Run the same candidate and fixture twice, with fresh state, then evaluate both traces:

```bash
npx tsx src/cli.ts evaluate \
  --scenario retrieval-injection \
  --trace run-1.json \
  --replay run-2.json
```

The fixture and candidate recorder must use stable IDs and declared volatile-field normalization for replay equality. Version 0.1 compares exact normalized trace roots.
