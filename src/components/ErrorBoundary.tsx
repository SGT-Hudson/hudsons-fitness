import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
      return (
        <div className="min-h-dvh flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Algo ha ido mal</CardTitle>
              <CardDescription>
                Se ha producido un error inesperado. Recarga la página o vuelve atrás.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-40">
                {this.state.error.message}
              </pre>
              <div className="flex gap-2">
                <Button onClick={this.handleReset}>Reintentar</Button>
                <Button variant="outline" onClick={() => window.location.assign('/')}>
                  Inicio
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
