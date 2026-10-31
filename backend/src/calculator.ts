/**
 * Small, eval-free calculator for root search: arithmetic, ^, %, !, parentheses,
 * implicit multiplication, a handful of functions and constants.
 * Percent follows Soulver/Raycast semantics: `200 + 10%` = 220, `10% * 50` = 5.
 */

type Token =
  | { type: "num"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: string };

type Value = { value: number; percent: boolean };

const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  ln: Math.log,
  log: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E, tau: Math.PI * 2 };
const MULTIPLY = new Set(["*", "x", "×"]);
const DIVIDE = new Set(["/", "÷"]);

export type Calculation = { expression: string; result: string; raw: string };

export function calculate(expression: string): Calculation | null {
  const input = expression.trim();
  if (!input) return null;
  let tokens: Token[];
  try {
    tokens = tokenize(input);
  } catch {
    return null;
  }
  // A lone number is not a calculation.
  if (!tokens.some((t) => t.type === "op" || t.type === "ident")) return null;
  try {
    const parser = new Parser(tokens);
    const { value } = parser.parse();
    if (!Number.isFinite(value)) return null;
    const cleaned = Number(value.toPrecision(12));
    return { expression: input, result: format(cleaned), raw: formatRaw(cleaned) };
  } catch {
    return null;
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const pattern =
    /\s*(?:(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d*\.?\d+(?:e[+-]?\d+)?)|([a-zA-Zπ][a-zA-Z0-9]*)|(\*\*|[-+*/^%!()×÷]))/y;
  let index = 0;
  while (index < input.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(input);
    if (!match) {
      if (/^\s*$/.test(input.slice(index))) break;
      throw new Error(`Unexpected input at ${index}`);
    }
    index = pattern.lastIndex;
    const [, number, ident, op] = match;
    if (number !== undefined) tokens.push({ type: "num", value: Number(number.replaceAll(",", "")) });
    else if (ident !== undefined) tokens.push({ type: "ident", value: ident.toLowerCase() });
    else if (op !== undefined) tokens.push({ type: "op", value: op === "**" ? "^" : op });
  }
  return tokens;
}

class Parser {
  private index = 0;
  constructor(private tokens: Token[]) {}

  parse(): Value {
    const result = this.additive();
    if (this.index < this.tokens.length) throw new Error("Trailing input");
    return result;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private isOp(value: string | Set<string>): boolean {
    const token = this.peek();
    if (!token) return false;
    const symbol = token.type === "op" || (token.type === "ident" && token.value === "x") ? token.value : null;
    if (symbol === null) return false;
    return typeof value === "string" ? symbol === value : value.has(symbol);
  }

  private additive(): Value {
    let left = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const sign = (this.tokens[this.index++] as Token).value === "+" ? 1 : -1;
      const right = this.multiplicative();
      left = right.percent
        ? { value: left.value * (1 + sign * right.value), percent: false }
        : { value: left.value + sign * right.value, percent: false };
    }
    return left;
  }

  private multiplicative(): Value {
    let left = this.unary();
    for (;;) {
      if (this.isOp(MULTIPLY)) {
        this.index++;
        left = { value: left.value * this.unary().value, percent: false };
      } else if (this.isOp(DIVIDE)) {
        this.index++;
        left = { value: left.value / this.unary().value, percent: false };
      } else if (this.startsOperand()) {
        // Implicit multiplication: 2pi, 3(4+5), (1+2)(3+4)
        left = { value: left.value * this.unary().value, percent: false };
      } else {
        return left;
      }
    }
  }

  private startsOperand(): boolean {
    const token = this.peek();
    if (!token) return false;
    if (token.type === "num") return true;
    if (token.type === "ident") return token.value !== "x";
    return token.value === "(";
  }

  private unary(): Value {
    if (this.isOp("-")) {
      this.index++;
      const operand = this.unary();
      return { value: -operand.value, percent: operand.percent };
    }
    if (this.isOp("+")) {
      this.index++;
      return this.unary();
    }
    return this.power();
  }

  private power(): Value {
    const base = this.postfix();
    if (this.isOp("^")) {
      this.index++;
      return { value: base.value ** this.unary().value, percent: false };
    }
    return base;
  }

  private postfix(): Value {
    let operand = this.primary();
    for (;;) {
      if (this.isOp("%")) {
        this.index++;
        operand = { value: operand.value / 100, percent: true };
      } else if (this.isOp("!")) {
        this.index++;
        operand = { value: factorial(operand.value), percent: false };
      } else {
        return operand;
      }
    }
  }

  private primary(): Value {
    const token = this.tokens[this.index++];
    if (!token) throw new Error("Unexpected end");
    if (token.type === "num") return { value: token.value, percent: false };
    if (token.type === "op" && token.value === "(") {
      const inner = this.additive();
      this.expect(")");
      return inner;
    }
    if (token.type === "ident") {
      const fn = FUNCTIONS[token.value];
      if (fn) {
        this.expect("(");
        const argument = this.additive();
        this.expect(")");
        return { value: fn(argument.value), percent: false };
      }
      const constant = CONSTANTS[token.value];
      if (constant !== undefined) return { value: constant, percent: false };
    }
    throw new Error(`Unexpected token ${token.value}`);
  }

  private expect(op: string) {
    const token = this.tokens[this.index++];
    if (!token || token.type !== "op" || token.value !== op) throw new Error(`Expected ${op}`);
  }
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error("Invalid factorial");
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function useExponent(value: number): boolean {
  const magnitude = Math.abs(value);
  return magnitude >= 1e15 || (magnitude !== 0 && magnitude < 1e-6);
}

function format(value: number): string {
  if (useExponent(value)) return formatRaw(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 }).format(value);
}

function formatRaw(value: number): string {
  if (useExponent(value)) return value.toExponential(8).replace(/\.?0+e/, "e");
  return String(value);
}
