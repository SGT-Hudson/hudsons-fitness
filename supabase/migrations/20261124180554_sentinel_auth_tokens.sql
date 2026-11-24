-- GoTrue scans these columns as strings: a NULL makes every admin listing of users fail
-- ("Database error finding users"). The sentinel was inserted by SQL without them
-- (20260520120000_r01_library_anon_seed.sql). Applied in production on 2026-11-24.
update auth.users
set confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    email_change = coalesce(email_change, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    reauthentication_token = coalesce(reauthentication_token, '')
where id = '00000000-0000-0000-0000-00000000a0a0';
