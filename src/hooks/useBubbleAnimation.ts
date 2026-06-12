import { useState, useCallback, useRef, useMemo } from 'react';
import type { BubbleType } from '@/lib/emotionMapping';

export interface FlyingBubble {
  id: string;
  content: string;
  status: 'flying' | 'absorbing' | 'done';
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
}

export interface FlyingSuggestion {
  id: string;
  content: string;
  emoji: string;
  status: 'flying' | 'absorbing' | 'done';
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
}

export interface ResponseBubbleAttachment {
  url: string;
  name: string;
  type: string;
}

export interface ResponseBubble {
  id: string;
  content: string;
  type: BubbleType;
  isVisible: boolean;
  position: { x: number; y: number };
  attachment?: ResponseBubbleAttachment;

}

export interface SuggestionBubble {
  id: string;
  content: string;
  emoji: string;
  isVisible: boolean;
}

interface UseBubbleAnimationReturn {
  flyingBubble: FlyingBubble | null;
  flyingSuggestion: FlyingSuggestion | null;
  responseBubbles: ResponseBubble[];
  suggestionBubbles: SuggestionBubble[];
  startMessageAnimation: (
    content: string,
    inputPosition: { x: number; y: number },
    eyePosition: { x: number; y: number }
  ) => void;
  completeAbsorption: () => void;
  startSuggestionFlight: (
    content: string,
    emoji: string,
    startPosition: { x: number; y: number },
    endPosition: { x: number; y: number }
  ) => void;
  completeSuggestionAbsorption: () => void;
  emitResponseBubble: (content: string, type: BubbleType, attachment?: ResponseBubbleAttachment) => void;
  clearResponseBubbles: () => void;
  dismissBubble: (id: string) => void;
  emitSuggestion: (content: string, emoji?: string) => void;
  emitSuggestions: (suggestions: Array<{ content: string; emoji?: string }>) => void;
  clearSuggestions: () => void;
  dismissSuggestion: (id: string) => void;
}

const MAX_VISIBLE_BUBBLES = 4;

export const useBubbleAnimation = (): UseBubbleAnimationReturn => {
  const [flyingBubble, setFlyingBubble] = useState<FlyingBubble | null>(null);
  const [flyingSuggestion, setFlyingSuggestion] = useState<FlyingSuggestion | null>(null);
  const [responseBubbles, setResponseBubbles] = useState<ResponseBubble[]>([]);
  const [suggestionBubbles, setSuggestionBubbles] = useState<SuggestionBubble[]>([]);
  const bubbleIdRef = useRef(0);

  const startMessageAnimation = useCallback(
    (
      content: string,
      inputPosition: { x: number; y: number },
      eyePosition: { x: number; y: number }
    ) => {
      const id = `flying-${Date.now()}-${bubbleIdRef.current++}`;
      
      setFlyingBubble({
        id,
        content,
        status: 'flying',
        startPosition: inputPosition,
        endPosition: eyePosition,
      });

      // After flight completes, start absorption (guard against race condition)
      setTimeout(() => {
        setFlyingBubble((prev) =>
          prev?.id === id && prev.status !== 'done'
            ? { ...prev, status: 'absorbing' }
            : prev
        );
      }, 300);
    },
    []
  );

  const completeAbsorption = useCallback(() => {
    setFlyingBubble((prev) =>
      prev ? { ...prev, status: 'done' } : null
    );
    // Clear after animation
    setTimeout(() => {
      setFlyingBubble(null);
    }, 200);
  }, []);

  // Suggestion flight functions
  const startSuggestionFlight = useCallback(
    (
      content: string,
      emoji: string,
      startPosition: { x: number; y: number },
      endPosition: { x: number; y: number }
    ) => {
      const id = `flying-suggestion-${Date.now()}-${bubbleIdRef.current++}`;
      
      setFlyingSuggestion({
        id,
        content,
        emoji,
        status: 'flying',
        startPosition,
        endPosition,
      });

      // After flight completes, start absorption (guard against race condition)
      setTimeout(() => {
        setFlyingSuggestion((prev) =>
          prev?.id === id && prev.status !== 'done'
            ? { ...prev, status: 'absorbing' }
            : prev
        );
      }, 450);
    },
    []
  );

  const completeSuggestionAbsorption = useCallback(() => {
    setFlyingSuggestion((prev) =>
      prev ? { ...prev, status: 'done' } : null
    );
    setTimeout(() => {
      setFlyingSuggestion(null);
    }, 200);
  }, []);

  const emitResponseBubble = useCallback((content: string, type: BubbleType, attachment?: ResponseBubbleAttachment) => {
    const id = `response-${Date.now()}-${bubbleIdRef.current++}`;
    
    const newBubble: ResponseBubble = {
      id,
      content,
      type,
      isVisible: true,
      position: { x: 0, y: 0 },
      attachment,

    };

    // Replace all previous bubbles - each AYN response is complete, not a continuation
    setResponseBubbles([newBubble]);
  }, []);

  const clearResponseBubbles = useCallback(() => {
    // Completely reset to prevent stale bubbles from reappearing
    setResponseBubbles([]);
  }, []);

  const dismissBubble = useCallback((id: string) => {
    setResponseBubbles((prev) =>
      prev.map((b) => (b.id === id ? { ...b, isVisible: false } : b))
    );
  }, []);

  // Suggestion bubble functions
  const emitSuggestion = useCallback((content: string, emoji: string = '💡') => {
    const id = `suggestion-${Date.now()}-${bubbleIdRef.current++}`;
    
    setSuggestionBubbles((prev) => [
      ...prev,
      { id, content, emoji, isVisible: true }
    ]);
  }, []);

  const emitSuggestions = useCallback((suggestions: Array<{ content: string; emoji?: string }>) => {
    const newSuggestions = suggestions.map((s, index) => ({
      id: `suggestion-${Date.now()}-${bubbleIdRef.current++}-${index}`,
      content: s.content,
      emoji: s.emoji || '💡',
      isVisible: true,
    }));
    
    setSuggestionBubbles(newSuggestions);
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestionBubbles((prev) =>
      prev.map((s) => ({ ...s, isVisible: false }))
    );
  }, []);

  const dismissSuggestion = useCallback((id: string) => {
    setSuggestionBubbles((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isVisible: false } : s))
    );
  }, []);

  // Memoize responseBubbles to prevent unnecessary re-renders
  const responseBubbleDeps = responseBubbles.map(b => `${b.id}-${b.isVisible}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableResponseBubbles = useMemo(() => responseBubbles, [
    responseBubbleDeps
  ]);

  // Memoize suggestionBubbles similarly
  const suggestionBubbleDeps = suggestionBubbles.map(s => `${s.id}-${s.isVisible}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableSuggestionBubbles = useMemo(() => suggestionBubbles, [
    suggestionBubbleDeps
  ]);

  return {
    flyingBubble,
    flyingSuggestion,
    responseBubbles: stableResponseBubbles,
    suggestionBubbles: stableSuggestionBubbles,
    startMessageAnimation,
    completeAbsorption,
    startSuggestionFlight,
    completeSuggestionAbsorption,
    emitResponseBubble,
    clearResponseBubbles,
    dismissBubble,
    emitSuggestion,
    emitSuggestions,
    clearSuggestions,
    dismissSuggestion,
  };
};
