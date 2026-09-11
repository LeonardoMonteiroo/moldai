import type { GarmentType, Gender } from "@/lib/types";
import type { CapabilityStyleField } from "@/lib/draft/engine/capability";
import type { Combination, CombinationFieldValue } from "./combinations";

// #269 Fase 5 (dataset): the pt-BR phrase corpus, authored in-session
// (Claude Code quota, $0 Anthropic spend -- the planning conversation's own
// decision, reversing an earlier plan to pay for this via a batched
// Anthropic call). Committed, diffable, reviewable by a pt-BR native in a
// PR, and free to re-run -- unlike a runtime LLM call, nothing here costs a
// token or reshuffles between runs.
//
// This is NOT a rigid template grammar (the design's own stated risk for
// that approach: "narrow surface distribution... can never produce an
// indirect request"). Two things make it richer than that:
//   1. Every field/value gets 2-4 ALTERNATIVE fragments, not one -- varying
//      register (formal/coloquial/direct) and, deliberately, at least one
//      INDIRECT phrasing per value that avoids lib/ai/prompt.ts's own
//      "# Vocabulary mapping" synonyms outright (e.g. collar "band" ->
//      "fechada até o pescoço, sem nada dobrado" names no catalog term at
//      all). Rather than a separate hand-written adversarial track, this
//      mechanically rotates an indirect variant into ~1-in-3 to ~1-in-4
//      composed sentences for every combination -- integrated, not bolted on.
//   2. `composePhrasings` combines fragments, sentence templates (six
//      registers), an optional gender adjective, and an optional use-case
//      clause with a per-combination deterministic PRNG, so a combination
//      with a 5+-phrasing budget gets genuinely different sentences, not
//      near-duplicate paraphrases.
//
// `DECLINE_PROMPTS` and `EXPLAIN_PROMPTS` below are NOT derived from this
// mechanism -- they're the genuinely non-combinatorial slice (a fixed,
// small "what MOLDAI_CAPABILITY doesn't draft" list, and modeling-knowledge
// questions), fully hand-written, same footing as lib/ai/eval/fixtures.ts's
// own "explain"/"decline" cases.

// ---------------------------------------------------------------------------
// Enum/boolean field fragments -- one array of self-contained, comma-
// appendable descriptor phrases per (field, value). Each already reads
// naturally directly after "<peça> <feminina/masculina>, " with no shared
// connector word supplied by the template (some entries embed their own
// "com"/"sem"; that's a property of the fragment, not of the template).
// ---------------------------------------------------------------------------

const FIELD_FRAGMENTS: Partial<
  Record<CapabilityStyleField, Record<string, string[]>>
