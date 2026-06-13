interface Props {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}

const PALETTE = [
  "#7BB6A1",
  "#6BA6C9",
  "#C9A36B",
  "#A18BC9",
  "#C97B9B",
  "#8BBF7B",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0]!;
}

/** Avatar local: imagen si hay ruta válida, si no iniciales con color estable. */
export function AvatarInitials({ name, avatarUrl, size = 56 }: Props) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: colorFor(name),
        fontSize: size * 0.36,
      }}
    >
      {initials(name)}
    </div>
  );
}
