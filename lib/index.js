/**
 * Host half of dsh-skin-studio.
 *
 * The loader `import()`s this entry to mount the row, so the package needs a
 * real main export even though every feature lives in the browser half
 * (`./client`). There is deliberately no host state: the studio persists to
 * `localStorage` and never talks to the Host.
 */

/** Row identity shown in the plugin inventory. */
export const name = 'skin-studio'

/** No host-side behaviour. */
export function apply() {}
