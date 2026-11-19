import { useState } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { blazeEnabled, firebase, type Incident } from './firebase'
import { Button } from './components/ui/button'
import { kinds } from './climate'

type Account = { uid: string; email: string; disabled: boolean; admin: boolean }
type AccountPage = { accounts: Account[]; nextPage: string }

export function Administration({ reports, locality }: { reports: Incident[]; locality: string }) {
  const [page, setPage] = useState<AccountPage | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const counts = kinds.map(kind => ({ kind, total: reports.filter(report => report.kind === kind).length }))

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await action() }
    catch { setError('Não foi possível concluir a operação administrativa.') }
    finally { setBusy(false) }
  }

  function load(pageToken?: string) {
    void run(async () => {
      if (!firebase) return
      const call = httpsCallable<{ pageToken?: string }, AccountPage>(getFunctions(firebase, 'southamerica-east1'), 'listAccounts')
      const result = await call(pageToken ? { pageToken } : {})
      setPage(result.data)
    })
  }

  function toggle(account: Account) {
    void run(async () => {
      if (!firebase) return
      const disabled = !account.disabled
      await httpsCallable(getFunctions(firebase, 'southamerica-east1'), 'setAccountDisabled')({ uid: account.uid, disabled })
      setPage(current => current && { ...current, accounts: current.accounts.map(item => item.uid === account.uid ? { ...item, disabled } : item) })
    })
  }

  function download() {
    const blob = new Blob([JSON.stringify({ locality, total: reports.length, categories: counts }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'climora-ocorrencias-validadas.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <>
    <h2>Relatório de ocorrências validadas</h2>
    <p>{locality}</p>
    <ul className="admin-counts">{counts.map(({ kind, total }) => <li key={kind}>{kind} <strong>{total}</strong></li>)}</ul>
    <Button variant="outline" onClick={download}>Baixar relatório</Button>
    {blazeEnabled ? <>
    <h2>Gestão de usuários</h2>
    <Button variant="outline" disabled={busy} onClick={() => load()}>Consultar contas</Button>
    {error && <p role="status" className="feedback">{error}</p>}
    {page && <ul className="reports">{page.accounts.map(account => <li key={account.uid}><div>
      <div><strong>{account.email || account.uid}</strong><p>{account.admin ? 'Administração' : account.disabled ? 'Desativada' : 'Ativa'}</p></div>
      {!account.admin && <Button variant="outline" disabled={busy} onClick={() => toggle(account)}>{account.disabled ? 'Reativar' : 'Desativar'}</Button>}
    </div></li>)}</ul>}
    {page?.nextPage && <Button variant="outline" disabled={busy} onClick={() => load(page.nextPage)}>Próxima página</Button>}</> : <p>Gerencie as contas pelo Firebase Authentication.</p>}
  </>
}

