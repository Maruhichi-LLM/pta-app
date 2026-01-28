type Props = {
  name: string;
  logoUrl?: string | null;
  sizeClassName?: string;
};

function resolveInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.slice(0, 2);
  }
  return trimmed.slice(0, 2);
}

export function GroupAvatar({
  name,
  logoUrl,
  sizeClassName = "h-11 w-11",
}: Props) {
  return (
    <div
      className={`${sizeClassName} overflow-hidden rounded-full border border-zinc-200 bg-sky-100 text-sky-700`}
      aria-label={`${name} ロゴ`}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={`${name} ロゴ`} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm font-semibold">
          {resolveInitials(name)}
        </div>
      )}
    </div>
  );
}
