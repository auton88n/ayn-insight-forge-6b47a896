-- NDA/contract-signing was the last live piece of the retired consulting
-- product (custom_orders, nda_agreements, both served by the sign-document
-- edge function). Removed on direct request. Real data existed here: 3
-- founder-testing NDAs, one genuine signed NDA with an external company
-- (Establishment MAGAMRAT AL-ASAFA For Tourism / STORM), and one signed
-- custom_orders contract -- all confirmed by the founder to not need
-- exporting before deletion. Signature image files were removed from the
-- generated-files/signatures/ storage path separately (via a one-time
-- service-role cleanup, since storage.protect_delete blocks direct SQL
-- deletion of storage.objects). No other table has a foreign key into
-- either table.
drop table if exists public.nda_agreements;
drop table if exists public.custom_orders;
