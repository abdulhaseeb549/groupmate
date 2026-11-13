/**
 * Mirrors the SQL compute_initials() in migration 0001 — that function only
 * runs at signup (handle_new_user's trigger), so a client-side profile edit
 * has to recompute this itself or the avatar goes stale the moment someone
 * renames themselves.
 */
export function computeInitials(name: string): string {
  const trimmed = name.trim();
  // Dots, underscores and dashes split words too: a name taken from an
  // email ("ayesha.khan") should read "AK", not "AY".
  const words = trimmed.split(/[\s._-]+/).filter(Boolean);
  const initials = words.length >= 2 ? words[0][0] + words[1][0] : trimmed.slice(0, 2);
  return initials.toUpperCase();
}
