export function firstQueryValue(value) {
    return Array.isArray(value) ? value[0] : value;
}

export function normalizeSetCode(value) {
    return String(firstQueryValue(value) || "").trim().toLowerCase();
}

export function slugify(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function parsePositiveInteger(value, fallback, { min = 1, max = 100 } = {}) {
    const parsed = Number.parseInt(firstQueryValue(value), 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

export function paginate(items, page, pageSize) {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}