> = {
  neckline: {
    straight: [
      "decote reto",
      "decote quadrado, sem curva",
      "gola retinha, sem curvinha nenhuma",
    ],
    V: ["decote em V", "decote em bico", "um V bem marcado na altura do colo"],
    round: ["decote redondo", "decote careca", "gola arredondada, tipo careca"],
  },
  sleeve: {
    none: [
      "sem manga",
      "tipo regata, sem manga nenhuma",
      "decotada nos ombros, sem manga",
    ],
    short: ["manga curta", "manga até o cotovelo", "uma mangazinha curta"],
    long: [
      "manga longa",
      "manga até o pulso",
      "manga comprida, cobrindo o braço todo",
    ],
  },
  skirt: {
    straight: ["saia reta", "corte reto, sem rodado", "reta, sem godê nenhum"],
    "a-line": [
      "saia evasê",
      "corte em A",
      "abrindo suave do quadril pra baixo, tipo sino leve",
    ],
    gore: [
      "saia godê",
      "com godês",
      "godê, com aquelas peças triangulares que dão rodado",
    ],
    "half-circle": [
      "saia meio-círculo",
      "meio círculo, bem rodada",
      "corte de meia-lua, rodada mas não exagerada",
    ],
    circle: [
      "saia em círculo completo",
      "totalmente rodada, círculo inteiro",
      "bem rodada, tipo roda quando gira",
    ],
  },
  collar: {
    none: [
      "sem gola",
      "decote livre, sem gola nenhuma",
      "sem nenhum acabamento de gola, só o decote",
    ],
    convertible: [
      "gola conversível",
      "gola solta, tipo lapela macia",
      "uma gola que dá pra usar aberta ou fechada",
    ],
    band: [
      "gola chinesa",
      "gola padre",
      "fechada até o pescoço, uma gola alta reta, sem nada dobrado por cima",
    ],
    shirt: [
      "gola camiseira",
      "gola de camisa social, com pé e viradinha",
      "aquela gola dupla de camisa, com o pezinho embaixo e a viradinha por cima",
    ],
  },
  cuff: {
    none: ["sem punho", "bainha simples na manga, sem punho nenhum"],
    straight: [
      "com punho reto",
      "com um punho na manga",
      "acabamento de punho na barra da manga",
    ],
  },
  waistband: {
    none: ["sem cós", "cintura crua, sem cós nenhum"],
    straight: ["com cós reto", "com cós", "cós retinho fechando a cintura"],
  },
  frontClosure: {
    none: [
      "sem abertura na frente",
      "fechada, sem botão nenhum na frente",
      "sem carcela",
    ],
    buttonStand: [
      "com botões na frente",
      "abertura de botão do colo até a barra",
      "com uma carcela de botões descendo pela frente toda",
    ],
  },
  fit: {
    close: [
      "bem justa ao corpo",
      "coladinha",
      "sem folga nenhuma, no corpo mesmo",
    ],
    fitted: [
      "ajustada ao corpo",
      "com caimento ajustado",
      "no corpo, mas sem apertar",
    ],
    semiFitted: [
      "levemente folgada",
      "com uma folguinha",
      "nem justa nem larga, no meio termo",
    ],
    loose: [
      "bem folgada",
      "larga, tipo oversized",
      "soltinha do corpo, bem à vontade",
    ],
  },
  stretch: {
    none: [
      "tecido sem elasticidade nenhuma",
      "malha fria, sem stretch",
      "tecido rígido, não estica",
    ],
    low: [
      "tecido com pouca elasticidade",
      "malha com um pouquinho de elastano",
    ],
    medium: ["tecido com elasticidade média", "malha com elastano moderado"],
    high: [
      "tecido bem elástico",
      "malha bem stretch",
      "tecido que estica bastante, tipo legging",
    ],
  },
  darts: {
    true: [
      "com pences",
      "com pinças na frente",
      "modelada com pences pra marcar o busto",
    ],
    false: [
      "sem pences",
      "sem pinças, corte reto",
      "sem nenhuma pinça, liso na frente",
    ],
  },
  pleats: {
    none: ["sem prega", "sem nenhuma prega, painel liso"],
    box: [
      "com prega tipo caixa",
      "com uma prega caixa na frente",
      "com duas dobras que abrem pros lados, tipo prega de caixa",
    ],
    "inverted-box": [
      "com prega caixa invertida",
      "com uma prega invertida atrás, escondendo a dobra por baixo",
      "com aquela prega que esconde a dobra no meio, tipo caixa ao contrário",
    ],
  },
};

type NumericField =
  | "necklineDepthCm"
  | "skirtLengthCm"
  | "seamAllowanceCm"
  | "armholeDeepenCm"
  | "trouserLengthCm"
  | "riseCm";

