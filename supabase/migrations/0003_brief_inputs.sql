-- Record what the coach saw, so a wrong answer can be debugged.
--
-- She got a brief saying "HRV dropped hard overnight" when it hadn't. Working
-- out why took raw SQL across three tables, cross-referenced against the numbers
-- the coach happened to quote — because nothing recorded what it was actually
-- looking at. She asked, fairly: how do I debug this?
--
-- Right now she can't. Nothing persists the inputs. So every wrong answer is
-- either accepted or escalated to someone who can write SQL, and a coach you
-- can't audit is a coach you have to take on faith. That's the opposite of the
-- point.
--
-- `inputs` holds what it was told and what it went and read:
--   { generated_at, model, context, lookups: [{ name, input }] }
--
-- Deliberately NOT the tool results — they can be large, they're reproducible by
-- re-running the same lookup, and the context is what actually catches this
-- class of bug (the stale-health-date was sitting right there in it).

alter table hrl_briefs
  add column if not exists inputs jsonb;

comment on column hrl_briefs.inputs is
  'What the coach saw when it wrote this: {generated_at, model, context, lookups:[{name,input}]}. Debug surface for "why did it say that?".';
