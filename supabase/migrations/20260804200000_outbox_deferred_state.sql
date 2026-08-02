-- The outbox needs a word for "we chose not to send this".
--
-- Resend and custom SMTP are deferred: Wix blocks the DNS a verified sender
-- domain needs, and the club recognises new members through the portal instead.
-- Without a state for that, a queued event either retries forever against a
-- provider that does not exist, or gets marked 'failed' — and a failure count
-- for something nobody chose to break is a number people learn to ignore.
--
-- 'disabled_unconfigured' says exactly what happened: the membership succeeded,
-- the event is kept, and nothing was sent because there is nowhere to send it.
alter table public.fan_notification_outbox
  drop constraint if exists fan_notification_outbox_status_check;

alter table public.fan_notification_outbox
  add constraint fan_notification_outbox_status_check
  check (status in ('pending','sent','failed','abandoned','disabled_unconfigured'));

comment on column public.fan_notification_outbox.status is
  'pending | sent | failed | abandoned | disabled_unconfigured (deferred by decision, event preserved)';
