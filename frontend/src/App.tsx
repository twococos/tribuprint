import { useEffect, useSyncExternalStore } from 'react'
import { useLiveEvents, useProfiles } from './api/hooks'
import { DuplexModal } from './components/DuplexModal'
import { Header } from './components/Header'
import { PrinterCard } from './components/PrinterCard'
import { QueueList } from './components/QueueList'
import { TabBar } from './components/TabBar'
import { Toasts } from './components/Toasts'
import { profileStore } from './lib/prefs'
import { useRoute } from './lib/router'
import { HistoryPage } from './routes/HistoryPage'
import { PrintPage } from './routes/PrintPage'
import { ProfilesScreen } from './routes/ProfilesScreen'

const desktopQuery = window.matchMedia('(min-width: 1024px)')
function useDesktop() {
  return useSyncExternalStore(
    (l) => {
      desktopQuery.addEventListener('change', l)
      return () => desktopQuery.removeEventListener('change', l)
    },
    () => desktopQuery.matches,
  )
}

export function App() {
  useLiveEvents()
  const route = useRoute()
  const desktop = useDesktop()
  const { data: profiles, isLoading, isError } = useProfiles()
  const profileId = profileStore.use()
  const profile = profiles?.find((p) => p.id === profileId)

  useEffect(() => window.scrollTo({ top: 0 }), [route])

  if (isLoading) return <Splash text="Obrint la copisteria…" />
  if (isError) return <Splash text="No arribo al servidor. Torna-ho a provar d'aquí a una estona." />
  if (!profile || route === 'perfils') return <ProfilesScreen />

  let main
  if (route === 'historial') {
    main = <HistoryPage />
  } else if (desktop) {
    // Escriptori: imprimir a l'esquerra, impressora i cua a la dreta
    main = (
      <div className="grid grid-cols-[minmax(0,1fr)_420px] items-start gap-8">
        <PrintPage profile={profile} desktop />
        <aside className="space-y-6">
          <PrinterCard />
          <QueueList />
        </aside>
      </div>
    )
  } else if (route === 'cua') {
    main = <QueueList />
  } else if (route === 'impressora') {
    main = (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Impressora</h1>
        <PrinterCard full />
      </div>
    )
  } else {
    main = <PrintPage profile={profile} desktop={false} />
  }

  return (
    <>
      <Header profile={profile} route={route} desktop={desktop} />
      <main className="mx-auto max-w-[1240px] px-4 pb-32 pt-5 sm:pt-6 lg:px-8 lg:pb-16">{main}</main>
      {!desktop && <TabBar route={route} />}
      <DuplexModal />
      <Toasts />
    </>
  )
}

function Splash({ text }: { text: string }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <div className="riso font-display text-4xl font-extrabold">TribuPrint</div>
        <p className="mt-2 text-muted">{text}</p>
      </div>
    </div>
  )
}
