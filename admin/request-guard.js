import { isLoopbackHost } from "./health.js";
import { ADMIN_SESSION_HEADER, verifyAdminSessionToken } from "./session.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;|$)/i;

function normalizeHeader(value) {
    return String(value || "").trim();
}

function hostNameFromHeader(value) {
    const header = normalizeHeader(value).toLowerCase();

    if (!header) {
        return "";
    }

    if (header.startsWith("[")) {
        const end = header.indexOf("]");
        return end === -1 ? header : header.slice(1, end);
    }

    return header.split(":")[0];
}

function normalizeHostHeader(value) {
    return normalizeHeader(value).toLowerCase();
}

function reason(code, detail) {
    return { code, detail };
}

function isMutationMethod(method) {
    return MUTATION_METHODS.has(String(method || "GET").toUpperCase());
}

export function expectedAdminHost(config) {
    return `${config.host}:${config.port}`.toLowerCase();
}

export function expectedAdminOrigin(config) {
    return `http://${config.host}:${config.port}`.toLowerCase();
}

function configuredSessionHeaderName(options = {}) {
    return normalizeHeader(options.sessionHeaderName || (options.session && options.session.headerName) || ADMIN_SESSION_HEADER) || ADMIN_SESSION_HEADER;
}

export function evaluateAdminRequestGuard(options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const expectedHost = normalizeHostHeader(options.expectedHost || "");
    const expectedOrigin = normalizeHeader(options.expectedOrigin || "").toLowerCase();
    const hostHeader = normalizeHostHeader(options.hostHeader || "");
    const originHeader = normalizeHeader(options.originHeader || "").toLowerCase();
    const contentType = normalizeHeader(options.contentType || "");
    const tokenHeader = normalizeHeader(options.tokenHeader || "");
    const sessionHeaderName = configuredSessionHeaderName(options);
    const requireOrigin = options.requireOrigin !== false;
    const requireSessionToken = options.requireSessionToken !== false;
    const requireContentType = options.requireContentType !== false;
    const reasons = [];

    if (!isLoopbackHost(options.remoteAddress)) {
        reasons.push(reason("non-loopback-remote", "request remote address is not loopback"));
    }

    const hostName = hostNameFromHeader(hostHeader);
    if (!isLoopbackHost(hostName)) {
        reasons.push(reason("non-loopback-host", "Host header is not a loopback host"));
    } else if (expectedHost && hostHeader !== expectedHost) {
        reasons.push(reason("host-mismatch", "Host header does not match the configured admin origin"));
    }

    if (method === "OPTIONS") {
        reasons.push(reason("cors-preflight-blocked", "admin APIs do not accept CORS preflight requests"));
    }

    if (requireOrigin) {
        if (!originHeader) {
            reasons.push(reason("origin-missing", "browser mutation requests must include the same admin Origin"));
        } else if (expectedOrigin && originHeader !== expectedOrigin) {
            reasons.push(reason("origin-mismatch", "Origin does not match the configured admin origin"));
        }
    }

    if (requireSessionToken) {
        if (!tokenHeader) {
            reasons.push(reason("session-token-missing", `missing ${sessionHeaderName} header`));
        } else if (!verifyAdminSessionToken(options.session, tokenHeader)) {
            reasons.push(reason("session-token-invalid", "session token header does not match the active local session"));
        }
    }

    if (requireContentType && isMutationMethod(method) && !JSON_CONTENT_TYPE.test(contentType)) {
        reasons.push(reason("invalid-content-type", "JSON mutations require Content-Type: application/json"));
    }

    return {
        allowed: reasons.length === 0,
        method,
        checks: {
            loopbackRemote: !reasons.some((item) => item.code === "non-loopback-remote"),
            loopbackHost: !reasons.some((item) => item.code === "non-loopback-host"),
            hostMatches: !reasons.some((item) => item.code === "host-mismatch"),
            originMatches: requireOrigin
                ? !reasons.some((item) => item.code === "origin-missing" || item.code === "origin-mismatch")
                : true,
            sessionToken: requireSessionToken
                ? !reasons.some((item) => item.code === "session-token-missing" || item.code === "session-token-invalid")
                : true,
            contentType: requireContentType ? !reasons.some((item) => item.code === "invalid-content-type") : true
        },
        reasons
    };
}

export function evaluateAdminPrivateReadGuard(options = {}) {
    return evaluateAdminRequestGuard({
        ...options,
        method: options.method || "GET",
        requireOrigin: false,
        requireContentType: false,
        requireSessionToken: true
    });
}
