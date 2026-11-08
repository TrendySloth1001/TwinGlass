/** Opens the Phone details window from anywhere (menus, home screen, ⌘K). */
export const PHONE_DETAILS_EVENT = 'twinglass:phone-details'

export function showPhoneDetails(serial: string, name: string): void {
  window.dispatchEvent(new CustomEvent(PHONE_DETAILS_EVENT, { detail: { serial, name } }))
}
