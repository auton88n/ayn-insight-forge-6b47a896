import { lazy, Suspense, useEffect, useState, type ComponentProps } from 'react';
import type { AuthModal as AuthModalComponent } from './AuthModal';

const AuthModalContent = lazy(() => import('./AuthModal').then(module => ({ default: module.AuthModal })));

/** Keep closed authentication forms out of page startup; retain form state after first opening. */
export function AuthModal(props: ComponentProps<typeof AuthModalComponent>) {
  const [hasOpened, setHasOpened] = useState(props.open);
  useEffect(() => { if (props.open) setHasOpened(true); }, [props.open]);
  if (!props.open && !hasOpened) return null;
  return (
    <Suspense fallback={props.open ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="rounded-xl bg-background p-6 shadow-lg">
          <p role="status">Opening sign in…</p>
          <button type="button" className="mt-3 underline" onClick={() => props.onOpenChange(false)}>Cancel</button>
        </div>
      </div>
    ) : null}>
      <AuthModalContent {...props} />
    </Suspense>
  );
}
