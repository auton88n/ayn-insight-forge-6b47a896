import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

// No animation — instant render. Removed framer-motion slide which caused
// the visible "sliding up" lag on every page navigation.
export const PageTransition = ({ children }: PageTransitionProps) => {
  return (
    <div className="w-full min-h-screen bg-background">
      {children}
    </div>
  );
};

export default PageTransition;
