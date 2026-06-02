import { ADMIN_LOCKED_ACTIONS } from "./health.js";
import { ADMIN_SESSION_HEADER } from "./session.js";
import { evaluateAdminRequestGuard, expectedAdminHost, expectedAdminOrigin } from "./request-guard.js";

const MUTATION_ROUTES = [
    {
        method: "PUT",
        pathname: "/api/admin/documents/resume-main",
        action: "save"
    },
    {
        method: "POST",
        pathname: "/api/admin/documents/resume-main/preview",
        action: "preview"
    },
    {
        method: "POST",
        pathname: "/api/admin/documents/resume-main/publish",
        action: "publish"
    },
    {
        method: "POST",
        pathname: "/api/admin/documents/resume-main/unpublish",
        action: "unpublish"
    },
    {
        method: "POST",
        pathname: "/api/admin/uploads",
        action: "upload"
    }
];

function normalizePathname(pathname = "/") {
    return String(pathname || "/").replace(/\/+$/, "") || "/";
}

function normalizeMethod(method = "GET") {
    return String(method || "GET").toUpperCase();
}

function headerValue(headers = {}, name) {
    const target = String(name || "").toLowerCase();

    for (const [key, value] of Object.entries(headers || {})) {
        if (String(key).toLowerCase() !== target) {
            continue;
        }

        if (Array.isArray(value)) {
            return value[0] || "";
        }

        return value || "";
    }

    return "";
}

function safePreflightDecision(decision) {
    return {
        allowed: decision.allowed,
        method: decision.method,
        checks: decision.checks,
        reasons: decision.reasons.map((item) => ({
            code: item.code,
            detail: item.detail
        }))
    };
}

function preflightPayload({ route, decision, writeEnabled, message, detail, error }) {
    return {
        service: "sbar.si admin",
        safeMode: true,
        writeEnabled,
        actionsLocked: [...ADMIN_LOCKED_ACTIONS],
        action: route.action,
        preflight: safePreflightDecision(decision),
        message,
        detail,
        error
    };
}

export function getAdminMutationPreflightRoute({ method = "GET", pathname = "/" } = {}) {
    const nextMethod = normalizeMethod(method);
    const nextPathname = normalizePathname(pathname);

    return MUTATION_ROUTES.find((route) => route.pathname === nextPathname && (route.method === nextMethod || nextMethod === "OPTIONS")) || null;
}

export function evaluateAdminMutationPreflight({ method = "GET", pathname = "/", remoteAddress = "", headers = {}, config = {} } = {}) {
    const route = getAdminMutationPreflightRoute({ method, pathname });

    if (!route) {
        return null;
    }

    const sessionHeaderName = config && config.session && config.session.headerName
        ? config.session.headerName
        : ADMIN_SESSION_HEADER;
    const decision = evaluateAdminRequestGuard({
        method,
        remoteAddress,
        hostHeader: headerValue(headers, "host"),
        originHeader: headerValue(headers, "origin"),
        contentType: headerValue(headers, "content-type"),
        tokenHeader: headerValue(headers, sessionHeaderName),
        expectedHost: expectedAdminHost(config),
        expectedOrigin: expectedAdminOrigin(config),
        session: config.session,
        sessionHeaderName
    });

    if (!decision.allowed) {
        return {
            kind: "blocked",
            route,
            action: route.action,
            statusCode: 403,
            payload: preflightPayload({
                route,
                decision,
                writeEnabled: false,
                message: "Request blocked before content changed; no content changed.",
                detail: "The mutation request was stopped before body parsing or content handlers. No content changed.",
                error: "admin mutation blocked"
            })
        };
    }

    if (ADMIN_LOCKED_ACTIONS.includes(route.action)) {
        return {
            kind: "locked",
            route,
            action: route.action,
            statusCode: 423,
            payload: preflightPayload({
                route,
                decision,
                writeEnabled: false,
                message: "Preflight passed, action still locked; no content changed.",
                detail: "Request guard passed, but Preview, Publish, Unpublish, Upload, body parsing for those routes, audit writes for those routes, and content mutations for those routes remain locked. No content changed.",
                error: "admin mutation locked"
            })
        };
    }

    return {
        kind: "allowed",
        route,
        action: route.action,
        decision
    };
}
