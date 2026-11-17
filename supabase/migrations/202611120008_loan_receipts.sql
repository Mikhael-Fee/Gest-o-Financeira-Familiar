alter table public.entries add column loan_id uuid references public.plans;
alter table public.entries add constraint loan_receipt_has_contract check(kind<>'loan_received' or loan_id is not null);
