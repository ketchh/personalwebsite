import fs from "node:fs/promises";
import path from "node:path";
import { confinePath } from "./path-confinement.js";

export const AUDIT_LOG_RELATIVE_PATH = "admin-actions.ndjson";

function isoTimestamp(value) {
    if (value) {
        return value;
    }

    return new Date().toISOString();
}

function cleanString(value) {
    if (typeof value !== "string") {
        return undefined;
    }

    return value.slice(0, 200);
}

function cleanTarget(target = {}) {
    const nextTarget = {};

    if (typeof target.id === "string" && target.id) {
        nextTarget.id = target.id;
    }

    if (typeof target.path === "string" && target.path) {
        nextTarget.path = target.path;
    }

    return nextTarget;
}

async function canAccess(target, mode) {
    try {
        await fs.access(target, mode);
        return true;
    } catch {
        return false;
    }
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

function cleanReasons(reasons = []) {
    if (!Array.isArray(reasons)) {
        return [];
    }

    return reasons
        .filter((item) => item && typeof item.code === "string" && item.code)
        .map((item) => ({
            code: item.code,
            ...(item.field ? { field: cleanString(item.field) } : {}),
            ...(item.path ? { path: cleanString(item.path) } : {})
        }));
}

async function atomicRewriteFile(targetPath, nextContent) {
    const directory = path.dirname(targetPath);
    const tempPath = path.join(directory, `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    await fs.writeFile(tempPath, nextContent, "utf8");

    try {
        await fs.rename(tempPath, targetPath);
    } catch (error) {
        await fs.rm(tempPath, { force: true });
        throw error;
    }
}

export function createAuditRecord({ timestamp, action, result, target, reasons } = {}) {
    return {
        timestamp: isoTimestamp(timestamp),
        action: cleanString(action) || "unknown",
        result: cleanString(result) || "unknown",
        target: cleanTarget(target),
        reasons: cleanReasons(reasons)
    };
}

export async function evaluateAuditStorageHealth(auditRoot) {
    const resolvedRoot = path.resolve(auditRoot || "");

    try {
        const stats = await fs.stat(resolvedRoot);

        if (!stats.isDirectory()) {
            return state("audit-log", "audit log", "blocked", `${resolvedRoot} exists but is not a directory`, {
                path: resolvedRoot,
                locks: ["save", "preview", "publish", "unpublish", "upload"]
            });
        }

        const accessible = await canAccess(resolvedRoot, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);

        return state(
            "audit-log",
            "audit log",
            accessible ? "connected" : "blocked",
            accessible
                ? `${resolvedRoot} is writable for redacted audit appends`
                : `${resolvedRoot} is not writable for redacted audit appends`,
            {
                path: resolvedRoot,
                locks: accessible ? [] : ["save", "preview", "publish", "unpublish", "upload"]
            }
        );
    } catch (error) {
        if (error && error.code === "ENOENT") {
            const parent = path.dirname(resolvedRoot);
            const parentAccessible = await canAccess(parent, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);

            return state(
                "audit-log",
                "audit log",
                parentAccessible ? "degraded" : "blocked",
                parentAccessible
                    ? `${resolvedRoot} is missing; save stays unavailable until audit storage exists`
                    : `${resolvedRoot} is missing and parent is not accessible`,
                {
                    path: resolvedRoot,
                    locks: ["save", "preview", "publish", "unpublish", "upload"]
                }
            );
        }

        return state("audit-log", "audit log", "blocked", error.message || `${resolvedRoot} cannot be checked`, {
            path: resolvedRoot,
            locks: ["save", "preview", "publish", "unpublish", "upload"]
        });
    }
}

export function getAuditReadinessGuardrail(config = {}) {
    const hasAuditRoot = Boolean(config.auditRoot);

    return {
        key: "audit-log",
        label: "audit log",
        status: hasAuditRoot ? "connected" : "locked",
        detail: hasAuditRoot
            ? "durable redacted audit storage is configured; raw tokens, request bodies, Markdown bodies, and field values stay excluded"
            : "durable redacted audit storage is required before save can mutate private content",
        locks: hasAuditRoot ? [] : ["save", "preview", "publish", "unpublish", "upload"]
    };
}

export async function appendAuditRecord({ config = {}, record } = {}) {
    const auditRoot = path.resolve(config.auditRoot || "");

    let auditPath;
    try {
        auditPath = await confinePath({
            root: auditRoot,
            candidate: AUDIT_LOG_RELATIVE_PATH,
            publicRoots: [config.publicAssetRoot]
        });
    } catch (error) {
        const nextError = new Error("audit root unavailable");
        nextError.code = "AUDIT_ROOT_UNAVAILABLE";
        nextError.cause = error;
        throw nextError;
    }

    let existing = "";
    try {
        existing = await fs.readFile(auditPath, "utf8");
    } catch (error) {
        if (!(error && error.code === "ENOENT")) {
            const nextError = new Error("audit write failed");
            nextError.code = "AUDIT_WRITE_FAILED";
            nextError.cause = error;
            throw nextError;
        }
    }

    const nextContent = `${existing}${JSON.stringify(createAuditRecord(record))}\n`;

    try {
        await atomicRewriteFile(auditPath, nextContent);
    } catch (error) {
        const nextError = new Error("audit write failed");
        nextError.code = "AUDIT_WRITE_FAILED";
        nextError.cause = error;
        throw nextError;
    }

    return auditPath;
}
