import { type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { ProfileLanguageSync } from '@/features/i18n/ProfileLanguageSync';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
            // Attempt the fetch even when the browser reports itself offline, so a
            // failure arrives as a real error the classifier can name. On the default
            // ('online') react-query pauses the query instead: nothing errors, nothing
            // loads, and every screen falls through to its not-found state — telling
            // the user their data does not exist because their wifi dropped.
            // 'offlineFirst' is not enough: it ungates only the first attempt, so the
            // retry re-pauses and the query still never settles.
            networkMode: 'always',
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ProfileLanguageSync />
          {children}
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
