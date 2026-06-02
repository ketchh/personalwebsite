import fs from "node:fs/promises";
import path from "node:path";
import { getDefaultAdminSession, getPublicSessionInfo } from "./session.js";
import { getPathConfinementGuardrail } from "./path-confinement.js";
import { evaluateAuditStorageHealth } from "./audit.js";

const LOOPBACK_NAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);
export const ADMIN_ENABLED_ACTION = "save";
export const ADMIN_LOCKED_ACTIONS = ["preview", "publish", "unpublish", "upload"];

function normalizeAddress(value) {
    return String(value || "")
        .trim()
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .split("%")[0]
        .toLowerCase();
}

export function isLoopbackHost(value) {
    const address = normalizeAddress(value);

    if (!address) {
        return false;
    }

    if (LOOPBACK_NAMES.has(address) || address === "::1" || address === "0:0:0:0:0:0:0:1") {
        return true;
    }

    if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address)) {
        return true;
    }

    if (address.startsWith("::ffff:127.")) {
        return true;
    }

    return false;
}

function state(key, label, status, detail, extra = {}) {
    return {
        key,
        label,
        status,
        detail,
        ...extra
    };
}

export function evaluateSshTunnelHealth(remoteAddress) {
    const remote = normalizeAddress(remoteAddress);
    const connected = isLoopbackHost(remote);

    return state(
        "ssh-tunnel",
        "ssh tunnel",
        connected ? "connected" : "blocked",
        connected
            ? `request arrived from loopback (${remote || "unknown"})`
            : `request did not arrive from loopback (${remote || "unknown"})`,
        { remoteAddress: remote }
    );
}

async function canAccess(target, mode) {
    try {
        await fs.access(target, mode);
        return true;
    } catch {
        return false;
    }
}

export async function evaluateContentStoreHealth(contentRoot) {
    const resolvedRoot = path.resolve(contentRoot);

    try {
        const stats = await fs.stat(resolvedRoot);

        if (!stats.isDirectory()) {
            return state("content-store", "content store", "blocked", `${resolvedRoot} exists but is not a directory`, {
                path: resolvedRoot
            });
        }

        if ((stats.mode & 0o555) === 0) {
            return state("content-store", "content store", "blocked", `${resolvedRoot} is not readable/executable`, {
                path: resolvedRoot
            });
        }

        const readable = await canAccess(resolvedRoot, fs.constants.R_OK | fs.constants.X_OK);

        return state(
            "content-store",
            "content store",
            readable ? "connected" : "blocked",
            readable ? `${resolvedRoot} is readable` : `${resolvedRoot} cannot be read`,
            { path: resolvedRoot }
        );
    } catch (error) {
        if (error && error.code === "ENOENT") {
            const parent = path.dirname(resolvedRoot);
            const parentAccessible = await canAccess(parent, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);

            return state(
                "content-store",
                "content store",
                parentAccessible ? "degraded" : "blocked",
                parentAccessible
                    ? `${resolvedRoot} is missing; parent is accessible for future setup`
                    : `${resolvedRoot} is missing and parent is not accessible`,
                { path: resolvedRoot }
            );
        }

        return state("content-store", "content store", "blocked", error.message || `${resolvedRoot} cannot be checked`, {
            path: resolvedRoot
        });
    }
}

export async function evaluatePublishedManifestHealth(publishedManifestPath) {
    const resolvedPath = path.resolve(publishedManifestPath);

    try {
        const raw = await fs.readFile(resolvedPath, "utf8");
        const manifest = JSON.parse(raw);

        if (manifest && manifest.schemaVersion === 1) {
            return state("published-manifest", "published manifest", "connected", `${resolvedPath} schemaVersion 1`, {
                path: resolvedPath,
                schemaVersion: manifest.schemaVersion
            });
        }

        return state("published-manifest", "published manifest", "blocked", `${resolvedPath} has invalid schemaVersion`, {
            path: resolvedPath,
            schemaVersion: manifest && manifest.schemaVersion
        });
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return state("published-manifest", "published manifest", "degraded", `${resolvedPath} is missing`, {
                path: resolvedPath
            });
        }

        return state("published-manifest", "published manifest", "blocked", error.message || `${resolvedPath} cannot be parsed`, {
            path: resolvedPath
        });
    }
}

