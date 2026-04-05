import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import AdminApp from './AdminApp';
import '../../index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
      <BrowserRouter>
        <AdminApp />
        <Toaster position="top-right" />
      </BrowserRouter>
    </ThemeProvider>
  </QueryClientProvider>
);
