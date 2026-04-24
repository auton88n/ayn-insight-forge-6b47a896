import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, ChevronDown, ThumbsUp, Eye } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { MessageFormatter } from '@/components/shared/MessageFormatter';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  view_count: number;
  helpful_count: number;
}

const FAQBrowser: React.FC = () => {
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [helpfulClicked, setHelpfulClicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchFAQs();
  }, []);

  const fetchFAQs = async () => {
    try {
      const { data, error } = await supabase
        .from('faq_items')
        .select('*')
        .eq('is_published', true)
        .order('order_index');

      if (error) throw error;
      setFaqs(data || []);
    } catch (error) {
      console.error('Error fetching FAQs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExpand = async (faqId: string) => {
    if (expandedId === faqId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(faqId);

    // Increment view count
    try {
      await supabase.rpc('increment_faq_view', { faq_id: faqId });
    } catch (error) {
      console.error('Error incrementing view:', error);
    }
  };

  const handleHelpful = async (faqId: string) => {
    if (helpfulClicked.has(faqId)) return;

    try {
      await supabase.rpc('increment_faq_helpful', { faq_id: faqId });
      setHelpfulClicked(prev => new Set([...prev, faqId]));
      setFaqs(prev => prev.map(faq => 
        faq.id === faqId 
          ? { ...faq, helpful_count: faq.helpful_count + 1 }
          : faq
      ));
    } catch (error) {
      console.error('Error incrementing helpful:', error);
    }
  };

  const filteredFaqs = faqs.filter(faq =>
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedFaqs = filteredFaqs.reduce((acc, faq) => {
    if (!acc[faq.category]) {
      acc[faq.category] = [];
    }
    acc[faq.category].push(faq);
    return acc;
  }, {} as Record<string, FAQItem[]>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search FAQs..."
            className="pl-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {Object.entries(groupedFaqs).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No FAQs found</p>
            </div>
          ) : (
            Object.entries(groupedFaqs).map(([category, categoryFaqs]) => (
              <div key={category}>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  {category.replace('_', ' ')}
                </h4>
                <div className="space-y-2">
                  {categoryFaqs.map((faq) => (
                    <motion.div
                      key={faq.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border border-border rounded-lg overflow-hidden bg-card"
                    >
                      <button
                        onClick={() => handleExpand(faq.id)}
                        className="w-full p-3 text-left flex items-start justify-between gap-2 hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm font-medium text-foreground">
                          {faq.question}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
                            expandedId === faq.id ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      {expandedId === faq.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-border"
                        >
                          <div className="p-3 text-sm text-muted-foreground [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1 [&_ul]:space-y-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1 [&_ol]:space-y-0.5 [&_p]:my-1 [&_strong]:text-foreground">
                            <MessageFormatter content={faq.answer} />
                          </div>
                          <div className="px-3 pb-3 flex items-center justify-between">
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {faq.view_count}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant={helpfulClicked.has(faq.id) ? 'default' : 'outline'}
                              className="h-7 text-xs gap-1"
                              onClick={() => handleHelpful(faq.id)}
                              disabled={helpfulClicked.has(faq.id)}
                            >
                              <ThumbsUp className="h-3 w-3" />
                              Helpful ({faq.helpful_count})
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default FAQBrowser;
