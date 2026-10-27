import * as React from "react"

const ThemeToggle = () => {
  // SSR-safe: both server and client render the light icon first; the
  // effect below syncs to the class set by the pre-paint script in html.js.
  const [theme, setTheme] = React.useState("light")

  React.useEffect(() => {
    setTheme(
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    )
  }, [])

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark"
    document.documentElement.classList.toggle("dark", next === "dark")
    try {
      localStorage.setItem("theme", next)
    } catch (e) {
      // storage unavailable (private mode) — the theme just won't persist
    }
    setTheme(next)
  }

  const isDark = theme === "dark"

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={isDark ? "라이트 모드" : "다크 모드"}
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  )
}

export default ThemeToggle
