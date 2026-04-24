import { supabase } from '@/integrations/supabase/client';
import type { EmailType } from '@/lib/email-templates';

interface SendEmailResponse {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Hook for sending emails via the send-email edge function
 */
export const useEmail = () => {
  /**
   * Generic email send function
   */
  const sendEmail = async (
    to: string,
    emailType: EmailType,
    data: { [key: string]: unknown },
    userId?: string
  ): Promise<SendEmailResponse> => {
    try {
      const { data: response, error } = await supabase.functions.invoke('send-email', {
        body: { to, emailType, data, userId }
      });

      if (error) {
        if (import.meta.env.DEV) {
          console.error('[useEmail] Error sending email:', error);
        }
        return { success: false, error: error.message };
      }

      return { success: true, id: response?.id };
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[useEmail] Exception:', err);
      }
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      };
    }
  };

  /**
   * Send welcome email to new user
   */
  const sendWelcomeEmail = async (
    to: string, 
    userName: string, 
    userId?: string
  ): Promise<SendEmailResponse> => {
    return sendEmail(to, 'welcome', { userName }, userId);
  };

  /**
   * Send credit warning email when user reaches 90% usage
   */
  const sendCreditWarning = async (
    to: string,
    userName: string,
    creditsLeft: number,
    totalCredits: number,
    userId?: string
  ): Promise<SendEmailResponse> => {
    return sendEmail(to, 'credit_warning', { userName, creditsLeft, totalCredits }, userId);
  };

  /**
   * Send auto-delete warning email before data cleanup
   */
  const sendAutoDeleteWarning = async (
    to: string,
    userName: string,
    itemCount: number,
    daysLeft: number,
    userId?: string
  ): Promise<SendEmailResponse> => {
    return sendEmail(to, 'auto_delete_warning', { userName, itemCount, daysLeft }, userId);
  };

  /**
   * Send payment receipt email after successful payment
   */
  const sendPaymentReceipt = async (
    to: string,
    userName: string,
    amount: string,
    plan: string,
    date: string,
    userId?: string
  ): Promise<SendEmailResponse> => {
    return sendEmail(to, 'payment_receipt', { userName, amount, plan, date }, userId);
  };

  /**
   * Send subscription created email
   */
  const sendSubscriptionCreated = async (
    to: string,
    userName: string,
    planName: string,
    credits: number,
    nextBillingDate: string,
    userId?: string
  ): Promise<SendEmailResponse> => {
    return sendEmail(to, 'subscription_created', { userName, planName, credits, nextBillingDate }, userId);
  };

  /**
   * Send subscription renewed email
   */
  const sendSubscriptionRenewed = async (
    to: string,
    userName: string,
    planName: string,
    amount: string,
    nextBillingDate: string,
    userId?: string
  ): Promise<SendEmailResponse> => {
    return sendEmail(to, 'subscription_renewed', { userName, planName, amount, nextBillingDate }, userId);
  };

  /**
   * Send subscription canceled email
   */
  const sendSubscriptionCanceled = async (
    to: string,
    userName: string,
    planName: string,
    endDate: string,
    userId?: string
  ): Promise<SendEmailResponse> => {
    return sendEmail(to, 'subscription_canceled', { userName, planName, endDate }, userId);
  };

  /**
   * Send subscription updated email (plan change)
   */
  const sendSubscriptionUpdated = async (
    to: string,
    userName: string,
    oldPlan: string,
    newPlan: string,
    effectiveDate: string,
    userId?: string
  ): Promise<SendEmailResponse> => {
    return sendEmail(to, 'subscription_updated', { userName, oldPlan, newPlan, effectiveDate }, userId);
  };

  return {
    sendEmail,
    sendWelcomeEmail,
    sendCreditWarning,
    sendAutoDeleteWarning,
    sendPaymentReceipt,
    sendSubscriptionCreated,
    sendSubscriptionRenewed,
    sendSubscriptionCanceled,
    sendSubscriptionUpdated,
  };
};
