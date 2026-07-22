import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useLang, useT } from '@/i18n'
import { Empty, Spinner } from '@/components/ui'
import RelatedOrders from '@/components/RelatedOrders'
import { dateOnly } from '@/lib/format'
import type { Patient } from '@/lib/types'

export default function PatientDetailPage() {
  const { id } = useParams()
  const patientId = Number(id)
  const t = useT()
  const lang = useLang((s) => s.lang)
  const navigate = useNavigate()

  const { data: patient, isLoading } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: async () => (await api.get<Patient>(`/patients/${patientId}`)).data,
    enabled: Number.isFinite(patientId),
  })

  if (isLoading) return <Spinner />
  if (!patient) return <Empty />

  return (
    <div className="mx-auto max-w-6xl p-4 pb-20">
      <div className="mb-4 flex items-start gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost px-2">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-tight">{patient.full_name}</h1>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-faint">
            {patient.phone && <span>{patient.phone}</span>}
            {patient.birth_date && <span>{dateOnly(patient.birth_date)}</span>}
            {patient.doctor && <span>{t('doctor')}: {patient.doctor.full_name}</span>}
          </div>
          {patient.note && <p className="mt-1.5 text-sm text-ink-soft">{patient.note}</p>}
        </div>
      </div>

      <div className="mb-2 text-sm font-semibold text-ink dark:text-[#e6e9ee]">
        {lang === 'ru' ? 'Проекты' : 'Proyektlar'}
      </div>
      <RelatedOrders patientId={patientId} />
    </div>
  )
}
