CREATE SEQUENCE IF NOT EXISTS public.schedule_items_short_id_seq START WITH 1000 INCREMENT BY 1;

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS short_id bigint NOT NULL DEFAULT nextval('public.schedule_items_short_id_seq');

ALTER SEQUENCE public.schedule_items_short_id_seq OWNED BY public.schedule_items.short_id;

CREATE UNIQUE INDEX IF NOT EXISTS schedule_items_short_id_key ON public.schedule_items (short_id);