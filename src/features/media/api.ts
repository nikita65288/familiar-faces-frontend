import { api } from "@/shared/api/client";

/**
 * Загрузить файл в media-service.
 * Возвращает относительный URL вида "/media/download/{id}"
 * в теле ответа как plain text (String из ResponseEntity<String>).
 */
export async function uploadFile(
    file: File,
    onProgress?: (percent: number) => void,
): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post<string | { url: string }>("/media/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
            if (onProgress && e.total) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        },
    });
    // Поддерживаем оба формата ответа: строка или { url: "..." }.
    if (typeof data === "string") return data;
    return (data as { url: string }).url;
}