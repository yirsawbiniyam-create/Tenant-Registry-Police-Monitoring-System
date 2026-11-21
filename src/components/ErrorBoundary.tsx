import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'ያልተጠበቀ ስህተት ተከስቷል።' };
  }

  componentDidCatch(error: Error) {
    console.error('Application ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.errorMessage;
      if (friendly.includes('Missing or insufficient permissions')) {
        friendly = 'ይህንን መረጃ ለማየት ወይም ለማስተካከል በቂ የፍቃድ ደረጃ የለዎትም። እባክዎ በትክክለኛው መለያ ይግቡ።';
      } else if (friendly.includes('Quota exceeded')) {
        friendly = 'የቀኑ የዳታቤዝ የአጠቃቀም ገደብ (Quota) አልቋል።';
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">
              የሲስተም ስህተት ተከስቷል
            </h2>
            <p className="text-sm text-slate-600 mb-6 break-words">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              ገጹን እንደገና ጫን
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