// Numeric fields have no fixed value set to bank fragments against -- a
// small function per field instead, indexed by `variant` so the composer
// still rotates through distinct phrasings for the same (field, value).
function numericFragment(
  field: NumericField,
  value: number,
  variant: number,
): string {
  const variants: string[] = (() => {
    switch (field) {
      case "necklineDepthCm":
        return [
          `decote uns ${value}cm mais fundo`,
          `aumenta a profundidade do decote pra ${value}cm`,
          `um decote bem mais fundo, uns ${value}cm a mais`,
        ];
      case "skirtLengthCm":
        return [
          `comprimento de uns ${value}cm`,
          `bem na altura de ${value}cm`,
          `${value}cm de comprimento, mais ou menos`,
        ];
      case "seamAllowanceCm":
        return [
          `margem de costura de ${value}cm`,
          `com ${value}cm de margem pra costurar`,
          `deixa ${value}cm de sobra na costura`,
        ];
      case "armholeDeepenCm":
        return [
          `cava mais funda, uns ${value}cm a mais`,
          `aumenta a cava em ${value}cm`,
          `cava bem mais aberta, tipo ${value}cm além do normal`,
        ];
      case "trouserLengthCm":
        return [
          `comprimento de uns ${value}cm`,
          `bem na altura de ${value}cm de comprimento`,
          `${value}cm do cós até a barra, mais ou menos`,
        ];
      case "riseCm": {
        // #259: signed -- a positive value reads as "cintura alta" (raised
        // waist), a negative one as "gancho baixo"/low-rise. `value` itself
        // may be negative, so the phrase names the MAGNITUDE and picks its
        // own direction word rather than interpolating a raw "-6cm".
        const abs = Math.abs(value);
        return value >= 0
          ? [
              `cintura bem alta, sobe uns ${abs}cm`,
              `cós mais alto, uns ${abs}cm acima do normal`,
              `modelagem cintura alta, ${abs}cm a mais no cós`,
            ]
          : [
              `gancho baixo, desce uns ${abs}cm`,
              `cós mais baixo, uns ${abs}cm abaixo do normal`,
              `cintura baixa, ${abs}cm a menos no cós`,
            ];
      }
    }
  })();
  return variants[variant % variants.length];
}

const NUMERIC_FIELDS = new Set<string>([
  "necklineDepthCm",
  "skirtLengthCm",
  "seamAllowanceCm",
  "armholeDeepenCm",
  "trouserLengthCm",
  "riseCm",
]);

function pickFragment(
  field: CapabilityStyleField,
  value: CombinationFieldValue,
  variant: number,
): string {
  if (NUMERIC_FIELDS.has(field)) {
    return numericFragment(field as NumericField, value as number, variant);
  }
  const bank = FIELD_FRAGMENTS[field]?.[String(value)];
  if (!bank || bank.length === 0) {
    // Should be unreachable for any combination enumerateApplyCombinations
    // produces -- phrasingCoverageGaps below is what actually verifies
    // that, rather than trusting this fallback silently.
    return `${field}: ${value}`;
  }
  return bank[variant % bank.length];
}

// ---------------------------------------------------------------------------
// Sentence assembly
// ---------------------------------------------------------------------------

const TYPE_NOUN: Record<GarmentType, string> = {
  blouse: "blusa",
  dress: "vestido",
  tshirt: "camiseta",
  skirt: "saia",
  trousers: "calça",
  hoodie: "moletom com capuz",
  coat: "casaco",
  shirt: "camisa social",
};

const ARTICLE: Record<GarmentType, string> = {
  blouse: "uma",
  dress: "um",
  tshirt: "uma",
  skirt: "uma",
  trousers: "uma",
  hoodie: "um",
  coat: "um",
  shirt: "uma",
};

// Portuguese adjective agreement is with the NOUN's own grammatical gender,
// not the wearer's -- "camiseta masculina" ("men's t-shirt") correctly uses
// the FEMININE adjective form because "camiseta" is a feminine noun.
// "vestido"/"casaco"/"moletom" are the grammatically masculine nouns here.
const GRAMMATICALLY_MASCULINE_NOUN = new Set<GarmentType>([
  "dress",
  "coat",
  "hoodie",
]);

