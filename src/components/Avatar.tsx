import { resolveMediaUrl } from "@/shared/lib/media";

type Props = { url?: string | null; name?: string; size?: number; onClick?: () => void };

export function Avatar({ url, name, size = 36, onClick }: Props) {
    const src = resolveMediaUrl(url ?? undefined);
    const initials = (name ?? "?").trim().slice(0, 1).toUpperCase();
    const style: React.CSSProperties = {
        width: size, height: size, borderRadius: "50%",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: "#d9e2ec", color: "#334e68", fontWeight: 600,
        overflow: "hidden", cursor: onClick ? "pointer" : "default",
        fontSize: Math.max(12, size * 0.4),
        flexShrink: 0,
    };
    return (
        <span style={style} onClick={onClick}>
      {src ? <img src={src} alt={name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
    </span>
    );
}