import crypto from "node:crypto";

export const ADMIN_SESSION_HEADER = "x-sbar-admin-session";
const TOKEN_BYTES = 32;

function nowIso(now) {
    const value = typeof now === "function" ? now() : new Date();
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function createToken() {
    return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

function createSessionId(token) {
    return crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
}

export function createAdminSession(options = {}) {
    const token = options.token || createToken();

    return {
        id: createSessionId(token),
        token,
        headerName: options.headerName || ADMIN_SESSION_HEADER,
        createdAt: nowIso(options.now)
    };
}

const DEFAULT_ADMIN_SESSION = createAdminSession();

export function getDefaultAdminSession() {
    return DEFAULT_ADMIN_SESSION;
}

export function getPublicSessionInfo(session = DEFAULT_ADMIN_SESSION) {
    return {
        id: session && session.id ? session.id : "missing",
        headerName: session && session.headerName ? session.headerName : ADMIN_SESSION_HEADER,
        createdAt: session && session.createdAt ? session.createdAt : null,
        active: Boolean(session && session.token)
    };
}

export function verifyAdminSessionToken(session, token) {
    if (!session || typeof session.token !== "string" || typeof token !== "string") {
        return false;
    }

    const expected = Buffer.from(session.token);
    const received = Buffer.from(token);

    if (expected.length !== received.length) {
        return false;
    }

    return crypto.timingSafeEqual(expected, received);
}
