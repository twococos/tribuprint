import { motion } from "motion/react"
import { Pencil, Plus } from "lucide-react"
import { useState } from "react"
import { useProfiles } from "../api/hooks"
import type { Profile } from "../api/types"
import { ThemeToggle } from "../components/Header"
import { Logo } from "../components/Logo"
import { ProfileAvatar } from "../components/ProfileAvatar"
import { ProfileEditor } from "../components/ProfileEditor"
import { profileStore } from "../lib/prefs"
import { navigate } from "../lib/router"

export function ProfilesScreen() {
  const { data: profiles = [], isLoading } = useProfiles()
  const current = profileStore.use()
  const [editing, setEditing] = useState<Profile | null>(null)
  const [creating, setCreating] = useState(false)
  const [manage, setManage] = useState(false)
  const first = !isLoading && profiles.length === 0

  const pick = (p: Profile) => {
    if (manage) return setEditing(p)
    profileStore.set(p.id)
    navigate("imprimeix")
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex items-center justify-between px-4 pt-4 sm:px-8 sm:pt-6">
        <Logo />
        <ThemeToggle />
      </div>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
          {first
            ? "Benvinguts a la copisteria!"
            : manage
              ? "Gestiona la tribu"
              : "Qui imprimeix avui?"}
        </h1>
        <p className="mt-3 text-lg text-muted">
          {first
            ? "Encara no hi ha ningú. Crea el primer perfil i comencem."
            : manage
              ? "Toca un perfil per canviar-li el nom, l'emoji o el color."
              : ""}
        </p>

        <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 sm:mt-14 sm:grid-cols-3 sm:gap-x-12 md:grid-cols-4">
          {profiles.map((p, i) => (
            <motion.li
              key={p.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <motion.button
                type="button"
                onClick={() => pick(p)}
                whileHover={{ scale: 1.07, y: -4 }}
                whileTap={{ scale: 0.97 }}
                className="group flex flex-col items-center gap-3 rounded-3xl p-2"
                aria-label={manage ? `Edita ${p.name}` : `Sóc ${p.name}`}
              >
                <span className="relative">
                  <ProfileAvatar
                    profile={p}
                    size="lg"
                    className={`transition-shadow group-hover:shadow-[0_0_0_4px_var(--paper),0_0_0_7px_var(--ink)] ${current === p.id && !manage ? "shadow-[0_0_0_4px_var(--paper),0_0_0_7px_var(--magenta)]" : ""}`}
                  />
                  {manage && (
                    <span className="absolute -right-1 -top-1 grid h-9 w-9 place-items-center rounded-full bg-ink text-paper shadow">
                      <Pencil size={16} />
                    </span>
                  )}
                </span>
                <span className="max-w-[9rem] truncate text-lg font-semibold">{p.name}</span>
              </motion.button>
            </motion.li>
          ))}
          <li>
            <motion.button
              type="button"
              onClick={() => setCreating(true)}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.97 }}
              className="flex flex-col items-center gap-3 rounded-3xl p-2 text-muted hover:text-ink"
            >
              <span className="grid h-24 w-24 place-items-center rounded-full border-2 border-dashed border-current sm:h-28 sm:w-28">
                <Plus size={40} strokeWidth={1.8} />
              </span>
              <span className="text-lg font-semibold">Afegeix</span>
            </motion.button>
          </li>
        </ul>

        {profiles.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost mt-12"
            onClick={() => setManage((m) => !m)}
          >
            {manage ? "Fet" : "Gestiona perfils"}
          </button>
        )}
      </main>

      <ProfileEditor
        open={creating || first}
        profile={null}
        canClose={!first}
        onClose={() => setCreating(false)}
        onSaved={(p) => {
          if (first || profileStore.get() === null) {
            profileStore.set(p.id)
            navigate("imprimeix")
          }
        }}
      />
      <ProfileEditor open={!!editing} profile={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
