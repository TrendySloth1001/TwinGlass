/** Mirrors the macOS light/dark appearance onto <html class="dark"> (shadcn's dark variant). */
export function followSystemTheme(): void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => void document.documentElement.classList.toggle('dark', mq.matches)
  apply()
  mq.addEventListener('change', apply)
}
