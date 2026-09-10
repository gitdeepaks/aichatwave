/**
 * `unknown` describes a function's input, and nothing else (constraint C1 in
 * `docs/pro_plan.md`).
 *
 * Allowed: a parameter's type, a property of a parameter's inline object type,
 * and a `catch` binding — the three places a value genuinely has no type yet.
 * `Error`'s own `cause` is the canonical example: anything can be thrown, so
 * the honest type of that input is `unknown`.
 *
 * Rejected everywhere else: a field of a named type or interface, a class
 * property, a return type, and any `unknown` nested in a type argument such as
 * `Promise<unknown>`, `unknown[]` or `Record<string, unknown>`. Each of those
 * pushes narrowing onto every consumer instead of parsing once at the edge —
 * which is how the message renderer ended up re-deriving two dozen tool
 * payload fields by hand.
 */

/** @type {import("eslint").Rule.RuleModule} */
const parseBoundaryOnly = {
  meta: {
    type: "problem",
    docs: {
      description: "Allow `unknown` only as a function input or a `catch` binding.",
    },
    schema: [],
    messages: {
      unknownOutsideParseBoundary:
        "`unknown` is allowed only as a function's input (a parameter, a property of a parameter's inline object type, or a `catch` binding). Parse this value into a named domain type at the edge instead.",
    },
  },
  create(context) {
    return {
      TSUnknownKeyword(node) {
        if (isFunctionInput(node)) return;
        context.report({ node, messageId: "unknownOutsideParseBoundary" });
      },
    };
  },
};

/**
 * Walks outward from the `unknown` keyword through inline type structure only.
 * Reaching a parameter binding means this `unknown` types an input; reaching
 * anything else — a type alias, an interface, a class body, a return position,
 * a type argument — means it does not.
 */
function isFunctionInput(node) {
  let current = node;

  while (current.parent) {
    const parent = current.parent;

    if (parent.type === "TSTypeAnnotation") {
      const binding = parent.parent;
      if (!binding) return false;

      // A property of an object type: keep walking out to see whose type it is.
      if (binding.type === "TSPropertySignature") {
        current = binding;
        continue;
      }

      const owner = binding.parent;
      if (!owner) return false;
      if (owner.type === "CatchClause") return true;
      return Array.isArray(owner.params) && owner.params.includes(binding);
    }

    if (
      parent.type === "TSTypeLiteral" ||
      parent.type === "TSPropertySignature" ||
      parent.type === "TSUnionType" ||
      parent.type === "TSIntersectionType"
    ) {
      current = parent;
      continue;
    }

    return false;
  }

  return false;
}

export default { rules: { "parse-boundary-only": parseBoundaryOnly } };
