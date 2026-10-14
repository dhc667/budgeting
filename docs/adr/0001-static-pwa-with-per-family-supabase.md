# Static PWA with one Supabase instance per family

The app is a static PWA hosted on GitHub Pages with no backend of its own. Each family runs its own Supabase project, and a phone learns which one to use from the invite QR code rather than from anything built into the app. That keeps hosting free and puts each family's data under its own control. The cost is that the app can't assume which schema version a family's database is on, so it ships migrations and checks the schema version at startup.

Because an instance holds exactly one family, every user may see every other user in the instance; privacy boundaries sit at the space level, not the instance level.

The Supabase publishable key in the QR code is public by design. All access control lives in Row Level Security, and the secret key never leaves the instance owner's machine.
