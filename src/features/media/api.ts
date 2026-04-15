import { api } from "@/shared/api/client";

/**
 * Загрузить файл в media-service.
 * Возвращает относительный URL вида "/media/download/{id}".
 */
export async function uploadFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post<{ url: string }>("/media/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return data.url;
}