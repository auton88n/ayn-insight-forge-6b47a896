import { useState, useCallback } from 'react';
import { spineApi } from '@/lib/spineApi';
import { AIEngineeringResponse, CalculatorType } from '@/lib/engineeringKnowledge';
import { getHandlingMessage } from '@/lib/errorMessages';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  structuredResponse?: AIEngineeringResponse;
  timestamp: Date;
}

interface UseEngineeringAIProps {
  calculatorType: CalculatorType;
  currentInputs: Record<string, unknown>;
  currentOutputs: Record<string, unknown> | null;
}

export const useEngineeringAI = ({ 
  calculatorType, 
  currentInputs, 
  currentOutputs 
}: UseEngineeringAIProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim()) return;

    setIsLoading(true);
    setError(null);

    // Add user message
    const userMessage: Message = {
      role: 'user',
      content: question,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      // Build conversation history for context
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.role === 'assistant' && msg.structuredResponse 
          ? msg.structuredResponse.answer 
          : msg.content
      }));

      const ctx = JSON.stringify({ calculatorType, currentInputs, currentOutputs, history: conversationHistory });
      const data = await spineApi.engineeringChat(question, ctx);
      const response = data as AIEngineeringResponse;

      // Add assistant message
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.answer,
        structuredResponse: response,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get AI response';
      setError(errorMessage);
      console.error('AI error:', err);
      toast.error('AI assistant encountered an issue. Please try again.');

      // Add friendly handling message to chat
      const errorAssistantMessage: Message = {
        role: 'assistant',
        content: getHandlingMessage(),
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorAssistantMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [calculatorType, currentInputs, currentOutputs, messages]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const askQuickQuestion = useCallback((question: string) => {
    sendMessage(question);
  }, [sendMessage]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearConversation,
    askQuickQuestion
  };
};
