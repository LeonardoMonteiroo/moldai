import { describe, it, expect } from "vitest";
import {
  maskComments,
  classifyPath,
  checkPtBrText,
  checkHexColors,
  checkFetch,
  checkI18nKeys,
  placeholdersOf,
  resolveKey,
} from "./check-conventions.mjs";

describe("classifyPath", () => {
  it("brings lib/ into scope", () => {
    expect(classifyPath("lib/sizeCharts/seed.ts")).toEqual({
      isLib: true,
      isTsx: false,
      isApiRoute: false,
      isRawOutputText: false,
      isRawOutputColor: false,
    });
  });

  it("keeps scripts/ and prisma/ out of scope", () => {
    expect(classifyPath("scripts/cron-renew.ts")).toBeNull();
    expect(classifyPath("prisma/schema.prisma")).toBeNull();
  });

  it("flags app/api/** route handlers", () => {
    expect(classifyPath("app/api/patterns/route.ts")).toEqual({
      isLib: false,
      isTsx: false,
      isApiRoute: true,
      isRawOutputText: false,
      isRawOutputColor: false,
    });
  });

  it("flags .tsx anywhere in scope", () => {
    expect(classifyPath("components/editor/ChatPanel.tsx")).toEqual({
      isLib: false,
      isTsx: true,
      isApiRoute: false,
      isRawOutputText: false,
      isRawOutputColor: false,
    });
  });

  it("exempts known raw-output modules from CHECK 1/2 (whole-repo audit, see header comment)", () => {
    expect(classifyPath("lib/export/svg.ts")).toMatchObject({
      isRawOutputText: true,
      isRawOutputColor: true,
    });
    expect(classifyPath("lib/mail/templates.ts")).toMatchObject({
      isRawOutputText: false, // its copy DOES go through Translate — a leak there is real
      isRawOutputColor: true,
    });
    expect(classifyPath("lib/editor/thumbnail.ts")).toMatchObject({
      isRawOutputText: false,
      isRawOutputColor: true,
    });
    expect(classifyPath("lib/ai/prompt.ts")).toMatchObject({
      isRawOutputText: true,
      isRawOutputColor: false,
    });
    // A sibling file in lib/editor/ that ISN'T thumbnail.ts stays fully in scope.
    expect(classifyPath("lib/editor/state.ts")).toMatchObject({
      isRawOutputText: false,
      isRawOutputColor: false,
    });
  });
});

describe("checkPtBrText", () => {
  it("flags a hardcoded pt-BR literal in a lib/ fixture (widened scope)", () => {
    const src = 'export const label = "Configurações";\n';
    const findings = [];
    checkPtBrText(maskComments(src), "lib/sizeCharts/seed.ts", findings);
    expect(findings).toHaveLength(1);
    expect(findings[0].check).toBe("1 · hardcoded pt-BR display text");
    expect(findings[0].line).toBe(1);
  });

  it("flags a hardcoded pt-BR literal in an app/api/**/*.ts route handler", () => {
    const src = 'return NextResponse.json({ error: "Não autorizado" });\n';
    const findings = [];
    checkPtBrText(maskComments(src), "app/api/account/profile/route.ts", findings);
    expect(findings).toHaveLength(1);
  });

  it("does not flag pt-BR text inside a masked comment", () => {
    const src = "// Configurações do usuário\nexport const x = 1;\n";
    const findings = [];
    checkPtBrText(maskComments(src), "lib/example.ts", findings);
    expect(findings).toHaveLength(0);
  });
});

describe("checkHexColors", () => {
  it("flags a hardcoded hex color in a .ts fixture (widened scope)", () => {
    const src = 'export const brand = "#4a5a3a";\n';
    const findings = [];
    checkHexColors(maskComments(src), "lib/theme.ts", findings);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("#4a5a3a");
  });

  it("still flags a hex color in a .tsx fixture", () => {
    const src = 'const style = { color: "#123456" };\n';
    const findings = [];
    checkHexColors(maskComments(src), "components/Foo.tsx", findings);
    expect(findings).toHaveLength(1);
  });
});

describe("checkFetch", () => {
  it("flags a direct fetch() call in a client component", () => {
    const src = "async function load() { await fetch(\"/api/patterns\"); }\n";
    const findings = [];
    checkFetch(maskComments(src), "components/editor/ChatPanel.tsx", findings);
    expect(findings).toHaveLength(1);
  });

  it("does not flag prefetch(/refetch(", () => {
    const src = "prefetch(); refetch();\n";
    const findings = [];
    checkFetch(maskComments(src), "components/editor/ChatPanel.tsx", findings);
    expect(findings).toHaveLength(0);
  });
});

