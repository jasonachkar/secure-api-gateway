# API Reference

The full OpenAPI specification for every endpoint this gateway exposes -
authentication, admin/security control-plane routes, and the proxied upstream routes.

This is rendered directly from [`openapi/openapi.yaml`](https://github.com/jasonachkar/secure-api-gateway/blob/main/openapi/openapi.yaml)
in the repository, the same spec served live by the running gateway at `/docs` (Swagger
UI, when `ENABLE_SWAGGER=true`). Both are built from the same source file, so they never
drift apart.

!!swagger ../openapi/openapi.yaml!!
