import type { D1Migration } from "cloudflare:test";

// `env` from cloudflare:workers is typed as Cloudflare.Env, so test-only
// bindings must augment the Cloudflare namespace (not the bare global Env).
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_KV: KVNamespace;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
