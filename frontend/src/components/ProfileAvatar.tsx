import type { Profile } from '../api/types'

const SIZES = {
  xs: 'h-7 w-7 text-sm',
  sm: 'h-9 w-9 text-lg',
  md: 'h-12 w-12 text-2xl',
  lg: 'h-24 w-24 text-5xl sm:h-28 sm:w-28 sm:text-6xl',
}

export function ProfileAvatar({
  profile,
  size = 'sm',
  className = '',
}: {
  profile: Pick<Profile, 'emoji' | 'color' | 'name'> & { deleted?: boolean } | null
  size?: keyof typeof SIZES
  className?: string
}) {
  const gone = !profile || profile.deleted
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full ${SIZES[size]} ${className}`}
      style={{
        background: gone ? 'var(--line)' : profile.color,
        boxShadow: 'inset 0 -3px 0 rgba(28,27,24,.08)',
        filter: gone ? 'grayscale(1)' : undefined,
      }}
      title={gone ? 'Perfil eliminat' : profile.name}
      aria-hidden
    >
      <span className="leading-none">{profile?.emoji ?? '👻'}</span>
    </span>
  )
}

export function profileName(p: Profile | null | undefined) {
  if (!p) return 'Algú'
  return p.deleted ? 'Perfil eliminat' : p.name
}
