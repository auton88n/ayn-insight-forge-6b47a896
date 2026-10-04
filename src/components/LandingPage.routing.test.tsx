import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import LandingPage from './LandingPage';
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ direction: 'ltr' }) }));
vi.mock('@/components/shared/SEO', () => ({ SEO: ({ canonical }: { canonical: string }) => <span data-testid="canonical">{canonical}</span>, createFAQSchema: () => ({}), organizationSchema: {}, websiteSchema: {}, softwareApplicationSchema: {} }));
vi.mock('@/components/landing/SeekerSidebar', () => ({ SeekerSidebar: ({ onSelectTab }: { onSelectTab: (tab: string) => void }) => <><button onClick={() => onSelectTab('search')}>Jobs</button><button onClick={() => onSelectTab('pricing')}>Pricing</button></> }));
vi.mock('@/components/landing/EmployerSidebar', () => ({ EmployerSidebar: () => null }));
vi.mock('./auth/AuthModal', () => ({ AuthModal: () => null }));
vi.mock('@/components/landing/LandingSections', () => ({ LandingSections: ({ activeTab }: { activeTab: string }) => <div data-testid="tab">{activeTab}</div> }));
function Location() { const location = useLocation(); const navigate = useNavigate(); return <><span data-testid="location">{location.pathname}{location.hash}</span><button onClick={() => navigate(-1)}>Back</button></>; }
afterEach(() => { cleanup(); sessionStorage.clear(); });
it('keeps pricing URL and canonical, and supports leaving and returning with Back', () => {
  render(<MemoryRouter initialEntries={['/pricing']}><LandingPage /><Location /></MemoryRouter>);
  expect(screen.getByTestId('tab')).toHaveTextContent('pricing');
  expect(screen.getByTestId('location')).toHaveTextContent('/pricing');
  expect(screen.getByTestId('canonical')).toHaveTextContent('/pricing');
  fireEvent.click(screen.getByText('Jobs', { exact: true }));
  expect(screen.getByTestId('location')).toHaveTextContent('/#search');
  fireEvent.click(screen.getByText('Back', { exact: true }));
  expect(screen.getByTestId('location')).toHaveTextContent('/pricing');
  expect(screen.getByTestId('tab')).toHaveTextContent('pricing');
});
