import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useToothChartScale() {
  const { data } = useQuery({
    queryKey: ['tooth-chart-scale'],
    queryFn: async () => (await api.get<number>('/orders/tooth-chart-scale')).data,
    staleTime: 5 * 60 * 1000,
  })
  return data ?? 100
}
