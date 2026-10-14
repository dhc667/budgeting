# Signup only through one-time invite codes from the instance owner's CLI

The instance owner runs a CLI on their own machine that stores a hashed, expiring invite code and prints a terminal QR code carrying the app URL, the Supabase URL, the publishable key and the code. Signup passes the code in user metadata. A before-user-created auth hook rejects bad, used or expired codes with a readable error, and a trigger after the insert into `auth.users` consumes the code and creates the new user's private space in the same transaction, so two simultaneous signups with one code can't both succeed.

Because the invite code is the gate, email confirmation is off and no SMTP is configured. Password resets also go through the instance owner's CLI.

Invite codes expire after 24 hours by default; the CLI takes a flag to change that.
