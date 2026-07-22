import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useToothLabels() {
  const { data } = useQuery({
    queryKey: ['tooth-labels'],
    queryFn: async () => (await api.get<Record<string, string>>('/orders/tooth-labels')).data,
    staleTime: 5 * 60 * 1000,
  })
  return data ?? {}
}
