-- 1. Admin policies: drop raw JWT role claim reliance
DROP POLICY IF EXISTS "Admins can manage custom orders" ON public.custom_orders;
CREATE POLICY "Admins can manage custom orders"
ON public.custom_orders FOR ALL TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::app_role))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage NDAs" ON public.nda_agreements;
CREATE POLICY "Admins can manage NDAs"
ON public.nda_agreements FOR ALL TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::app_role))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::app_role));

-- 2. message_ratings: block anon spoofing of user_id
DROP POLICY IF EXISTS "Users can insert their own feedback" ON public.message_ratings;
CREATE POLICY "Users can insert their own feedback"
ON public.message_ratings FOR INSERT
WITH CHECK (
  (((SELECT auth.uid()) IS NULL) AND user_id IS NULL)
  OR ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id)
);

-- 3. employer_searches: org-scoped access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_searches TO authenticated;
GRANT ALL ON public.employer_searches TO service_role;
ALTER TABLE public.employer_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their searches"
ON public.employer_searches FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.org_members m
  WHERE m.org_id = employer_searches.org_id AND m.user_id = (SELECT auth.uid())
));

CREATE POLICY "Org members can create searches"
ON public.employer_searches FOR INSERT TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = employer_searches.org_id AND m.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Org members can update their searches"
ON public.employer_searches FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.org_members m
  WHERE m.org_id = employer_searches.org_id AND m.user_id = (SELECT auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.org_members m
  WHERE m.org_id = employer_searches.org_id AND m.user_id = (SELECT auth.uid())
));

CREATE POLICY "Org members can delete their searches"
ON public.employer_searches FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.org_members m
  WHERE m.org_id = employer_searches.org_id AND m.user_id = (SELECT auth.uid())
));