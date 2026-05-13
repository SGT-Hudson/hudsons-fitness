import { AppProviders } from './providers';
import { AppRouter } from './router';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from '@/components/ui/toaster';

export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <AppRouter />
        <Toaster />
      </AppProviders>
    </ErrorBoundary>
  );
}
