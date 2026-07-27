# Proxy Trust Boundary

## Why this exists

Every security control that depends on "which client made this request" - rate
limiting, account lockout, IP blocking, threat scoring, audit evidence, and the guided
gateway-credential-attack scenario - ultimately reads a single value:
`getClientIp(request)` (`src/lib/requestContext.ts`), which returns Fastify's
`request.ip`.

`request.ip` is not the raw TCP socket address by default. Fastify can be told to trust
`X-Forwarded-For` and derive `request.ip` from it instead, which is necessary when the
app runs behind a real reverse proxy (a load balancer, CDN, or platform ingress) that
sets that header honestly. The previous configuration was:

```ts
trustProxy: true
```

This tells Fastify to trust `X-Forwarded-For` **from any direct client**, with no limit
on how many hops it will walk back through the header. A client that talks to the
gateway directly - or even one behind a real proxy, if the proxy doesn't strip
client-supplied `X-Forwarded-For` before appending its own - can put an arbitrary value
first in that header and have it accepted as the "real" client IP. That completely
defeats every IP-based control: an attacker can rotate through spoofed values to evade
rate limiting and lockout, or forge an IP that's specifically allowlisted, or poison the
audit trail with a fabricated source address for an action they actually took from
somewhere else.

## The fix: an explicit, environment-driven trust model

`src/lib/proxyTrust.ts` computes Fastify's `trustProxy` option from
`env.security.proxyTrust` (`PROXY_TRUST_MODE` + `PROXY_TRUST_HOP_COUNT` /
`PROXY_TRUST_CIDRS`, see `src/config/env.ts`). Four modes:

| Mode       | Fastify `trustProxy` value | Behavior                                                                                          |
| ---------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| `none`     | `false`                     | `request.ip` is always the direct TCP peer address. `X-Forwarded-For` is never consulted.            |
| `hopcount` | `PROXY_TRUST_HOP_COUNT`     | Trusts exactly that many hops, counted from the right (nearest) end of `X-Forwarded-For`.            |
| `cidr`     | `PROXY_TRUST_CIDRS`         | Trusts only forwarders whose address falls inside one of the listed CIDRs/addresses.                 |
| `azure`    | `PROXY_TRUST_HOP_COUNT`     | Preset alias for `hopcount`, defaulting `PROXY_TRUST_HOP_COUNT` to `1`. See below.                    |

`none` is the schema default (safe for local development, where the app is reached
directly). **Production refuses to boot with `PROXY_TRUST_MODE=none`** - this project's
documented deployment target (Azure Container Apps, see `Dockerfile` /
`terraform/modules/container-app`) always sits behind a platform ingress, so an
unconfigured production deployment would otherwise silently rate-limit/block by the
ingress's own address for every request rather than real client IPs. That's a
functional bug, not a spoofing hole (headers still wouldn't be trusted), but the
validation exists so it's caught at boot instead of discovered later as "why do all my
users share one rate limit."

### Why `azure` defaults to one hop

Azure Container Apps' front-end ingress terminates the inbound connection and forwards
to the container over its internal network, adding exactly one `X-Forwarded-For` entry
in the process. A container never sees a raw client connection directly - the ingress
hop is always present. If a CDN or Azure Front Door is placed in front of Container
Apps too, there are two hops before the app; set `PROXY_TRUST_HOP_COUNT=2` in that case.

### Why `hopcount`, not just "trust everything behind a proxy"

Hop-count trust (and CIDR trust) both still allow a client sitting *behind* the trusted
hop to put arbitrary junk earlier in `X-Forwarded-For` - that's fine, because only the
entry at the trusted hop position is ever read; anything the client itself supplied is
never the value used, no matter how the header is constructed. This is proxy-addr's
(Fastify's underlying IP-trust library) standard walk-from-the-right algorithm.

## `getClientIp` never falls back to headers

`src/lib/requestContext.ts#getClientIp` reads `request.ip` and, in the (practically
unreachable outside contrived test setups) case where it's empty, falls back to
`request.socket.remoteAddress` - the raw socket peer, never a header. There is
deliberately no code path anywhere in the app that reads `x-forwarded-for` or
`x-real-ip` directly for a security decision; every caller goes through this one
function, so the trust boundary is enforced in exactly one place.

## Deployment guidance

| Environment                                   | Setting                                                  |
| ---------------------------------------------- | --------------------------------------------------------- |
| Local development, direct access               | `PROXY_TRUST_MODE=none` (default)                          |
| Docker Compose demo (no reverse proxy)          | `PROXY_TRUST_MODE=none`                                    |
| Azure Container Apps (this project's target)    | `PROXY_TRUST_MODE=azure`                                   |
| Azure Container Apps behind Front Door/CDN too  | `PROXY_TRUST_MODE=azure`, `PROXY_TRUST_HOP_COUNT=2`         |
| Any other reverse proxy with a known IP/subnet  | `PROXY_TRUST_MODE=cidr`, `PROXY_TRUST_CIDRS=<subnet>`       |

## Test coverage

`test/proxyTrust.unit.test.ts` builds a throwaway Fastify app per scenario and asserts
the resolved `request.ip` end-to-end (not just the config mapping) for:

- A direct client sending a spoofed `X-Forwarded-For` under `none` - ignored.
- One trusted proxy (`hopcount:1`) - the client IP it reports is honored.
- Multiple chained forwarding entries - only the trusted hop position is read; anything
  further left (attacker-controlled) is ignored.
- Two trusted hops (`hopcount:2`).
- An untrusted proxy outside the configured CIDR - `X-Forwarded-For` is ignored, falls
  back to the connection address.
- Malformed/empty `X-Forwarded-For` - falls back safely instead of throwing.
- The `azure` preset, including the higher-hop-count CDN-in-front variant.

`test/env.unit.test.ts` covers the production boot-time validation
(`PROXY_TRUST_MODE=none` refused, `cidr` mode requires at least one CIDR).
