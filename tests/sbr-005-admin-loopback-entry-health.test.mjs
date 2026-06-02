import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
    createAdminConfig,
    createAdminServer,
    buildAdminResponse,
    startAdminServer
} from "../admin/server.js";
import {
    evaluateAdminHealth,
    evaluateContentStoreHealth,
    evaluatePublishedManifestHealth,
    isLoopbackHost
} from "../admin/health.js";

async function withTempDir(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sbr-005-admin-"));
    try {
        return await fn(root);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}

async function getText(baseUrl, pathname, options) {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    return { response, text: await response.text() };
}

async function getJson(baseUrl, pathname, options) {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    return { response, json: await response.json() };
}

assert.equal(isLoopbackHost("127.0.0.1"), true, "127.0.0.1 is accepted as loopback");
assert.equal(isLoopbackHost("localhost"), true, "localhost is accepted as loopback");
assert.equal(isLoopbackHost("::1"), true, "::1 is accepted as loopback");
assert.equal(isLoopbackHost("0.0.0.0"), false, "0.0.0.0 is rejected as non-loopback");
assert.equal(isLoopbackHost("192.0.2.10"), false, "public interface hosts are rejected as non-loopback");

{
    const defaults = createAdminConfig({});
    assert.equal(defaults.host, "127.0.0.1", "admin service defaults to 127.0.0.1");
    assert.equal(defaults.port, 8787, "admin service defaults to port 8787");
    assert.throws(() => createAdminServer({ host: "0.0.0.0" }), /loopback/i, "server refuses 0.0.0.0 bind host");
    assert.throws(() => createAdminServer({ host: "198.51.100.4" }), /loopback/i, "server refuses public bind host");
}

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    await fs.mkdir(contentRoot);
    const config = createAdminConfig({
        host: "127.0.0.1",
        port: 0,
        contentRoot,
        publishedManifestPath: path.resolve("data/published.json")
    });
    const running = await startAdminServer(config);
    const baseUrl = `http://${running.host}:${running.port}`;

    try {
        const { response, text } = await getText(baseUrl, "/admin");
        assert.equal(response.status, 200, "GET /admin succeeds through loopback");
        assert.match(text, /data-shell-nav="sections"/i, "private /admin reuses the shared shell nav");
        assert.match(text, /data-admin-overlay-shell/i, "private /admin is machine-identifiable as an overlay shell");
        assert.match(text, /admin mode \/ connected/i, "private /admin names connected admin mode");
        assert.match(text, /write locked|write state \/ locked/i, "private /admin states locked write capability honestly for this fixture");
        assert.match(text, /draft view \/ loading/i, "private /admin keeps draft state non-data-bearing on first paint");
        assert.match(text, /Diagnostics/i, "private /admin keeps the diagnostics entry visible");
        assert.match(text, /href="styles\.css"/i, "private /admin reuses the shared shell stylesheet");
        assert.match(text, /href="\/admin\/overlay\.css"/i, "private /admin loads the overlay-only stylesheet");

        const health = await getJson(baseUrl, "/api/admin/health");
        assert.equal(health.response.status, 200, "GET /api/admin/health succeeds through loopback");
        assert.equal(health.json.writeEnabled, false, "admin health reports writeEnabled=false when save guardrails are incomplete");
        assert.equal(health.json.bindHost, "127.0.0.1", "admin health reports effective bind host");
        assert.equal(health.json.contentRoot, contentRoot, "admin health reports configured content root");
        assert.equal(health.json.publishedManifestPath, path.resolve("data/published.json"), "admin health reports published manifest path");
        assert.equal(health.json.health.sshTunnel.status, "connected", "health JSON mirrors ssh tunnel state");
        assert.equal(health.json.health.contentStore.status, "connected", "health JSON mirrors content store state");
        assert.equal(health.json.health.publishedManifest.status, "connected", "health JSON mirrors manifest state");

        const beforeEntries = await fs.readdir(contentRoot);
        for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
            const writeAttempt = await fetch(`${baseUrl}/api/admin/health`, { method, body: "blocked" });
            assert.ok(!writeAttempt.ok, `${method} /api/admin/health returns non-2xx`);
            const adminWriteAttempt = await fetch(`${baseUrl}/admin`, { method, body: "blocked" });
            assert.ok(!adminWriteAttempt.ok, `${method} /admin returns non-2xx`);
        }
        assert.deepEqual(await fs.readdir(contentRoot), beforeEntries, "admin write attempts do not create or mutate content-root files");
    } finally {
        await running.close();
    }
});

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    await fs.mkdir(contentRoot);
    const config = createAdminConfig({
        contentRoot,
        publishedManifestPath: path.resolve("data/published.json")
    });
    const blocked = await buildAdminResponse({
        method: "GET",
        url: "/admin",
        remoteAddress: "203.0.113.10",
        config
    });

    assert.equal(blocked.statusCode, 403, "non-loopback admin dashboard request is blocked");
    assert.match(blocked.body, /blocked|ssh tunnel|loopback/i, "blocked dashboard explains loopback/SSH requirement");
    assert.doesNotMatch(blocked.body, /data-health="content-store"|data-health="published-manifest"/, "blocked dashboard does not render a partial health dashboard");

    const blockedHealth = await evaluateAdminHealth({
        remoteAddress: "203.0.113.10",
        config
    });
    assert.equal(blockedHealth.health.sshTunnel.status, "blocked", "non-loopback metadata yields blocked ssh tunnel health");
});

