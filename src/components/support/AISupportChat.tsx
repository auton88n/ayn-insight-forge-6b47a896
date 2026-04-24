import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Brain, User, Ticket, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageFormatter } from '@/components/shared/MessageFormatter';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AISupportChatProps {
  onNeedTicket: () => void;
}

const AISupportChat: React.FC<AISupportChatProps> = ({ onNeedTicket }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm **AYN's AI support assistant**. How can I help you today?\n\nI can:\n- Answer questions about features\n- Troubleshoot issues\n- Help you create a support ticket",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTicketPrompt, setShowTicketPrompt] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setShowTicketPrompt(false);

    try {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke('support-bot', {
        body: {
          message: userMessage.content,
          conversationHistory,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer,
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (data.needsHumanSupport) {
        setShowTicketPrompt(true);
      }
    } catch (error) {
      console.error('Support chat error:', error);
      toast.error('Failed to get response. Please try again.');
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm having trouble responding right now. Would you like to **create a support ticket** instead?",
      };
      setMessages(prev => [...prev, errorMessage]);
      setShowTicketPrompt(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 px-3 py-4" ref={scrollRef}>
        <div className="space-y-3">
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ 
                delay: index * 0.03,
                type: 'spring',
                stiffness: 400,
                damping: 25
              }}
              className={`flex gap-2.5 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-sm border border-primary/10">
                  <Brain className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl text-sm overflow-hidden ${
                  message.role === 'user'
                    ? 'bg-foreground text-background px-4 py-2.5 shadow-md'
                    : 'bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm text-foreground px-4 py-3 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-border/50'
                }`}
              >
                {message.role === 'assistant' ? (
                  <div className="support-chat-content [&_ul]:my-1.5 [&_ul]:space-y-0.5 [&_ol]:my-1.5 [&_li]:text-sm [&_li]:leading-relaxed [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-medium [&_pre]:text-xs [&_pre]:my-2 [&_pre]:rounded-lg [&_code]:text-xs">
                    <MessageFormatter content={message.content} className="text-sm" />
                  </div>
                ) : (
                  <span>{message.content}</span>
                )}
              </div>
              {message.role === 'user' && (
                <div className="h-8 w-8 rounded-full bg-foreground/10 flex items-center justify-center shrink-0 border border-border/50">
                  <User className="h-4 w-4 text-foreground" />
                </div>
              )}
            </motion.div>
          ))}

          {isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2.5 justify-start"
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-sm border border-primary/10">
                <Brain className="h-4 w-4 text-primary animate-pulse" />
              </div>
              <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-border/50">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-[pulse_1s_ease-in-out_infinite]" />
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-[pulse_1s_ease-in-out_infinite_150ms]" />
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-[pulse_1s_ease-in-out_infinite_300ms]" />
                </div>
              </div>
            </motion.div>
          )}

          {showTicketPrompt && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="bg-gradient-to-br from-primary/5 to-primary/10 backdrop-blur-sm border border-primary/20 rounded-2xl p-4 text-center shadow-sm"
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium text-foreground">
                  Need to speak with a human?
                </p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Our support team typically responds within 24 hours
              </p>
              <Button
                size="sm"
                onClick={onNeedTicket}
                className="gap-1.5 shadow-md hover:shadow-lg transition-shadow"
              >
                <Ticket className="h-4 w-4" />
                Create Support Ticket
              </Button>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Premium Input Area */}
      <div className="p-3 border-t border-border/50 bg-gradient-to-t from-muted/30 to-transparent">
        <div className="flex gap-2">
          <Input
            id="support-chat-input"
            name="support-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask anything..."
            disabled={isLoading}
            className="flex-1 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-border/50 focus-visible:ring-primary/30 rounded-xl"
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="rounded-xl shadow-md hover:shadow-lg transition-all shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AISupportChat;
