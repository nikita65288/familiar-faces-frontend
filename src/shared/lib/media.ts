/**
 * Приводит любой сохранённый URL аватара к форме,
 * которую корректно отдаст и dev-сервер (vite proxy на /media),
 * и прод (nginx на /api/).
 */
export const resolveMediaUrl = (url?: string | null): string | undefined => {
    if (!url) return undefined;
    if (/^https?:\/\//i.test(url)) return url;

    // Normalize any legacy /api/ prefix
    let normalized = url.replace(/^\/api\//, "/");
    if (!normalized.startsWith("/")) normalized = "/" + normalized;

    // Always serve through the /api proxy
    return `/api${normalized}`;
};