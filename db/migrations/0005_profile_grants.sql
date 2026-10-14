grant select on public.profiles to authenticated;
--> statement-breakpoint
grant update (display_name, display_currency) on public.profiles to authenticated;
--> statement-breakpoint
-- The owner's CLI issues invite codes with the secret key.
grant select, insert on public.invite_codes to service_role;
