import fs from "node:fs/promises";
import path from "node:path";
import { confinePath } from "./path-confinement.js";
import {
    applyDocumentClassification,
    classifyEditorialDocument,
    createEmptyEditorialSummary
} from "./content-status.js";

const DOCUMENTS_DIR = "documents";

async function canAccess(target, mode) {
    try {
        await fs.access(target, mode);
        return true;
    } catch {
        return false;
    }
}

async function evaluateDirectory(target, missingParentMode) {
    const resolved = path.resolve(target);

    try {
        const stats = await fs.stat(resolved);

        if (!stats.isDirectory()) {
            return {
                status: "blocked",
                detail: `${path.basename(resolved)} exists but is not a directory`,
                path: resolved
            };
        }

        if ((stats.mode & 0o555) === 0) {
            return {
                status: "blocked",
                detail: `${path.basename(resolved)} is not readable/executable`,
                path: resolved
            };
        }

        const readable = await canAccess(resolved, fs.constants.R_OK | fs.constants.X_OK);
        return {
            status: readable ? "connected" : "blocked",
            detail: readable ? `${path.basename(resolved)} is readable` : `${path.basename(resolved)} cannot be read`,
            path: resolved
        };
    } catch (error) {
        if (error && error.code === "ENOENT") {
            const parent = path.dirname(resolved);
            const parentAccessible = await canAccess(parent, missingParentMode);
            return {
                status: parentAccessible ? "degraded" : "blocked",
                detail: parentAccessible
                    ? `${path.basename(resolved)} is missing; parent is accessible for future setup`
                    : `${path.basename(resolved)} is missing and parent is not accessible`,
                path: resolved
            };
        }

        return {
            status: "blocked",
            detail: error.message || `${path.basename(resolved)} cannot be checked`,
            path: resolved
        };
    }
}

async function listJsonFiles(root, current = root, results = []) {
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
        const nextPath = path.join(current, entry.name);

        if (entry.isDirectory()) {
            await listJsonFiles(root, nextPath, results);
            continue;
        }

        if (entry.isFile() && entry.name.endsWith(".json")) {
            results.push(path.relative(root, nextPath));
        }
    }

    return results;
}

function pushMalformedDiagnostic(summary, code, detail) {
    summary.diagnostics.push({
        level: "blocked",
        code,
        detail,
        area: "system"
    });
}

async function readDocument(documentsRoot, relativePath, config) {
    const filePath = await confinePath({
        root: documentsRoot,
        candidate: relativePath,
        publicRoots: [config.publicAssetRoot]
    });
    const raw = await fs.readFile(filePath, "utf8");

    return JSON.parse(raw);
}

export async function evaluateEditorialSummary(config = {}) {
    const contentRoot = path.resolve(config.contentRoot || "");
    const contentRootState = await evaluateDirectory(contentRoot, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);

    if (contentRootState.status === "blocked") {
        return createEmptyEditorialSummary("blocked", contentRootState.detail, []);
    }

    if (contentRootState.status === "degraded") {
        return createEmptyEditorialSummary("degraded", contentRootState.detail, []);
    }

    let documentsRoot;
    try {
        documentsRoot = await confinePath({
            root: contentRoot,
            candidate: DOCUMENTS_DIR,
            publicRoots: [config.publicAssetRoot]
        });
    } catch (error) {
        return createEmptyEditorialSummary("blocked", error.message || "documents directory cannot be confined", []);
    }

    const documentsState = await evaluateDirectory(documentsRoot, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
    if (documentsState.status === "blocked") {
        return createEmptyEditorialSummary("blocked", documentsState.detail, []);
    }

    if (documentsState.status === "degraded") {
        return createEmptyEditorialSummary("degraded", documentsState.detail, []);
    }

    const summary = createEmptyEditorialSummary("connected", "read-only editorial overview loaded from private content documents", []);
    const files = await listJsonFiles(documentsRoot);

    for (const relativePath of files) {
        try {
            const document = await readDocument(documentsRoot, relativePath, config);
            const classification = classifyEditorialDocument(document, summary.diagnostics);
            applyDocumentClassification(summary, classification);
        } catch (error) {
            pushMalformedDiagnostic(summary, "malformed-json", "malformed JSON document ignored");
        }
    }

    return summary;
}
