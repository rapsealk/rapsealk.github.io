import * as React from "react"
import { Link } from "gatsby"

const RedirectTemplate = ({ pageContext: { to } }) => (
  <main className="redirect-page">
    <p>
      Moved to <Link to={to}>{to}</Link>. Redirecting…
    </p>
  </main>
)

export default RedirectTemplate

export const Head = ({ pageContext: { to } }) => (
  <>
    <title>Redirecting…</title>
    <meta httpEquiv="refresh" content={`0; url=${to}`} />
    <link rel="canonical" href={to} />
  </>
)
