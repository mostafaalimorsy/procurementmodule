# API boundary

Use same-origin `/api/v1` URLs. The development proxy and deployment reverse proxy own the backend address; browser bundles contain no secrets or environment-specific API hosts.

Generate the typed business API client from the backend OpenAPI document when the first business endpoints exist. Do not hand-maintain a competing business schema. The bootstrap session and health adapters are intentionally small.

The API returns RFC Problem Details. Future forms should map validation details deliberately and show a safe fallback on unrecognized failures. Never render raw server errors as HTML.