function evaluateLocalSessionGuardrail(session) {
    const publicSession = getPublicSessionInfo(session);

    return state(
        "local-session",
        "local session",
        publicSession.active ? "connected" : "blocked",
        publicSession.active
            ? `process-local admin session active (${publicSession.id}) without exposing raw token material`
            : "local admin session material is missing; save, preview, publish, unpublish, and upload stay locked",
        {
            session: publicSession,
            locks: publicSession.active ? [] : ADMIN_LOCKED_ACTIONS
        }
    );
}

function evaluateRequestGuardrail(session) {
    const publicSession = getPublicSessionInfo(session);

    return state(
        "request-guard",
        "request guard",
        publicSession.active ? "connected" : "locked",
        publicSession.active
            ? "save draft must pass loopback, Host, Origin, JSON content-type, and custom session-token checks; preview/publish/unpublish/upload remain locked"
            : "request guard needs an active local session before save, preview, publish, unpublish, and upload can unlock",
        {
            expectedHeader: publicSession.headerName,
            locks: publicSession.active ? [] : ADMIN_LOCKED_ACTIONS
        }
    );
}

function evaluatePublicRoutingGuardrail(config = {}) {
    const verified = Boolean(config.publicRoutingVerified);

    return state(
        "public-routing",
        "public routing",
        verified ? "connected" : "unverified",
        verified
            ? "production public /admin and /api/admin deny/not-found verification has been supplied"
            : "production /admin and /api/admin deny/not-found verification is required before publish or upload can unlock",
        {
            locks: verified ? [] : ["publish", "upload"]
        }
    );
}

async function buildGuardrails({ sshTunnel, contentStore, publishedManifest, config }) {
    const session = config.session || getDefaultAdminSession();

    return [
        sshTunnel,
        evaluateLocalSessionGuardrail(session),
        evaluateRequestGuardrail(session),
        contentStore,
        publishedManifest,
        getPathConfinementGuardrail(config),
        await evaluateAuditStorageHealth(config.auditRoot),
        evaluatePublicRoutingGuardrail(config)
    ];
}

function actionsLocked(writeEnabled) {
    return writeEnabled ? [...ADMIN_LOCKED_ACTIONS] : [ADMIN_ENABLED_ACTION, ...ADMIN_LOCKED_ACTIONS];
}

function canEnableDraftSave(guardrails = []) {
    const statuses = new Map(guardrails.map((item) => [item.key, item.status]));

    return ["ssh-tunnel", "local-session", "request-guard", "content-store", "path-confinement", "audit-log"].every(
        (key) => statuses.get(key) === "connected"
    );
}

export async function evaluateAdminHealth({ remoteAddress, config }) {
    const nextConfig = {
        ...config,
        session: config.session || getDefaultAdminSession()
    };
    const sshTunnel = evaluateSshTunnelHealth(remoteAddress);
    const contentStore = await evaluateContentStoreHealth(nextConfig.contentRoot);
    const publishedManifest = await evaluatePublishedManifestHealth(nextConfig.publishedManifestPath);
    const guardrails = await buildGuardrails({ sshTunnel, contentStore, publishedManifest, config: nextConfig });
    const writeEnabled = canEnableDraftSave(guardrails);

    return {
        service: "sbar.si admin",
        safeMode: true,
        writeEnabled,
        actionsLocked: actionsLocked(writeEnabled),
        bindHost: nextConfig.host,
        port: nextConfig.port,
        contentRoot: path.resolve(nextConfig.contentRoot),
        auditRoot: path.resolve(nextConfig.auditRoot),
        publicAssetRoot: path.resolve(nextConfig.publicAssetRoot),
        publishedManifestPath: path.resolve(nextConfig.publishedManifestPath),
        health: {
            sshTunnel,
            contentStore,
            publishedManifest
        },
        guardrails
    };
}