describe("checkI18nKeys", () => {
  const messages = {
    PatternData: {
      newPatternName: "Novo molde",
      countLabel: "{count} moldes",
      greeting: "Olá {name}, você tem {count} moldes",
    },
    PlanSection: {
      plans: {
        free: { name: "Grátis" },
        atelier: { name: "Ateliê" },
      },
    },
  };

  function run(src) {
    const findings = [];
    checkI18nKeys(maskComments(src), "components/Fixture.tsx", findings, messages);
    return findings;
  }

  it("blocks on a missing literal key", () => {
    const src = 'const t = useTranslations("PatternData"); t("doesNotExist");\n';
    const findings = run(src);
    expect(findings.some((f) => f.check === "4 · missing i18n key")).toBe(true);
  });

  it("resolves an existing literal key with no placeholders cleanly", () => {
    const src = 'const t = useTranslations("PatternData"); t("newPatternName");\n';
    const findings = run(src);
    expect(findings).toHaveLength(0);
  });

  it("emits a non-blocking finding for a template-literal key, not a silent skip", () => {
    const src =
      'const tPlan = useTranslations("PlanSection"); tPlan(`plans.${plan}.name`);\n';
    const findings = run(src);
    expect(findings).toHaveLength(1);
    expect(findings[0].check).toBe("4 · unresolvable i18n key");
    expect(findings[0].severity).toBe("warning");
  });

  it("emits a non-blocking finding for a concatenated key, not a silent skip", () => {
    const src = 'const t = useTranslations("PlanSection"); t("plans." + plan + ".name");\n';
    const findings = run(src);
    expect(findings.some((f) => f.check === "4 · unresolvable i18n key" && f.severity === "warning")).toBe(
      true
    );
  });

  it("blocks when a {placeholder} value is needed and no values object is passed", () => {
    const src = 'const t = useTranslations("PatternData"); t("countLabel");\n';
    const findings = run(src);
    expect(findings.some((f) => f.check === "4 · missing i18n value")).toBe(true);
  });

  it("blocks when the values object literal is missing a needed placeholder", () => {
    const src = 'const t = useTranslations("PatternData"); t("greeting", { name: "Ana" });\n';
    const findings = run(src);
    const missing = findings.find((f) => f.check === "4 · missing i18n value");
    expect(missing).toBeDefined();
    expect(missing.message).toContain("count");
  });

  it("passes when the values object literal supplies every needed placeholder", () => {
    const src =
      'const t = useTranslations("PatternData"); t("greeting", { name: "Ana", count: 3 });\n';
    const findings = run(src);
    expect(findings.filter((f) => f.check.startsWith("4"))).toHaveLength(0);
  });

  it("stays silent (unresolvable, not wrong) when the second argument is a variable", () => {
    const src = 'const t = useTranslations("PatternData"); t("countLabel", opts);\n';
    const findings = run(src);
    expect(findings).toHaveLength(0);
  });

  it("warns (does not block) when an extra value is supplied that the string doesn't use", () => {
    const src =
      'const t = useTranslations("PatternData"); t("newPatternName", { stale: 1 });\n';
    const findings = run(src);
    expect(findings).toHaveLength(1);
    expect(findings[0].check).toBe("4 · unused i18n value");
    expect(findings[0].severity).toBe("warning");
  });

  it("does not warn 'unused' for a value only used inside a nested select branch", () => {
    // Regression: messages/pt-BR.json's real ConflictInfoCard.gapLabel nests {diff}
    // inside a {direction, select, ...} branch. Before placeholdersOf understood nested
    // placeholders, this call site false-positived as "passes {diff} which the string
    // doesn't use" even though the string genuinely uses it.
    const nestedMessages = {
      ConflictInfoCard: {
        gapLabel:
          "{direction, select, larger {falta {diff} cm na copa} smaller {sobra {diff} cm na copa} other {}}",
      },
    };
    const src =
      'const t = useTranslations("ConflictInfoCard"); t("gapLabel", { direction, diff });\n';
    const findings = [];
    checkI18nKeys(maskComments(src), "components/Fixture.tsx", findings, nestedMessages);
    expect(findings).toHaveLength(0);
  });
});

