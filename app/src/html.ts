/**
 * Minimal server-rendered HTML.
 *
 * No framework on purpose: the whole app must run with `node src/server.ts` and
 * no install step, so a founder can click through the real flow in a minute.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapes text for HTML. Every piece of user input — event names, contributor
 * names, places — passes through here before reaching a page. A family naming
 * their event `Mariage de <Grace>` must not be able to break the page, and
 * somebody pasting a script tag must not be able to attack the next viewer.
 */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** Tagged template that escapes every interpolated value. */
export function h(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? esc(values[i]) : ""), "");
}

/** Marks a string as already-safe HTML, for composing fragments. */
export function raw(html: string): { __html: string } {
  return { __html: html };
}

/** Like `h`, but lets nested fragments through unescaped. */
export function frag(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((out, s, i) => {
    if (i >= values.length) return out + s;
    const v = values[i];
    if (v && typeof v === "object" && "__html" in v) return out + s + (v as { __html: string }).__html;
    if (Array.isArray(v)) return out + s + v.join("");
    return out + s + esc(v);
  }, "");
}

export type LayoutOptions = {
  readonly title: string;
  readonly description?: string;
  /** Open Graph image caption — what WhatsApp shows on the shared card. */
  readonly ogTitle?: string;
  readonly nav?: boolean;
  /**
   * Widens the content column. Reading pages want a ~46rem measure; a table of
   * operations wants room for its columns and is scanned, not read.
   */
  readonly wide?: boolean;
};

export function layout(opts: LayoutOptions, body: string): string {
  const og = opts.ogTitle ?? opts.title;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description ?? "")}" />
<meta property="og:title" content="${esc(og)}" />
<meta property="og:description" content="${esc(opts.description ?? "")}" />
<meta property="og:type" content="website" />
<link rel="stylesheet" href="/styles.css" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text y='13' font-size='13'>📡</text></svg>" />
</head>
<body>
${opts.nav === false ? "" : nav()}
<main${opts.wide ? ' class="wide"' : ""}>
${body}
</main>
<footer>
  <span>Elongo — <em>ensemble</em>, en lingala</span>
  <a href="/ops">Vue opérations</a>
</footer>
</body>
</html>`;
}

function nav(): string {
  return `<header class="topbar">
  <a class="brand" href="/">Elongo</a>
  <nav>
    <a href="/">Réserver</a>
    <a href="/ops">Opérations</a>
  </nav>
</header>`;
}

/** A flash message shown at the top of a page. */
export function notice(kind: "ok" | "warn" | "bad", message: string): string {
  return `<div class="notice ${kind}">${esc(message)}</div>`;
}
