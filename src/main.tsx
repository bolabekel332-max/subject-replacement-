import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Monaco Editor Environment Configuration
// @ts-ignore - self.MonacoEnvironment is a global property for Monaco Editor
self.MonacoEnvironment = {
  getWorker: function (_: any, label: string) {
    return new Worker(
      new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url)
    );
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
