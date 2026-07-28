import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import i18n from '@/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error', error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      // A class component cannot use `useTranslation`, so it reads the i18n
      // singleton like the other non-hook modules do. It will not re-render on
      // a language switch — acceptable for a crash screen, which the user
      // leaves by reloading anyway.
      return (
        <div data-testid="error-boundary-fallback" className="min-h-dvh flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>{i18n.t('common:errors.boundary.title')}</CardTitle>
              <CardDescription>{i18n.t('common:errors.boundary.body')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button onClick={this.handleReset}>{i18n.t('common:errors.retry')}</Button>
                <Button variant="outline" onClick={() => window.location.assign('/')}>
                  {i18n.t('common:errors.boundary.home')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