await withTempDir(async (tempRoot) => {
    const connectedRoot = path.join(tempRoot, "connected");
    await fs.mkdir(connectedRoot);
    assert.equal((await evaluateContentStoreHealth(connectedRoot)).status, "connected", "readable existing content root is connected");

    const missingRoot = path.join(tempRoot, "missing");
    assert.equal((await evaluateContentStoreHealth(missingRoot)).status, "degraded", "missing content root with accessible parent is degraded");

    const blockedRoot = path.join(tempRoot, "blocked");
    await fs.mkdir(blockedRoot);
    await fs.chmod(blockedRoot, 0o000);
    try {
        assert.equal((await evaluateContentStoreHealth(blockedRoot)).status, "blocked", "unreadable existing content root is blocked");
    } finally {
        await fs.chmod(blockedRoot, 0o700);
    }
});

await withTempDir(async (tempRoot) => {
    const validManifest = path.join(tempRoot, "published.json");
    const missingManifest = path.join(tempRoot, "missing.json");
    const malformedManifest = path.join(tempRoot, "malformed.json");
    const invalidManifest = path.join(tempRoot, "invalid.json");

    await fs.writeFile(validManifest, JSON.stringify({ schemaVersion: 1 }));
    await fs.writeFile(malformedManifest, "{ nope");
    await fs.writeFile(invalidManifest, JSON.stringify({ schemaVersion: 2 }));

    assert.equal((await evaluatePublishedManifestHealth(validManifest)).status, "connected", "schemaVersion 1 manifest is connected");
    assert.equal((await evaluatePublishedManifestHealth(missingManifest)).status, "degraded", "missing manifest is degraded");
    assert.equal((await evaluatePublishedManifestHealth(malformedManifest)).status, "blocked", "malformed manifest is blocked");
    assert.equal((await evaluatePublishedManifestHealth(invalidManifest)).status, "blocked", "schema-invalid manifest is blocked");
});

{
    const indexHtml = await fs.readFile("index.html", "utf8");
    const publicScript = await fs.readFile("script.js", "utf8");

    assert.doesNotMatch(indexHtml, /\/admin|admin\/server|admin dashboard/i, "public index does not link to or render admin dashboard");
    assert.doesNotMatch(publicScript, /admin\/|api\/admin|admin dashboard/i, "public script does not import or render admin dashboard");
    assert.match(indexHtml, /#\/resume/, "public Resume route remains present");
    assert.match(indexHtml, /#\/blog/, "public Blog route remains present");
    assert.match(indexHtml, /#\/resources/, "public Resources route remains present");
}

{
    const readme = await fs.readFile("README.md", "utf8");
    assert.match(readme, /node\s+admin\/server\.js/, "README documents how to start the admin service");
    assert.match(readme, /ssh\s+-L\s+8787:127\.0\.0\.1:8787/, "README documents SSH local port forwarding for admin access");
    assert.match(readme, /public Nginx must not proxy `\/admin` or `\/api\/admin`/i, "README documents that admin routes stay off the public proxy");
    assert.match(readme, /Preview rendering, sanitized Markdown output, Publish\/export, Unpublish export, Upload parsing\/storage/i, "README documents locked future admin capabilities");
    assert.match(readme, /public manifest writes/i, "README documents that public manifest writes stay locked");
}

console.log("SBR-005 admin loopback entry health assertions passed");
