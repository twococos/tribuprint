import { useQueryClient } from '@tanstack/react-query'
import { Check, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { Profile } from '../api/types'
import { profileStore } from '../lib/prefs'
import { toast } from '../lib/toasts'
import { Modal } from './Modal'
import { ProfileAvatar } from './ProfileAvatar'

export const EMOJIS = [
  '🦊', '🐸', '🦉', '🐙', '🐱', '🐶', '🦁', '🐼', '🐨', '🐯', '🦄', '🐢',
  '🐝', '🦋', '🐳', '🦖', '🌻', '🌵', '🍄', '🚀', '🎸', '⚽', '🎨', '📚',
  '🧁', '🍕', '👑', '🤖', '👻', '🌈', '⭐', '🔥',
]
export const COLORS = ['#FFC8A2', '#FFE08A', '#C9E4A4', '#B5E8C0', '#A8DCF0', '#C4CCF5', '#D4C4F5', '#F5B8D6', '#F2D0A9', '#E0DACB']

export function ProfileEditor({
  open,
  profile,
  onClose,
  onSaved,
  canClose = true,
}: {
  open: boolean
  profile: Profile | null
  onClose: () => void
  onSaved?: (p: Profile) => void
  canClose?: boolean
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0])
  const [color, setColor] = useState(COLORS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(profile?.name ?? '')
    setEmoji(profile?.emoji ?? EMOJIS[Math.floor(Math.random() * 12)])
    setColor(profile?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)])
    setError(null)
    setConfirmDelete(false)
  }, [open, profile])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Com et dius?')
    setBusy(true)
    try {
      const p = profile
        ? await api.updateProfile(profile.id, { name, emoji, color })
        : await api.createProfile({ name, emoji, color })
      await qc.invalidateQueries({ queryKey: ['profiles'] })
      onSaved?.(p)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No s\'ha pogut desar.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!profile) return
    setBusy(true)
    try {
      await api.deleteProfile(profile.id)
      if (profileStore.get() === profile.id) profileStore.set(null)
      await qc.invalidateQueries({ queryKey: ['profiles'] })
      toast('info', `Adéu, ${profile.name}`, 'El seu historial es queda com a «Perfil eliminat».')
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No s\'ha pogut esborrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={canClose ? onClose : undefined} title={profile ? 'Edita el perfil' : canClose ? 'Nou membre de la tribu' : 'Benvinguts! Qui és el primer?'}>
      <form onSubmit={save} className="space-y-5">
        <div className="flex items-center gap-4">
          <ProfileAvatar profile={{ name, emoji, color }} size="lg" className="!h-20 !w-20 !text-4xl" />
          <label className="flex-1">
            <span className="label">Nom</span>
            <input
              className="field mt-1 text-lg font-semibold"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              placeholder="Com et dius?"
              autoFocus={!profile}
              autoComplete="off"
            />
          </label>
        </div>

        <fieldset>
          <legend className="label mb-2">Emoji</legend>
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-pressed={emoji === e}
                aria-label={e}
                className={`grid aspect-square min-h-[38px] place-items-center rounded-xl text-2xl transition-transform hover:scale-110 ${emoji === e ? 'bg-surface-2 ring-2 ring-ink' : ''}`}
              >
                {e}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label mb-2">Color</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                aria-label={`Color ${c}`}
                className="grid h-11 w-11 place-items-center rounded-full transition-transform hover:scale-110"
                style={{ background: c, boxShadow: color === c ? '0 0 0 3px var(--surface), 0 0 0 5px var(--ink)' : 'inset 0 -3px 0 rgba(0,0,0,.08)' }}
              >
                {color === c && <Check size={18} color="#1C1B18" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </fieldset>

        {error && <p className="text-sm font-semibold text-danger-ink" role="alert">{error}</p>}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {profile &&
            (confirmDelete ? (
              <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
                <Trash2 size={18} /> Sí, esborra
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 size={18} /> Esborra
              </button>
            ))}
          <button type="submit" className="btn btn-primary ml-auto" disabled={busy}>
            {profile ? 'Desa' : 'Som-hi!'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
