# Any user can issue invite codes

Partly supersedes ADR 0004: issuing invite codes is no longer only the instance owner's job. Any signed-in user can create one in the app, which shows it as a QR code and a link to share. An instance holds one family, and everyone in it already sees everyone else (ADR 0001), so keeping the owner as the only gate added a step without protecting anything the family cares about.

Users may insert only a code's hash. The expiry comes from the column default, 24 hours, and a user can't read codes back or mark them used. The hook and trigger from ADR 0004 still check every signup, and the owner's CLI still issues codes with any expiry.

## Considered options

- **Only the instance owner invites, in the app too**: rejected. The database doesn't know who the owner is, since that's whoever holds the secret key, so it would need an owner flag on profiles and a way to set it, all to stop family members from inviting family.

## Consequences

- Anyone in the family can let someone new in. A link shared in a chat lets in whoever opens it first, but only once and only within 24 hours.
- A new user starts with only their private space. Someone has to add them to a shared space afterwards.
