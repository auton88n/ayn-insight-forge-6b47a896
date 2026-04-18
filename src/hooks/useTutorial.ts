import { useState, useEffect, useCallback, useRef } from 'react';
import { spineApi } from '@/lib/spineApi';
import { TUTORIAL_STEPS, TutorialState } from '@/types/tutorial.types';

const STORAGE_KEY = 'ayn_tutorial_completed';

export const useTutorial = (userId?: string) => {
  const [state, setState] = useState<TutorialState>({
    isActive: false,
    currentStep: 0,
    isCompleted: false,
    showWelcome: false,
  });
  
  // Track if this is a first-time user (hasn't completed tutorial)
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);
  const hasTriggeredRef = useRef(false);

  // Check if tutorial should be shown - but DON'T auto-show welcome
  useEffect(() => {
    const checkTutorialStatus = async () => {
      const localCompleted = localStorage.getItem(STORAGE_KEY);
      if (localCompleted === 'true') {
        setState(prev => ({ ...prev, isCompleted: true }));
        setIsFirstTimeUser(false);
        return;
      }

      if (userId) {
        try {
          const settings: any = await spineApi.getSettings();
          if (settings?.has_completed_tutorial) {
            localStorage.setItem(STORAGE_KEY, 'true');
            setState(prev => ({ ...prev, isCompleted: true }));
            setIsFirstTimeUser(false);
          } else {
            setIsFirstTimeUser(true);
          }
        } catch {
          // If settings fetch fails, treat as first-time
          setIsFirstTimeUser(true);
        }
      }
    };

    checkTutorialStatus();
  }, [userId]);

  const startTutorial = useCallback(() => {
    setState(prev => ({
      ...prev,
      isActive: true,
      currentStep: 0,
      showWelcome: false,
    }));
  }, []);

  // Trigger tutorial on first message send
  const triggerFirstMessageTutorial = useCallback(() => {
    if (isFirstTimeUser && !state.isCompleted && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      // Show welcome modal which leads to tutorial
      setState(prev => ({ ...prev, showWelcome: true }));
    }
  }, [isFirstTimeUser, state.isCompleted]);

  const nextStep = useCallback(() => {
    setState(prev => {
      if (prev.currentStep >= TUTORIAL_STEPS.length - 1) {
        return { ...prev, isActive: false, isCompleted: true };
      }
      return { ...prev, currentStep: prev.currentStep + 1 };
    });
  }, []);

  const prevStep = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(0, prev.currentStep - 1),
    }));
  }, []);

  const completeTutorial = useCallback(async () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setState(prev => ({ ...prev, isActive: false, isCompleted: true }));
    setIsFirstTimeUser(false);

    if (userId) {
      try {
        await spineApi.saveSettings({ has_completed_tutorial: true });
      } catch (err) {
        console.error('Failed to save tutorial completion:', err);
      }
    }
  }, [userId]);

  const skipTutorial = useCallback(() => {
    setState(prev => ({
      ...prev,
      isActive: false,
      showWelcome: false,
      isCompleted: true,
    }));
    completeTutorial();
  }, [completeTutorial]);

  const resetTutorial = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    hasTriggeredRef.current = false;
    setState({
      isActive: false,
      currentStep: 0,
      isCompleted: false,
      showWelcome: true,
    });
    setIsFirstTimeUser(true);
  }, []);

  const dismissWelcome = useCallback(() => {
    setState(prev => ({ ...prev, showWelcome: false }));
    completeTutorial();
  }, [completeTutorial]);

  return {
    ...state,
    isFirstTimeUser,
    currentStepData: TUTORIAL_STEPS[state.currentStep],
    totalSteps: TUTORIAL_STEPS.length,
    startTutorial,
    nextStep,
    prevStep,
    skipTutorial,
    completeTutorial,
    resetTutorial,
    dismissWelcome,
    triggerFirstMessageTutorial,
  };
};
