// Ambient module declarations for Next.js static asset imports.
// Next.js resolves these at build time (webpack/turbopack); TypeScript needs
// the declarations so `checkJs` does not report them as missing modules.

declare module "*.webp" {
  const content: import("next/image").StaticImageData;
  export default content;
}
declare module "*.png" {
  const content: import("next/image").StaticImageData;
  export default content;
}
declare module "*.jpg" {
  const content: import("next/image").StaticImageData;
  export default content;
}
declare module "*.jpeg" {
  const content: import("next/image").StaticImageData;
  export default content;
}
declare module "*.gif" {
  const content: import("next/image").StaticImageData;
  export default content;
}
declare module "*.avif" {
  const content: import("next/image").StaticImageData;
  export default content;
}
declare module "*.svg" {
  // Without SVGR these import as a static asset; typed loosely so the import
  // works whether used as an image source or (with SVGR) a component.
  const content: any;
  export default content;
}

// Side-effect CSS imports (e.g. "./globals.css", "driver.js/dist/driver.css").
declare module "*.css";
