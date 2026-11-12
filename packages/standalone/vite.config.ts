import { createHash } from "node:crypto";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin, ProxyOptions } from "vite";

const upstream = process.env.VITE_API_UPSTREAM ?? "http://localhost:8443";

// ADR-009 live E2E only: kubernaut's e2e overlay (Dex + AF) serves a
// self-signed cert. Opt-in and explicit rather than relying on the
// spawning process's NODE_TLS_REJECT_UNAUTHORIZED — default (`secure: true`)
// is unchanged for local dev / standalone deploys against a real AF.
const secure = process.env.VITE_API_INSECURE_TLS !== "true";

type JsonRecord = Record<string, unknown>;

type LiveDexAuth = {
  token: string;
  userinfo: JsonRecord;
};

const LIVE_DEX_URL = process.env.LIVE_E2E_DEX_URL;

function validClaim(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2048 && value.trim() === value;
}

function decodeJwtPayload(token: string): JsonRecord {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Live E2E Dex token is not a JWT");
  }

  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("payload is not an object");
    }
    return parsed as JsonRecord;
  } catch {
    throw new Error("Live E2E Dex token has an invalid payload");
  }
}

async function loadLiveDexAuth(): Promise<LiveDexAuth | undefined> {
  if (!LIVE_DEX_URL) return undefined;

  const { fetchDexToken } = await import("../../e2e/live/scripts/dex-token.mjs");
  const token = await fetchDexToken({ dexUrl: LIVE_DEX_URL });
  const claims = decodeJwtPayload(token);
  const iss = claims.iss;
  const sub = claims.sub;
  if (!validClaim(iss) || !validClaim(sub)) {
    throw new Error("Live E2E Dex token is missing required issuer or subject claims");
  }

  // Dex's test ID token is the trusted source for this process-local identity.
  // Do not send the token or the complete claims object to the browser. If Dex
  // does not emit `sid`, use a non-reversible token fingerprint as the opaque
  // session discriminator required by ProxyAuthProvider.
  const sid = validClaim(claims.sid)
    ? claims.sid
    : createHash("sha256").update(token).digest("hex");
  const preferredUsername = validClaim(claims.preferred_username) ? claims.preferred_username : undefined;
  const email = validClaim(claims.email) ? claims.email : undefined;
  const name = validClaim(claims.name) ? claims.name : preferredUsername ?? email;

  return {
    token,
    userinfo: {
      ...(preferredUsername ? { preferredUsername } : {}),
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
      additionalClaims: { iss, sub, sid },
    },
  };
}

function authenticatedProxy(target: string, auth: LiveDexAuth | undefined): ProxyOptions {
  const proxy: ProxyOptions = { target, changeOrigin: true, secure };
  if (auth) {
    proxy.configure = (server) => {
      server.on("proxyReq", (proxyReq) => {
        // The browser sends no bearer token. This header exists only on the
        // server-side hop from Vite to API Frontend.
        proxyReq.setHeader("Authorization", `Bearer ${auth.token}`);
      });
    };
  }
  return proxy;
}

function liveUserinfoPlugin(auth: LiveDexAuth): Plugin {
  return {
    name: "kubernaut-live-e2e-userinfo",
    configureServer(server) {
      server.middlewares.use("/oauth2/userinfo", (request, response, next) => {
        if (request.method !== "GET") {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify(auth.userinfo));
      });
    },
  };
}

export default defineConfig(async () => {
  const liveAuth = await loadLiveDexAuth();

  return {
    plugins: [react(), ...(liveAuth ? [liveUserinfoPlugin(liveAuth)] : [])],
    server: {
      proxy: {
        "/a2a": authenticatedProxy(upstream, liveAuth),
        "/mcp": authenticatedProxy(upstream, liveAuth),
        "/.well-known": authenticatedProxy(upstream, liveAuth),
      },
    },
  };
});
