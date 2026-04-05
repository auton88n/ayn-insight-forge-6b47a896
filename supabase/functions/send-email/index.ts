import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders from _shared/cors.ts
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface EmailRequest {
  to: string;
  emailType: 'welcome' | 'credit_warning' | 'auto_delete_warning' | 'payment_receipt' | 'password_reset' | 'subscription_created' | 'subscription_renewed' | 'subscription_canceled' | 'subscription_updated';
  data: Record<string, unknown>;
  userId?: string;
}

// AYN branded email header
const AYN_HEADER = `
<div style="text-align:center;margin-bottom:32px;">
  <h1 style="font-size:56px;font-weight:900;letter-spacing:-2px;margin:0;color:#000;">AYN</h1>
  <div style="width:40px;height:4px;background:#000;margin:16px auto;"></div>
</div>`;

// AYN branded email footer
const AYN_FOOTER = `
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;text-align:center;">
  <p style="font-size:12px;color:#999;margin:0;">AYN AI - Your Intelligent Companion</p>
  <p style="font-size:11px;color:#bbb;margin:8px 0 0;">© ${new Date().getFullYear()} AYN Team. All rights reserved.</p>
</div>`;

// Escape HTML to prevent XSS
const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Generate welcome email template (English only)
function welcomeEmailTemplate(userName: string): { subject: string; html: string } {
  const safeName = escapeHtml(userName || 'there');
  return {
    subject: "Welcome to AYN! 🎉",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  ${AYN_HEADER}
  
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi ${safeName},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">
    Welcome to AYN! Your AI companion is ready to help you with engineering calculations, 
    creative tasks, and intelligent assistance.
  </p>
  
  <div style="background:#f0f9ff;border-radius:8px;padding:16px;margin:24px 0;border-left:4px solid #0284c7;">
    <p style="font-size:14px;color:#0369a1;margin:0;">
      🎁 You start with <strong>5 free daily credits</strong> to explore!
    </p>
  </div>
  
  <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:24px 0;">
    <p style="font-size:14px;color:#374151;margin:0 0 8px;font-weight:600;">What can AYN help you with?</p>
    <ul style="font-size:14px;color:#6b7280;margin:0;padding-left:20px;line-height:1.8;">
      <li>🏗️ Civil & Structural Engineering Calculations</li>
      <li>💬 Intelligent Chat & Research</li>
      <li>📁 Document Analysis</li>
      <li>🎨 Creative Design Ideas</li>
    </ul>
  </div>
  
  ${AYN_FOOTER}
</div>
</body>
</html>`
  };
}

// Generate credit warning email template
function creditWarningTemplate(userName: string, creditsLeft: number, totalCredits: number): { subject: string; html: string } {
  const safeName = escapeHtml(userName || 'there');
  const percentage = Math.round((1 - creditsLeft / totalCredits) * 100);
  
  return {
    subject: "⚠️ AYN: Low Credits Alert - Only " + creditsLeft + " remaining",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  ${AYN_HEADER}
  
  <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px 20px;margin-bottom:32px;">
    <p style="font-size:16px;color:#92400e;margin:0;font-weight:600;">⚠️ Low Credits Warning</p>
  </div>
  
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi ${safeName},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">
    You've used ${percentage}% of your monthly credits. Here's your current usage:
  </p>
  
  <div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px;">
    <div style="margin-bottom:16px;">
      <p style="font-size:14px;color:#999;margin:0 0 8px;text-transform:uppercase;font-weight:600;">CREDITS REMAINING</p>
      <p style="font-size:32px;font-weight:900;color:#f59e0b;margin:0;">${creditsLeft}</p>
      <p style="font-size:14px;color:#666;margin:4px 0 0;">out of ${totalCredits} monthly credits</p>
    </div>
    <div style="background:#e5e5e5;border-radius:10px;height:12px;overflow:hidden;">
      <div style="background:linear-gradient(90deg, #f59e0b, #ef4444);height:100%;width:${percentage}%;border-radius:10px;"></div>
    </div>
  </div>
  
  <div style="background:#f0f9ff;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="font-size:14px;color:#0369a1;margin:0;">
      💡 <strong>Tip:</strong> Your credits will reset at the start of next month. Need more? Consider upgrading your plan.
    </p>
  </div>
  
  ${AYN_FOOTER}
</div>
</body>
</html>`
  };
}

