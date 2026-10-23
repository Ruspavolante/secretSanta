/** Foto di copertina dell'evento scelta dall'organizzatore. */
export function EventCover({ url, eventName }: { url: string | null; eventName: string }) {
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`Foto dell'evento ${eventName}`}
      className="mb-6 aspect-[16/9] w-full rounded-3xl object-cover shadow-xl ring-2 ring-gold-300/50"
      data-testid="event-cover"
    />
  );
}
