-- The 'duty' staff role has been confirmed dead across several past audits:
-- zero holders, and useAuth.ts (its only reader) has zero importers. This
-- removes every real access path it ever granted: has_duty_access() is gone
-- and the 16 policies that called it now check admin directly. The bare enum
-- label itself is left in app_role -- has_role() is depended on by 100+
-- policies across old legacy tables, so rebuilding that type to drop one
-- unused label is a disproportionate blast radius for a value nothing can
-- reach or assign any more.

drop policy "Duty and admins can delete application replies" on public.application_replies;
create policy "Admins can delete application replies" on public.application_replies for delete
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can insert application replies" on public.application_replies;
create policy "Admins can insert application replies" on public.application_replies for insert
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can view all application replies" on public.application_replies;
create policy "Admins can view all application replies" on public.application_replies for select
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can update application replies" on public.application_replies;
create policy "Admins can update application replies" on public.application_replies for update
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can manage FAQs" on public.faq_items;
create policy "Admins can manage FAQs" on public.faq_items for all
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can view all FAQs" on public.faq_items;
create policy "Admins can view all FAQs" on public.faq_items for select
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can delete applications" on public.service_applications;
create policy "Admins can delete applications" on public.service_applications for delete
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can view all applications" on public.service_applications;
create policy "Admins can view all applications" on public.service_applications for select
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can update applications" on public.service_applications;
create policy "Admins can update applications" on public.service_applications for update
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can delete tickets" on public.support_tickets;
create policy "Admins can delete tickets" on public.support_tickets for delete
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can view all tickets" on public.support_tickets;
create policy "Admins can view all tickets (2)" on public.support_tickets for select
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can update all tickets" on public.support_tickets;
create policy "Admins can update all tickets" on public.support_tickets for update
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can delete ticket messages" on public.ticket_messages;
create policy "Admins can delete ticket messages" on public.ticket_messages for delete
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can create ticket messages" on public.ticket_messages;
create policy "Admins can create ticket messages" on public.ticket_messages for insert
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can view all ticket messages" on public.ticket_messages;
create policy "Admins can view all ticket messages" on public.ticket_messages for select
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy "Duty and admins can update ticket messages" on public.ticket_messages;
create policy "Admins can update ticket messages" on public.ticket_messages for update
  using (has_role(auth.uid(), 'admin'::app_role));

drop function public.has_duty_access(uuid);
