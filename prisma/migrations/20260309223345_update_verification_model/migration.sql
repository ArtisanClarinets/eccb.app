-- Correct verification model entries that were set to the deprecated text-only GEMMA model.
-- Admin UI defaults and provider metadata now use a vision-capable model.

UPDATE SystemSetting
SET value = 'meta-llama/llama-3.2-11b-vision-instruct:free'
WHERE `key` IN ('llm_verification_model','smart_upload_verification_model')
  AND value = 'google/gemma-3-27b-it:free';