function genderAdjective(type: GarmentType, gender: Gender): string {
  const isMasc = GRAMMATICALLY_MASCULINE_NOUN.has(type);
  if (gender === "male") return isMasc ? "masculino" : "masculina";
  return isMasc ? "feminino" : "feminina";
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function joinFragments(fragments: string[]): string {
  if (fragments.length === 0) return "";
  if (fragments.length === 1) return fragments[0];
  return `${fragments.slice(0, -1).join(", ")} e ${fragments[fragments.length - 1]}`;
}

// Six registers -- formal, coloquial, imperativo, telegráfico, uma pergunta
// direta -- so the composer never repeats one shape across a combination's
// whole phrasing budget.
type TemplateFn = (
  article: string,
  noun: string,
  genderClause: string,
  fragments: string,
  useCase: string,
) => string;

const TEMPLATES: TemplateFn[] = [
  (art, noun, gender, frags, use) =>
    `Quero ${art} ${noun}${gender}, ${frags}${use}.`,
  (art, noun, gender, frags, use) =>
    `Gostaria de ${art} ${noun}${gender}, ${frags}${use}.`,
  (art, noun, gender, frags, use) =>
    `Faz ${art} ${noun}${gender}, ${frags}${use}.`,
  (_art, noun, gender, frags, use) =>
    `${capitalize(noun)}${gender}, ${frags}${use}.`,
  (art, noun, gender, frags, use) =>
    `Preciso de ${art} ${noun}${gender}, ${frags}${use}.`,
  (art, noun, gender, frags, use) =>
    `Dá pra fazer ${art} ${noun}${gender}, ${frags}${use}?`,
];

// Optional "so where would you wear this" clause -- present in some
// composed sentences, absent in others (real requests vary), never
// invented as a field value (it names no style field, so it can never
// affect the agreement gate).
const USE_CASES = [
  "",
  " pra usar no trabalho",
  " pra um casamento",
  " pro dia a dia",
  " pra sair à noite",
  " pra uma festa",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Composes up to `count` distinct pt-BR phrasings for one combination.
 * Deterministic per combination key -- a re-run (or `--fill-gaps`) never
 * reshuffles what a prior run already wrote for the same combination.
 */
export function composePhrasings(combo: Combination, count: number): string[] {
  const rng = mulberry32(hashString(combo.key));
  const out: string[] = [];
  const seen = new Set<string>();
  const fieldEntries = Object.entries(combo.fields) as [
    CapabilityStyleField,
    CombinationFieldValue,
  ][];
  let guard = 0;
  const maxAttempts = count * 20;
  while (out.length < count && guard < maxAttempts) {
    const attempt = guard++;
    const template = TEMPLATES[attempt % TEMPLATES.length];
    const fragParts = fieldEntries.map(([field, value]) =>
      pickFragment(field, value, attempt + hashString(field) + guard),
    );
    const frags = joinFragments(shuffle(fragParts, rng));
    const wantsGender = combo.gender === "male" ? rng() < 0.85 : rng() < 0.4;
    const genderClause = wantsGender
      ? ` ${genderAdjective(combo.type, combo.gender)}`
      : "";
    const useCase = USE_CASES[Math.floor(rng() * USE_CASES.length)];
    const sentence = capitalize(
      template(
        ARTICLE[combo.type],
        TYPE_NOUN[combo.type],
        genderClause,
        frags,
        useCase,
      ),
    );
    if (!seen.has(sentence)) {
      seen.add(sentence);
      out.push(sentence);
    }
  }
  return out;
}

/**
 * Every combination `enumerateApplyCombinations` can produce must have a
 * real fragment (or numeric generator) for every field it names -- this is
 * the "coverage gap, never silently skipped" check the design calls for.
 * Returns the combination keys with a gap; empty is the healthy case
 * (asserted by combinations.test.ts... no -- by
 * scripts/generate-training-data.ts's own --dry-run report, since this
 * needs the actual enumerated combinations, which combinations.ts itself
 * does not import phrasings.ts to avoid, on principle: data flows
 * combinations -> phrasings -> generator, never the reverse).
 */
export function phrasingCoverageGaps(combos: Combination[]): string[] {
  const gaps: string[] = [];
  for (const combo of combos) {
    for (const [field, value] of Object.entries(combo.fields)) {
      const f = field as CapabilityStyleField;
      if (NUMERIC_FIELDS.has(f)) continue; // numericFragment covers every field/value by construction
      const bank = FIELD_FRAGMENTS[f]?.[String(value)];
      if (!bank || bank.length === 0) {
        gaps.push(combo.key);
        break;
      }
    }
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// The genuinely non-combinatorial slice: hand-written, same footing as
// lib/ai/eval/fixtures.ts's own decline/explain cases.
// ---------------------------------------------------------------------------

/**
 * Keyed by `DeclineCase.key` (combinations.ts's `DECLINE_CASES`) -- every
 * key there must have an entry here (asserted in
 * scripts/generate-training-data.ts's --dry-run, the same coverage-gap
 * posture as phrasingCoverageGaps above).
 */
export const DECLINE_PROMPTS: Record<string, string[]> = {
  "type-hoodie": [
    "Quero um moletom com capuz, cara de hoodie mesmo.",
    "Faz um casaco de moletom com capuz e bolso canguru.",
  ],
  "type-coat": [
    "Preciso de um casaco de frio, forrado, pra usar por cima da roupa.",
    "Quero um sobretudo comprido, tipo casaco de inverno.",
  ],
  "type-shirt-freesewing-only": [
    "Quero uma camisa social masculina, com gola e botões, tipo camisa de trabalho.",
    "Faz uma camisa de manga longa com bolso no peito.",
  ],
  "collar-peterpan": [
    "Quero uma blusa com gola Peter Pan, bem arredondadinha.",
    "Faz uma blusa com aquela gola redondinha de boneca, tipo Peter Pan.",
  ],
  "collar-peterpan-dress": [
    "Vestido infantil com gola Peter Pan.",
    "Quero um vestido com gola arredondada estilo Peter Pan.",
  ],
  "trousers-cargo": [
    "Quero uma calça cargo, com bolsos laterais nas pernas.",
    "Faz uma calça estilo cargo, bem utilitária, com vários bolsos.",
  ],
  "trousers-flare": [
    "Quero uma calça flare, bem larga na barra.",
    "Faz uma calça boca de sino, apertada em cima e larga embaixo.",
  ],
  "trousers-skinny": [
    "Quero uma calça skinny, bem justinha na perna inteira.",
    "Faz uma calça super justa, tipo segunda pele.",
  ],
  "trousers-wide": [
    "Quero uma calça pantalona, bem larga.",
    "Faz uma calça wide-leg, solta do quadril até o pé.",
  ],
  "waistband-elastic-skirt": [
    "Quero uma saia com cós de elástico, bem confortável.",
    "Faz uma saia com cintura elástica, sem zíper.",
  ],
  "waistband-elastic-trousers": [
    "Quero uma calça com cós elástico o tempo todo.",
    "Faz uma calça de moletom com cintura de elástico e cordão.",
  ],
  "jacket-blazer": [
    "Faz um blazer estruturado, com forro e lapela.",
    "Quero um paletó de alfaiataria, forrado, pra usar no trabalho.",
  ],
};

/** Hand-written pattern-making / product-facts questions -- decision=explain. */
export const EXPLAIN_PROMPTS: string[] = [
  "O que é uma pence?",
  "O que é a cava de uma peça?",
  "O que é a copa da manga?",
  "O que significa fio na costura?",
  "Por que a manga não fecha direito na cava?",
  "Como funciona a graduação de tamanhos?",
  "Qual a diferença entre tecido plano e malha?",
  "O que é margem de costura?",
  "Pra que serve o cós de uma saia?",
  "O que é uma gola conversível?",
  "Quanto custa gerar um rascunho de molde?",
  "Quais formatos dá pra exportar o molde?",
  "O que acontece se eu editar a tabela de medidas depois que o molde já foi gerado?",
  "Como faço pra corrigir a manga quando dá conflito na cava?",
  "Qual é a ordem de costura dessa peça?",
];
