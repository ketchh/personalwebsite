import { Buffer } from "node:buffer";

export const DEFAULT_ADMIN_JSON_MAX_BYTES = 256 * 1024;

function safeInteger(value, fallback) {
    const nextValue = Number(value);
    return Number.isInteger(nextValue) && nextValue > 0 ? nextValue : fallback;
}

function reason(code, detail) {
    return { code, detail };
}

function intakeFailure(statusCode, reasons) {
    return {
        ok: false,
        statusCode,
        reasons
    };
}

function byteLengthOf(body) {
    if (body === undefined || body === null) {
        return 0;
    }

    if (typeof body === "string") {
        return Buffer.byteLength(body);
    }

    if (Buffer.isBuffer(body)) {
        return body.byteLength;
    }

    return Buffer.byteLength(String(body));
}

export function getAdminJsonMaxBytes(config = {}) {
    return safeInteger(config.jsonBodyMaxBytes, DEFAULT_ADMIN_JSON_MAX_BYTES);
}

export function parseAdminJsonBody({ body, maxBytes = DEFAULT_ADMIN_JSON_MAX_BYTES } = {}) {
    const limit = safeInteger(maxBytes, DEFAULT_ADMIN_JSON_MAX_BYTES);
    const bytes = byteLengthOf(body);

    if (bytes > limit) {
        return intakeFailure(413, [reason("request-body-too-large", "request body exceeds the configured JSON byte limit")]);
    }

    if (body === undefined || body === null || String(body).trim() === "") {
        return intakeFailure(400, [reason("empty-request-body", "JSON request body is required")]);
    }

    let payload;
    try {
        payload = JSON.parse(typeof body === "string" ? body : String(body));
    } catch {
        return intakeFailure(400, [reason("malformed-json", "request body is not valid JSON")]);
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return intakeFailure(400, [reason("non-object-json", "request body must be a JSON object")]);
    }

    return {
        ok: true,
        bytes,
        body: payload
    };
}

export async function readAdminRequestBody(stream, { maxBytes = DEFAULT_ADMIN_JSON_MAX_BYTES } = {}) {
    const limit = safeInteger(maxBytes, DEFAULT_ADMIN_JSON_MAX_BYTES);
    const chunks = [];
    let total = 0;

    for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.byteLength;

        if (total > limit) {
            return intakeFailure(413, [reason("request-body-too-large", "request body exceeds the configured JSON byte limit")]);
        }

        chunks.push(buffer);
    }

    return {
        ok: true,
        rawBody: Buffer.concat(chunks).toString("utf8"),
        bytes: total
    };
}
