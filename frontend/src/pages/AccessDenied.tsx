import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppNav } from '../components/AppNav'

const supportContacts = ['Willian Teles', 'Pedro Souza', 'Israel Lima']

export function AccessDenied() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <AppNav />

      <main className="mx-auto flex max-w-3xl items-center justify-center py-16">
        <section className="w-full rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <ShieldAlert size={34} />
          </div>

          <h1 className="mt-6 text-2xl font-bold text-slate-900">
            Você não pode acessar esta guia
          </h1>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
            Qualquer dúvida, consulte o TI local da empresa.
          </p>

          <div className="mx-auto mt-6 max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Contatos do TI
            </p>
            <ul className="mt-3 space-y-2 text-sm font-semibold text-slate-800">
              {supportContacts.map((contact) => (
                <li key={contact}>{contact}</li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={() => navigate('/tickets')}
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            <ArrowLeft size={17} />
            Voltar para chamados
          </button>
        </section>
      </main>
    </div>
  )
}
