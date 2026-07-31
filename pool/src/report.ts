const useColour = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const ESC = "\x1b";
const c = (code: string, s: string): string =>
  useColour ? `${ESC}[${code}m${s}${ESC}[0m` : s;

export const bold = (s: string) => c("1", s);
export const dim = (s: string) => c("2", s);
export const green = (s: string) => c("32", s);
export const yellow = (s: string) => c("33", s);
export const red = (s: string) => c("31", s);
export const cyan = (s: string) => c("36", s);

/** Pads to a visible width, ignoring the ANSI escapes colouring added. */
export function padVisible(coloured: string, plain: string, width: number, left = true): string {
  const gap = " ".repeat(Math.max(0, width - plain.length));
  return left ? gap + coloured : coloured + gap;
}

export function rule(width = 76): string {
  return dim("─".repeat(width));
}

export function heading(title: string, sub?: string): void {
  console.log("");
  console.log(bold(`  ${title}`));
  if (sub) console.log(dim(`  ${sub}`));
  console.log(`  ${rule()}`);
}

export function pct(x: number, dp = 1): string {
  return `${(x * 100).toFixed(dp)}%`;
}

export function bar(share: number, width = 28, ch = "█"): string {
  return ch.repeat(Math.max(0, Math.min(width, Math.round(share * width))));
}