describe("placeholdersOf", () => {
  it("extracts the ICU plural argument name", () => {
    expect(placeholdersOf("{count, plural, one {# molde} other {# moldes}}")).toEqual(["count"]);
  });

  it("returns an empty array for a plain string", () => {
    expect(placeholdersOf("Novo molde")).toEqual([]);
  });

  it("ignores non-string input", () => {
    expect(placeholdersOf(undefined)).toEqual([]);
  });

  it("does not misread a plural branch's literal message text as a placeholder name", () => {
    // Real catalog string (messages/pt-BR.json PatternGrid.countLabel) — a naive
    // /\{name/g scan matches "{Nenhum molde}"'s own opening brace as a second
    // placeholder named "Nenhum". Verified false positive, now fixed.
    expect(placeholdersOf("{count, plural, =0 {Nenhum molde} one {# molde} other {# moldes}}")).toEqual([
      "count",
    ]);
  });

  it("finds a placeholder genuinely nested inside a select branch's message", () => {
    // Real catalog string (messages/pt-BR.json ConflictInfoCard.gapLabel).
    expect(
      placeholdersOf(
        "{direction, select, larger {falta {diff} cm na copa} smaller {sobra {diff} cm na copa} other {}}"
      )
    ).toEqual(["direction", "diff"]);
  });
});

describe("CHECK 1/2 lib/ exemptions (main()'s gating logic, mirrored)", () => {
  // Mirrors main()'s `if (isTsx || isApiRoute || (isLib && !isRawOutputText)) ...` gate,
  // exercised against real false-positive shapes found in a whole-repo audit before this
  // shipped (lib/export/*, lib/mail/templates.ts, lib/editor/thumbnail.ts, lib/ai/prompt.ts).
  function gatedFindings(rel, src) {
    const scope = classifyPath(rel);
    const masked = maskComments(src);
    const findings = [];
    if (scope.isTsx || scope.isApiRoute || (scope.isLib && !scope.isRawOutputText)) {
      checkPtBrText(masked, rel, findings);
    }
    if (scope.isTsx || scope.isApiRoute || (scope.isLib && !scope.isRawOutputColor)) {
      checkHexColors(masked, rel, findings);
    }
    return findings;
  }

  it("does not flag a raw SVG stroke color in lib/export/svg.ts", () => {
    const src = 'export const line = `<line stroke="#4a5a3a" stroke-width="0.3"/>`;\n';
    expect(gatedFindings("lib/export/svg.ts", src)).toHaveLength(0);
  });

  it("does not flag exported-file metadata pt-BR text in lib/export/dxf.ts", () => {
    const src =
      'export const header = `MoldAI · tam ${size} · folga ${allowance}cm (linha de costura líquida)`;\n';
    expect(gatedFindings("lib/export/dxf.ts", src)).toHaveLength(0);
  });

  it("does not flag raw HTML email colors in lib/mail/templates.ts", () => {
    const src = 'export const html = `<body style="background:#f7f7f2;color:#26261f;">`;\n';
    expect(gatedFindings("lib/mail/templates.ts", src)).toHaveLength(0);
  });

  it("does not flag the raw SVG fill in lib/editor/thumbnail.ts", () => {
    const src = 'export const svg = `<g fill="#fff" stroke="#1c1c19"></g>`;\n';
    expect(gatedFindings("lib/editor/thumbnail.ts", src)).toHaveLength(0);
  });

  it("does not flag pt-BR jargon quoted in the English AI prompt (lib/ai/prompt.ts)", () => {
    const src = 'export const s = "what the cava (armhole), copa (sleeve cap) means";\n';
    expect(gatedFindings("lib/ai/prompt.ts", src)).toHaveLength(0);
  });

  it("still flags a hex color in an unrelated lib/ helper (the exemption is narrow)", () => {
    const src = 'export const brand = "#4a5a3a";\n';
    expect(gatedFindings("lib/theme.ts", src)).toHaveLength(1);
  });

  it("still flags pt-BR text in lib/mail/templates.ts — its copy is supposed to route through Translate", () => {
    const src = 'export const oops = "Texto direto sem tradução";\n';
    expect(gatedFindings("lib/mail/templates.ts", src)).toHaveLength(1);
  });
});

describe("resolveKey", () => {
  it("walks a dotted path", () => {
    const messages = { NS: { a: { b: "value" } } };
    expect(resolveKey(messages, "NS", "a.b")).toBe("value");
  });

  it("returns undefined for a missing path", () => {
    const messages = { NS: { a: {} } };
    expect(resolveKey(messages, "NS", "a.b")).toBeUndefined();
  });
});
