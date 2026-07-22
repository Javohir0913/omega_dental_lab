import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Empty, Spinner } from '@/components/ui'
import PhotoThumb from '@/components/PhotoThumb'
import type { OrderCard, Page } from '@/lib/types'

export default function RelatedOrders({
  patientId,
  doctorId,
}: {
  patientId?: number
  doctorId?: number
}) {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['related-orders', patientId, doctorId],
    queryFn: async () =>
      (
        await api.get<Page<OrderCard>>('/orders', {
          params: { patient_id: patientId, doctor_id: doctorId, size: 100 },
        })
      ).data,
  })

  const items = data?.items ?? []

  if (isLoading) return <Spinner />
  if (items.length === 0) return <Empty />

  return (
    <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((o) => (
        <button
          key={o.id}
          onClick={() => navigate(`/orders/${o.id}`)}
          className="group overflow-hidden rounded-xl border border-surface-border text-left transition-shadow hover:shadow-md dark:border-[#2f3745]"
        >
          <div className="relative w-full overflow-hidden" style={{ paddingTop: '75%' }}>
            <PhotoThumb photo={o.photo} className="absolute inset-0 h-full w-full transition-transform group-hover:scale-105" />
          </div>
          <div className="px-2.5 py-2">
            <div className="truncate text-xs font-semibold text-brand-600 dark:text-brand-400">{o.number}</div>
            <div className="truncate text-xs text-ink dark:text-[#e6e9ee]">{o.title}</div>
          </div>
        </button>
      ))}
    </div>
  )
}
