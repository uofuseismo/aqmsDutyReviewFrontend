/**
 * A username field for a password form that does not visibly have one.
 *
 * Chrome warns about password forms with no username field, and the reason is
 * practical rather than pedantic: a password manager uses it to decide WHICH
 * account a saved or changed password belongs to. Without it, changing a
 * password can silently create a second, orphaned entry - and on the lock
 * screen the manager cannot offer the right credential at all.
 *
 * Visually hidden by clipping rather than `display: none`, because a field
 * that is not laid out is skipped by some managers. It is readonly, out of
 * the tab order, and hidden from assistive technology: the user's name is
 * already stated in visible text next to it, so announcing an unlabelled
 * read-only textbox as well would be noise.
 */
export function HiddenUsernameField({ user }: { user: string }) {
  return (
    <input
      type="text"
      name="username"
      autoComplete="username"
      value={user}
      readOnly
      tabIndex={-1}
      aria-hidden="true"
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    />
  )
}
