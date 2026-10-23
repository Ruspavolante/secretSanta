import Link from "next/link";
import { logout } from "@/lib/actions/auth";
import { requireAdminPage } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { email } = await requireAdminPage();

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-pine-900 text-white shadow-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 font-display text-lg font-bold sm:text-xl">
            <span aria-hidden="true">🎁</span> Secret Santa <span className="hidden text-gold-300 sm:inline">· organizzatore</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {email ? <span className="hidden text-pine-200 md:inline">{email}</span> : null}
            <Link
              href="/admin/account"
              className="rounded-full px-3 py-1.5 font-medium hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-gold-300"
            >
              Account
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-full border border-white/30 px-3 py-1.5 font-medium hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-gold-300"
              >
                Esci
              </button>
            </form>
          </div>
        </div>
        <div className="h-1 bg-[repeating-linear-gradient(135deg,var(--color-berry-600)_0_12px,var(--color-snow)_12px_24px)]" />
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
