-- Register SSC General Regulations v4.1 Chapter 22 with the canonical
-- server-side rule registry used by Official Interpretations validation.
--
-- This is intentionally additive: historical rule identifiers remain valid,
-- while the newly published Roleplay & Worldbuilding rules become eligible
-- for canonical interpretation references.

insert into public.ssc_rule_registry (rule_id, chapter_number, rule_number)
values
  ('22.1', 22, 1),
  ('22.2', 22, 2),
  ('22.3', 22, 3),
  ('22.4', 22, 4),
  ('22.5', 22, 5),
  ('22.6', 22, 6),
  ('22.7', 22, 7),
  ('22.8', 22, 8),
  ('22.9', 22, 9),
  ('22.10', 22, 10),
  ('22.11', 22, 11)
on conflict (rule_id) do update
set chapter_number = excluded.chapter_number,
    rule_number = excluded.rule_number;
