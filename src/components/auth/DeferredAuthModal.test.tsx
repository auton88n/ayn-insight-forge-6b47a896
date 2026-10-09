import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AuthModal } from './DeferredAuthModal';

const state = vi.hoisted(() => ({ loaded: vi.fn(), mounted: vi.fn() }));
vi.mock('./AuthModal', () => {
  state.loaded();
  return { AuthModal: ({ open }: { open: boolean }) => {
    state.mounted();
    return open ? <div role="dialog">Authentication form</div> : null;
  } };
});
afterEach(cleanup);

it('does not import closed forms, loads on demand and retains the mounted form on close', async () => {
  const props = { onOpenChange: vi.fn() };
  const view = render(<AuthModal {...props} open={false} />);
  expect(state.loaded).not.toHaveBeenCalled();
  expect(state.mounted).not.toHaveBeenCalled();
  view.rerender(<AuthModal {...props} open />);
  expect(await screen.findByRole('dialog')).toHaveTextContent('Authentication form');
  expect(state.loaded).toHaveBeenCalledTimes(1);
  const renders = state.mounted.mock.calls.length;
  view.rerender(<AuthModal {...props} open={false} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(state.mounted.mock.calls.length).toBeGreaterThan(renders);
});
