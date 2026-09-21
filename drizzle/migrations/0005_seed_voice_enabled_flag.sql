INSERT INTO public.app_secrets (key, value)
SELECT 'voice_enabled', 'false'
WHERE NOT EXISTS (SELECT 1 FROM public.app_secrets WHERE key = 'voice_enabled');