// Generate auto-delete warning email template
function autoDeleteWarningTemplate(userName: string, itemCount: number, daysLeft: number): { subject: string; html: string } {
  const safeName = escapeHtml(userName || 'there');
  
  return {
    subject: `🗑️ AYN: ${itemCount} items will be deleted in ${daysLeft} days`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  ${AYN_HEADER}
  
  <div style="background:#fee2e2;border-left:4px solid #ef4444;padding:16px 20px;margin-bottom:32px;">
    <p style="font-size:16px;color:#991b1b;margin:0;font-weight:600;">🗑️ Data Deletion Notice</p>
  </div>
  
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi ${safeName},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">
    To keep your account clean and protect your privacy, we'll automatically delete old data in <strong>${daysLeft} days</strong>.
  </p>
  
  <div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px;text-align:center;">
    <p style="font-size:48px;font-weight:900;color:#ef4444;margin:0;">${itemCount}</p>
    <p style="font-size:14px;color:#666;margin:8px 0 0;">items scheduled for deletion</p>
  </div>
  
  <div style="background:#fef3c7;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="font-size:14px;color:#92400e;margin:0;">
      ⚠️ <strong>Action Required:</strong> If you want to keep this data, please log in and export or save it before the deletion date.
    </p>
  </div>
  
  ${AYN_FOOTER}
</div>
</body>
</html>`
  };
}

// Generate payment receipt email template
function paymentReceiptTemplate(userName: string, amount: string, plan: string, date: string): { subject: string; html: string } {
  const safeName = escapeHtml(userName || 'Customer');
  const safePlan = escapeHtml(plan);
  const safeAmount = escapeHtml(amount);
  const safeDate = escapeHtml(date);
  
  return {
    subject: "✅ AYN Payment Confirmation - " + safePlan,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  ${AYN_HEADER}
  
  <div style="background:#dcfce7;border-left:4px solid #22c55e;padding:16px 20px;margin-bottom:32px;">
    <p style="font-size:16px;color:#166534;margin:0;font-weight:600;">✅ Payment Successful</p>
  </div>
  
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi ${safeName},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">
    Thank you for your payment! Here's your receipt:
  </p>
  
  <div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#666;font-size:14px;">Plan</td>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#333;font-size:14px;text-align:right;font-weight:600;">${safePlan}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#666;font-size:14px;">Amount</td>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#333;font-size:14px;text-align:right;font-weight:600;">${safeAmount}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;color:#666;font-size:14px;">Date</td>
        <td style="padding:12px 0;color:#333;font-size:14px;text-align:right;font-weight:600;">${safeDate}</td>
      </tr>
    </table>
  </div>
  
  <div style="background:#f0f9ff;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="font-size:14px;color:#0369a1;margin:0;">
      🎉 Your upgraded features are now active! Enjoy your enhanced AYN experience.
    </p>
  </div>
  
  ${AYN_FOOTER}
</div>
</body>
</html>`
  };
}

// Generate password reset notification email template (English only)
function passwordResetTemplate(userName: string): { subject: string; html: string } {
  const safeName = escapeHtml(userName || 'there');
  
  return {
    subject: "🔐 AYN: Password Reset Request",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  ${AYN_HEADER}
  
  <div style="background:#f0f9ff;border-left:4px solid #0284c7;padding:16px 20px;margin-bottom:32px;">
    <p style="font-size:16px;color:#0369a1;margin:0;font-weight:600;">🔐 Password Reset Requested</p>
  </div>
  
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi ${safeName},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">
    We received a request to reset your password. A separate email with your password reset link has been sent.
  </p>
  
  <div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px;">
    <p style="font-size:14px;color:#374151;margin:0 0 12px;font-weight:600;">🛡️ Security Tips:</p>
    <ul style="font-size:14px;color:#6b7280;margin:0;padding-left:20px;line-height:1.8;">
      <li>Never share your password or reset link with anyone</li>
      <li>Create a strong password with letters, numbers, and symbols</li>
      <li>The reset link expires in 1 hour for security</li>
    </ul>
  </div>
  
  <div style="background:#fef3c7;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="font-size:14px;color:#92400e;margin:0;">
      ⚠️ <strong>Didn't request this?</strong> If you didn't request a password reset, please ignore this email. Your account is secure.
    </p>
  </div>
  
  ${AYN_FOOTER}
</div>
</body>
</html>`
  };
}

// Generate subscription created email template (English only)
function subscriptionCreatedTemplate(userName: string, planName: string, credits: number, nextBillingDate: string): { subject: string; html: string } {
  const safeName = escapeHtml(userName || 'there');
  const safePlan = escapeHtml(planName);
  const safeDate = escapeHtml(nextBillingDate);
  
  return {
    subject: `🎉 Welcome to AYN ${safePlan}!`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  ${AYN_HEADER}
  
  <div style="background:#dcfce7;border-left:4px solid #22c55e;padding:16px 20px;margin-bottom:32px;">
    <p style="font-size:16px;color:#166534;margin:0;font-weight:600;">🎉 Welcome to ${safePlan}!</p>
  </div>
  
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi ${safeName},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">
    Thank you for subscribing to AYN ${safePlan}! Your account has been upgraded and all premium features are now active.
  </p>
  
  <div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#666;font-size:14px;">Plan</td>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#333;font-size:14px;text-align:right;font-weight:600;">${safePlan}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#666;font-size:14px;">Monthly Credits</td>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#333;font-size:14px;text-align:right;font-weight:600;">${credits}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;color:#666;font-size:14px;">Next Billing</td>
        <td style="padding:12px 0;color:#333;font-size:14px;text-align:right;font-weight:600;">${safeDate}</td>
      </tr>
    </table>
  </div>
  
  <div style="background:#f0f9ff;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="font-size:14px;color:#0369a1;margin:0;">
      🚀 Start exploring your enhanced capabilities now! Your credits have been applied to your account.
    </p>
  </div>
  
  ${AYN_FOOTER}
</div>
</body>
</html>`
  };
}

