import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useControlColor() {
  const { data } = useQuery({
    queryKey: ['control-color'],
    queryFn: async () => (await api.get<string>('/orders/control-color')).data,
    staleTime: 5 * 60 * 1000,
  })
  return data ?? '#22c55e'
}
