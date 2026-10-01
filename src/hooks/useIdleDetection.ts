import { useState, useEffect, useCallback, useRef } from 'react';

interface IdleState {
  isIdle: boolean;
  isDeepIdle: boolean;
  secondsSinceActivity: number;
}

interface UseIdleDetectionOptions {
  idleThreshold?: number; // seconds before considered idle
  deepIdleThreshold?: number; // seconds before deep idle (pause animations)
}

export const useIdleDetection = ({
  idleThreshold = 10,
  deepIdleThreshold = 30,
}: UseIdleDetectionOptions = {}): IdleState => {
  const [state, setState] = useState<IdleState>({
    isIdle: false,
    isDeepIdle: false,
    secondsSinceActivity: 0,
  });
  
  const lastActivityRef = useRef(Date.now());
  const rafRef = useRef<number | null>(null);

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setState(prev => {
      if (prev.isIdle || prev.isDeepIdle) {
        return { isIdle: false, isDeepIdle: false, secondsSinceActivity: 0 };
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    
    events.forEach(event => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    // Check idle state every second
    const checkIdle = () => {
      const now = Date.now();
      const secondsSince = Math.floor((now - lastActivityRef.current) / 1000);
      
      setState({
        isIdle: secondsSince >= idleThreshold,
        isDeepIdle: secondsSince >= deepIdleThreshold,
        secondsSinceActivity: secondsSince,
      });
      
      rafRef.current = requestAnimationFrame(() => {
        setTimeout(checkIdle, 1000);
      });
    };

    checkIdle();

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, updateActivity);
      });
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [idleThreshold, deepIdleThreshold, updateActivity]);

  return state;
};