// Generate subscription renewed email template (English only)
function subscriptionRenewedTemplate(userName: string, planName: string, amount: string, nextBillingDate: string): { subject: string; html: string } {
  const safeName = escapeHtml(userName || 'there');
  const safePlan = escapeHtml(planName);
  const safeAmount = escapeHtml(amount);
  const safeDate = escapeHtml(nextBillingDate);
  
  return {
    subject: `✅ AYN ${safePlan} Renewed`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  ${AYN_HEADER}
  
  <div style="background:#dcfce7;border-left:4px solid #22c55e;padding:16px 20px;margin-bottom:32px;">
    <p style="font-size:16px;color:#166534;margin:0;font-weight:600;">✅ Subscription Renewed</p>
  </div>
  
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi ${safeName},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">
    Your AYN ${safePlan} subscription has been successfully renewed. Your credits have been reset for the new billing period.
  </p>
  
  <div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#666;font-size:14px;">Plan</td>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#333;font-size:14px;text-align:right;font-weight:600;">${safePlan}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#666;font-size:14px;">Amount Paid</td>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#333;font-size:14px;text-align:right;font-weight:600;">${safeAmount}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;color:#666;font-size:14px;">Next Billing</td>
        <td style="padding:12px 0;color:#333;font-size:14px;text-align:right;font-weight:600;">${safeDate}</td>
      </tr>
    </table>
  </div>
  
  <div style="background:#f0f9ff;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="font-size:14px;color:#0369a1;margin:0;">
      🔄 Your monthly credits have been refreshed! Continue enjoying all the premium features.
    </p>
  </div>
  
  ${AYN_FOOTER}
</div>
</body>
</html>`
  };
}

// Generate subscription canceled email template (English only)
function subscriptionCanceledTemplate(userName: string, planName: string, endDate: string): { subject: string; html: string } {
  const safeName = escapeHtml(userName || 'there');
  const safePlan = escapeHtml(planName);
  const safeDate = escapeHtml(endDate);
  
  return {
    subject: "😢 Your AYN Subscription Has Ended",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  ${AYN_HEADER}
  
  <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px 20px;margin-bottom:32px;">
    <p style="font-size:16px;color:#92400e;margin:0;font-weight:600;">😢 Subscription Ended</p>
  </div>
  
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi ${safeName},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">
    Your AYN ${safePlan} subscription has been canceled. Your account has been downgraded to the Free plan.
  </p>
  
  <div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#666;font-size:14px;">Previous Plan</td>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#333;font-size:14px;text-align:right;font-weight:600;">${safePlan}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#666;font-size:14px;">End Date</td>
        <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;color:#333;font-size:14px;text-align:right;font-weight:600;">${safeDate}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;color:#666;font-size:14px;">Current Plan</td>
        <td style="padding:12px 0;color:#333;font-size:14px;text-align:right;font-weight:600;">Free (5 daily credits)</td>
      </tr>
    </table>
  </div>
  
  <div style="background:#f0f9ff;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="font-size:14px;color:#0369a1;margin:0;">
      💡 We'd love to have you back! You can resubscribe anytime to regain access to premium features.
    </p>
  </div>
  
  ${AYN_FOOTER}
</div>
</body>
</html>`
  };
}

