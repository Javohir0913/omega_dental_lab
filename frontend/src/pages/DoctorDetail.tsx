import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useLang } from '@/i18n'
import { Empty, Spinner } from '@/components/ui'
import RelatedOrders from '@/components/RelatedOrders'
import type { Doctor } from '@/lib/types'

export default function DoctorDetailPage() {
  const { id } = useParams()
  const doctorId = Number(id)
  const lang = useLang((s) => s.lang)
  const navigate = useNavigate()

  const { data: doctor, isLoading } = useQuery({
    queryKey: ['doctor', doctorId],
    queryFn: async () => (await api.get<Doctor>(`/doctors/${doctorId}`)).data,
    enabled: Number.isFinite(doctorId),
  })

  if (isLoading) return <Spinner />
  if (!doctor) return <Empty />

  return (
    <div className="mx-auto max-w-6xl p-4 pb-20">
      <div className="mb-4 flex items-start gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost px-2">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-tight">{doctor.full_name}</h1>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-faint">
            {doctor.phone && <span>{doctor.phone}</span>}
            {doctor.clinic && <span>{doctor.clinic}</span>}
          </div>
          {doctor.note && <p className="mt-1.5 text-sm text-ink-soft">{doctor.note}</p>}
        </div>
      </div>

      <div className="mb-2 text-sm font-semibold text-ink dark:text-[#e6e9ee]">
        {lang === 'ru' ? 'Проекты' : 'Proyektlar'}
      </div>
      <RelatedOrders doctorId={doctorId} />
    </div>
  )
}
