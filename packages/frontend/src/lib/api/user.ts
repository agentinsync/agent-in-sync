import { useQuery } from '@tanstack/react-query';
import { fetchApi } from './client';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  tier: 'free' | 'paid';
  createdAt: string;
}

export function useUserProfile() {
  return useQuery({
    queryKey: ['user', 'profile'],
    queryFn: () => fetchApi<UserProfile>('/user/me'),
  });
}