// Generate subscription updated email template (English only)
function subscriptionUpdatedTemplate(userName: string, oldPlan: string, newPlan: string, effectiveDate: string): { subject: string; html: string } {
  const safeName = escapeHtml(userName || 'there');
  const safeOldPlan = escapeHtml(oldPlan);
  const safeNewPlan = escapeHtml(newPlan);
  const safeDate = escapeHtml(effectiveDate);
  
  return {
    subject: `📊 AYN Plan Updated to ${safeNewPlan}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  ${AYN_HEADER}
  
  <div style="background:#dbeafe;border-left:4px solid #3b82f6;padding:16px 20px;margin-bottom:32px;">
    <p style="font-size:16px;color:#1e40af;margin:0;font-weight:600;">📊 Plan Updated</p>
  </div>
  
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi ${safeName},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">
    Your AYN subscription has been updated. Here are the details of your plan change:
  </p>
  
  <div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div style="text-align:center;flex:1;">
        <p style="font-size:12px;color:#999;margin:0 0 4px;text-transform:uppercase;">Previous</p>
        <p style="font-size:18px;font-weight:600;color:#666;margin:0;">${safeOldPlan}</p>
      </div>
      <div style="padding:0 16px;color:#999;">→</div>
      <div style="text-align:center;flex:1;">
        <p style="font-size:12px;color:#999;margin:0 0 4px;text-transform:uppercase;">New</p>
        <p style="font-size:18px;font-weight:600;color:#22c55e;margin:0;">${safeNewPlan}</p>
      </div>
    </div>
    <p style="font-size:14px;color:#666;margin:16px 0 0;text-align:center;border-top:1px solid #e5e5e5;padding-top:16px;">
      Effective: ${safeDate}
    </p>
  </div>
  
  <div style="background:#f0f9ff;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="font-size:14px;color:#0369a1;margin:0;">
      ✨ Your new plan benefits are now active! Enjoy your updated capabilities.
    </p>
  </div>
  
  ${AYN_FOOTER}
</div>
</body>
</html>`
  };
}

// Get email template based on type
function getEmailTemplate(
  emailType: string, 
  data: Record<string, unknown>
): { subject: string; html: string } {
  switch (emailType) {
    case 'welcome':
      return welcomeEmailTemplate(data.userName as string);
    case 'credit_warning':
      return creditWarningTemplate(
        data.userName as string,
        data.creditsLeft as number,
        data.totalCredits as number
      );
    case 'auto_delete_warning':
      return autoDeleteWarningTemplate(
        data.userName as string,
        data.itemCount as number,
        data.daysLeft as number
      );
    case 'payment_receipt':
      return paymentReceiptTemplate(
        data.userName as string,
        data.amount as string,
        data.plan as string,
        data.date as string
      );
    case 'password_reset':
      return passwordResetTemplate(data.userName as string);
    case 'subscription_created':
      return subscriptionCreatedTemplate(
        data.userName as string,
        data.planName as string,
        data.credits as number,
        data.nextBillingDate as string
      );
    case 'subscription_renewed':
      return subscriptionRenewedTemplate(
        data.userName as string,
        data.planName as string,
        data.amount as string,
        data.nextBillingDate as string
      );
    case 'subscription_canceled':
      return subscriptionCanceledTemplate(
        data.userName as string,
        data.planName as string,
        data.endDate as string
      );
    case 'subscription_updated':
      return subscriptionUpdatedTemplate(
        data.userName as string,
        data.oldPlan as string,
        data.newPlan as string,
        data.effectiveDate as string
      );
    default:
      throw new Error(`Unknown email type: ${emailType}`);
  }
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      throw new Error("Email service not configured");
    }

    const resend = new Resend(resendApiKey);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { to, emailType, data, userId }: EmailRequest = await req.json();

    if (!to || !emailType) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, emailType" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[send-email] Sending ${emailType} email to ${to}`);

    // Get the appropriate template
    const template = getEmailTemplate(emailType, data);

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      from: "AYN Team <noreply@mail.aynn.io>",
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    console.log(`[send-email] Email sent successfully:`, emailResponse);

    // Log to email_logs table
    if (userId) {
      const { error: logError } = await supabase.from('email_logs').insert({
        user_id: userId,
        email_type: emailType,
        recipient_email: to,
        sent_at: new Date().toISOString(),
        status: 'sent',
        metadata: { resend_id: emailResponse.id, data }
      });

      if (logError) {
        console.error('[send-email] Failed to log email:', logError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, id: emailResponse.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("[send-email] Error:", error);
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
