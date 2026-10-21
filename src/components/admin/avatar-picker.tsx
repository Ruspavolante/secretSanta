import { cx } from "@/components/ui";
import { AVATAR_KEYS, AVATARS } from "@/lib/avatars";

/** Scelta dell'immagine predefinita (usata quando non c'è una fotografia). */
export function AvatarPicker({ name, defaultValue = "gift", idPrefix }: { name: string; defaultValue?: string; idPrefix: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-pine-900">Immagine predefinita</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {AVATAR_KEYS.map((key) => (
          <label key={key} htmlFor={`${idPrefix}-${key}`} className="cursor-pointer" title={AVATARS[key].label}>
            <input
              id={`${idPrefix}-${key}`}
              type="radio"
              name={name}
              value={key}
              defaultChecked={key === defaultValue}
              className="peer sr-only"
            />
            <span
              className={cx(
                "flex size-11 items-center justify-center rounded-full bg-gradient-to-br text-2xl ring-2 ring-transparent transition",
                "peer-checked:ring-gold-400 peer-checked:ring-offset-2 peer-focus-visible:outline-2 peer-focus-visible:outline-pine-600",
                AVATARS[key].background,
              )}
            >
              <span aria-hidden="true">{AVATARS[key].emoji}</span>
              <span className="sr-only">{AVATARS[key].label}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
