export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-muted" role="status">
      <span className="animate-wiggle text-5xl" aria-hidden="true">
        🎁
      </span>
      <p className="mt-4 text-sm">Caricamento in corso…</p>
    </div>
  );
}
