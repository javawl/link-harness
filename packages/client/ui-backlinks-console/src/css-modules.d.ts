/** CSS-module sidecar declarations for this package's bundled stylesheets. */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
