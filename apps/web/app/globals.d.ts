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

declare global {
  var test: typeof import("node:test").test;
  var describe: typeof import("node:test").describe;
  var it: typeof import("node:test").it;
  var before: typeof import("node:test").before;
  var after: typeof import("node:test").after;
  var beforeEach: typeof import("node:test").beforeEach;
  var afterEach: typeof import("node:test").afterEach;
  var expect: (actual: any) => any;

  interface Window {
    __EDITOR__?: any;
    opera?: any;
  }

  interface EventTarget {
    files?: FileList | null;
    select?: () => void;
  }

  interface Element {
    contentEditable?: string;
  }

  interface ObjectConstructor {
    values(o: any): any[];
    entries(o: any): [string, any][];
  }
}

declare module "react" {
  function createContext(defaultValue: null): import("react").Context<any>;
  function useRef(initialValue: null): import("react").RefObject<any>;
  function useState(initialState: null): [any, import("react").Dispatch<any>];
  function useState(initialState: never[]): [any[], import("react").Dispatch<any[]>];
  function useState(initialState: Set<unknown>): [
    Set<any>,
    import("react").Dispatch<any>,
  ];
}

export {};
