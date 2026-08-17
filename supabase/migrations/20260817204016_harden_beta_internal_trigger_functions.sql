-- Trigger-only SECURITY DEFINER functions must not be callable through the Data API.
revoke all on function public.emit_edition_pulse_event() from public, anon, authenticated;
revoke all on function public.emit_show_pulse_events() from public, anon, authenticated;
revoke all on function public.emit_prediction_round_pulse_events() from public, anon, authenticated;
revoke all on function public.capture_prediction_snapshot_after_submission() from public, anon, authenticated;
revoke all on function public.validate_fan_taste_ballot() from public, anon, authenticated;

grant execute on function public.emit_edition_pulse_event() to service_role;
grant execute on function public.emit_show_pulse_events() to service_role;
grant execute on function public.emit_prediction_round_pulse_events() to service_role;
grant execute on function public.capture_prediction_snapshot_after_submission() to service_role;
grant execute on function public.validate_fan_taste_ballot() to service_role;
