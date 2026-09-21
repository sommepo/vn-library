// Assumed read status never writes Activity.seen or presentation occurrences.
export function isRead(activity, engine, id) {
  return Boolean(id && (Object.hasOwn(activity?.data.seen || {}, id) || engine?.isInheritedRead?.(id)));
}
