import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getHandlingMessage, RATE_LIMIT_MESSAGE } from '@/lib/errorMessages';

export interface AIAction {
  tool: string;
  args: Record<string, any>;
  id: string;
  status: 'pending' | 'executing' | 'done' | 'error';
  result?: any;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: AIAction[];
  id?: string; // Database ID for persistence
}

interface UseEngineeringAIAgentProps {
  calculatorType: string | null;
  currentInputs: Record<string, any>;
  currentOutputs: Record<string, any> | null;
  onSetInput: (field: string, value: any) => void;
  onSetMultipleInputs: (inputs: Record<string, any>) => void;
  onCalculate: () => void;
  onSwitchCalculator: (type: string) => void;
  onReset: () => void;
  onShowHistory: () => void;
  onSaveDesign?: (name: string, notes?: string) => Promise<void>;
  onExportFile?: (format: 'dxf' | 'pdf') => void;
  onCompareDesigns?: (alternativeInputs: Record<string, any>) => void;
  sessionId?: string; // Optional: link to main chat session
}

// Get or create engineering session ID
const getEngineeringSessionId = (): string => {
  const key = 'engineering_session_id';
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
};

export const useEngineeringAIAgent = ({
  calculatorType,
  currentInputs,
  currentOutputs,
  onSetInput,
  onSetMultipleInputs,
  onCalculate,
  onSwitchCalculator,
  onReset,
  onShowHistory,
  onSaveDesign,
  onExportFile,
  onCompareDesigns,
  sessionId: externalSessionId,
}: UseEngineeringAIAgentProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageSequenceRef = useRef(0);
  
  // Use external session ID or generate one for engineering
  const engineeringSessionId = useMemo(() => {
    return externalSessionId || getEngineeringSessionId();
  }, [externalSessionId]);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    getUser();
  }, []);

  // Load previous engineering messages from database
  useEffect(() => {
    const loadPreviousMessages = async () => {
      if (!userId) return;
      
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('session_id', engineeringSessionId)
          .eq('mode_used', 'engineering')
          .order('created_at', { ascending: true });
        
        if (error) {
          if (import.meta.env.DEV) {
            console.error('Error loading engineering messages:', error);
          }
          return;
        }
        
        if (data && data.length > 0) {
          setMessages(data.map(m => ({
            id: m.id,
            role: m.sender === 'user' ? 'user' : 'assistant' as const,
            content: m.content,
            timestamp: new Date(m.created_at),
          })));
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('Failed to load engineering messages:', err);
        }
      }
    };
    
    loadPreviousMessages();
  }, [userId, engineeringSessionId]);

  // Save message to database
  const saveMessageToDb = useCallback(async (
    content: string, 
    sender: 'user' | 'ayn'
  ): Promise<string | null> => {
    if (!userId) return null;
    
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          user_id: userId,
          content,
          sender,
          session_id: engineeringSessionId,
          mode_used: 'engineering'
        })
        .select('id')
        .single();
      
      if (error) {
        if (import.meta.env.DEV) {
          console.error('Error saving message:', error);
        }
        return null;
      }
      
      return data?.id || null;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to save message:', err);
      }
      return null;
    }
  }, [userId, engineeringSessionId]);

  // Execute a single AI action
  const executeAction = useCallback(async (action: AIAction): Promise<any> => {
    setCurrentAction(`Executing: ${action.tool}`);

    try {
      switch (action.tool) {
        case 'set_input':
          onSetInput(action.args.field, action.args.value);
          return { success: true, field: action.args.field, value: action.args.value };

        case 'set_multiple_inputs':
          onSetMultipleInputs(action.args.inputs);
          return { success: true, inputs: action.args.inputs };

        case 'calculate':
          onCalculate();
          return { success: true, message: 'Calculation triggered' };

        case 'switch_calculator':
          onSwitchCalculator(action.args.calculator);
          return { success: true, calculator: action.args.calculator };

        case 'save_design':
          if (onSaveDesign) {
            await onSaveDesign(action.args.name, action.args.notes);
            toast.success(`Design saved as "${action.args.name}"`);
            return { success: true, name: action.args.name };
          }
          return { success: false, message: 'Save not available' };

        case 'export_file':
          if (onExportFile) {
            onExportFile(action.args.format);
            return { success: true, format: action.args.format };
          }
          return { success: false, message: 'Export not available' };

        case 'compare_designs':
          if (onCompareDesigns) {
            onCompareDesigns(action.args.alternative_inputs);
            return { success: true };
          }
          return { success: false, message: 'Compare not available' };

        case 'reset_form':
          onReset();
          return { success: true, message: 'Form reset' };

        case 'show_history':
          onShowHistory();
          return { success: true, message: 'History opened' };

        default:
          if (import.meta.env.DEV) {
            console.warn('Unknown action:', action.tool);
          }
          return { success: false, message: `Unknown action: ${action.tool}` };
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Action execution error:', err);
      }
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, [onSetInput, onSetMultipleInputs, onCalculate, onSwitchCalculator, onReset, onShowHistory, onSaveDesign, onExportFile, onCompareDesigns]);

  // Execute all actions from AI response
  const executeActions = useCallback(async (actions: AIAction[]): Promise<AIAction[]> => {
    const results: AIAction[] = [];

    for (const action of actions) {
      const executingAction: AIAction = { ...action, status: 'executing' };
      
      const result = await executeAction(action);
      
      const completedAction: AIAction = {
        ...action,
        status: result.success ? 'done' : 'error',
        result
      };
      results.push(completedAction);

      // Small delay between actions for UI feedback
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setCurrentAction(null);
    return results;
  }, [executeAction]);

  // Send a message to the AI agent
  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || isLoading) return;

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Increment sequence for guaranteed ordering
    const userSequence = ++messageSequenceRef.current;

    const userMessage: ChatMessage = {
      role: 'user',
      content: question.trim(),
      timestamp: new Date(),
      id: `user-${userSequence}`,
    };

    // Add user message FIRST
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Small delay to ensure React commits user message to DOM before AI response
    await new Promise(resolve => setTimeout(resolve, 50));

    // Save user message to database (non-blocking)
    saveMessageToDb(question.trim(), 'user');

    try {
      // Get session context if available
      const sessionContext = (window as any).__engineeringSessionContext?.();

      const { data, error } = await supabase.functions.invoke('engineering-ai-agent', {
        body: {
          calculatorType,
          currentInputs,
          currentOutputs,
          question: question.trim(),
          messages: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          allCalculatorStates: sessionContext?.allCalculatorStates || {},
          recentActions: sessionContext?.recentActions || [],
          sessionInfo: sessionContext?.sessionInfo || {},
        },
      });

      if (error) throw error;

      // Execute any actions from the AI
      let executedActions: AIAction[] = [];
      if (data.actions && data.actions.length > 0) {
        executedActions = await executeActions(data.actions);
      }

      const assistantContent = data.answer || 'Done! I executed the requested actions.';
      const aiSequence = ++messageSequenceRef.current;
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        id: `assistant-${aiSequence}`,
        actions: executedActions,
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Save assistant message to database (non-blocking)
      saveMessageToDb(assistantContent, 'ayn');

    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('AI agent error:', err);
      }
      
      // Use friendly handling message that maintains personality
      const errorContent = err instanceof Error && err.message.includes('rate limit')
        ? RATE_LIMIT_MESSAGE
        : getHandlingMessage();
      
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setCurrentAction(null);
    }
  }, [calculatorType, currentInputs, currentOutputs, messages, isLoading, executeActions, saveMessageToDb]);

  // Quick command shortcuts
  const executeQuickCommand = useCallback((command: string) => {
    switch (command) {
      case '/calc':
      case '/calculate':
        onCalculate();
        toast.success('Calculation triggered');
        break;
      case '/reset':
        onReset();
        toast.success('Form reset');
        break;
      case '/history':
        onShowHistory();
        break;
      case '/save':
        sendMessage('Save this design');
        break;
      case '/export':
        sendMessage('Export this design as PDF');
        break;
      default:
        return false;
    }
    return true;
  }, [onCalculate, onReset, onShowHistory, sendMessage]);

  // Clear conversation
  const clearConversation = useCallback(() => {
    setMessages([]);
    setCurrentAction(null);
  }, []);

  // Start new engineering session (clears memory)
  const startNewSession = useCallback(() => {
    sessionStorage.removeItem('engineering_session_id');
    setMessages([]);
    setCurrentAction(null);
  }, []);

  return {
    messages,
    isLoading,
    currentAction,
    sendMessage,
    executeQuickCommand,
    clearConversation,
    startNewSession,
    engineeringSessionId,
  };
};
