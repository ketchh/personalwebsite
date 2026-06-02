import fs from "node:fs/promises";
import path from "node:path";

function isInside(root, target) {
    const relative = path.relative(root, target);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function realpathIfExists(target) {
    try {
        return await fs.realpath(target);
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return path.resolve(target);
        }
        throw error;
    }
}

async function assertNoSymlinkEscape(rootReal, target) {
    const relative = path.relative(rootReal, target);
    const segments = relative ? relative.split(path.sep).filter(Boolean) : [];

    for (let index = 0; index < segments.length; index += 1) {
        const probe = path.join(rootReal, ...segments.slice(0, index + 1));

        try {
            const stats = await fs.lstat(probe);

            if (stats.isSymbolicLink()) {
                const real = await fs.realpath(probe);
                if (!isInside(rootReal, real)) {
                    throw new Error(`Path confinement rejected symlink escape: ${probe}`);
                }
            }
        } catch (error) {
            if (error && error.code === "ENOENT") {
                return;
            }
            throw error;
        }
    }
}

async function resolvePublicRoots(publicRoots) {
    const roots = [];

    for (const publicRoot of publicRoots || []) {
        if (!publicRoot) {
            continue;
        }
        roots.push(await realpathIfExists(publicRoot));
    }

    return roots;
}

export async function confinePath({ root, candidate, publicRoots = [] }) {
    if (!root || typeof root !== "string") {
        throw new Error("Path confinement requires a private root.");
    }

    if (!candidate || typeof candidate !== "string") {
        throw new Error("Path confinement requires a candidate path.");
    }

    const rootReal = await fs.realpath(root);
    const publicRootReals = await resolvePublicRoots(publicRoots);

    if (publicRootReals.some((publicRoot) => isInside(publicRoot, rootReal))) {
        throw new Error("Path confinement rejected private root inside public root crossover.");
    }

    const target = path.isAbsolute(candidate)
        ? path.resolve(candidate)
        : path.resolve(rootReal, candidate);

    if (!isInside(rootReal, target)) {
        throw new Error("Path confinement rejected traversal outside configured private root.");
    }

    if (publicRootReals.some((publicRoot) => isInside(publicRoot, target))) {
        throw new Error("Path confinement rejected private-to-public root crossover.");
    }

    await assertNoSymlinkEscape(rootReal, target);

    const targetReal = await realpathIfExists(target);
    if (!isInside(rootReal, targetReal)) {
        throw new Error("Path confinement rejected resolved path outside configured private root.");
    }

    if (publicRootReals.some((publicRoot) => isInside(publicRoot, targetReal))) {
        throw new Error("Path confinement rejected resolved public root crossover.");
    }

    return target;
}

export function getPathConfinementGuardrail(config = {}) {
    const hasRoots = Boolean(config.contentRoot && config.auditRoot && config.publicAssetRoot);

    return {
        key: "path-confinement",
        label: "path confinement",
        status: hasRoots ? "connected" : "locked",
        detail: hasRoots
            ? "private content and audit roots are configured; future file access must pass canonical confinement checks"
            : "private roots are incomplete, so save, preview, publish, unpublish, and upload stay locked",
        locks: hasRoots ? [] : ["save", "preview", "publish", "unpublish", "upload"]
    };
}
