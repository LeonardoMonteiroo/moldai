import type { GenerationCase, EditingCase } from "./types";

// #252: the eval harness's fixture set. Every prompt/instruction is pt-BR --
// the app's one supported locale (see lib/i18n's single-locale rule) -- and
// every expected field is drawn from lib/draft/vocabulary.ts's own closed
// catalogs, never invented. `expectedStyle`/`expectedChanged` name only the
// fields the prompt actually determines; an unlisted field is not asserted,
// so a real model's legitimate extra inference (e.g. picking a waistband)
// never fails a case that didn't ask about it.

// 30 apply cases, 6 per MOLDAI_CAPABILITY type, plus one case per
// non-apply decision (#252's own AC: "at least one case per non-apply
// decision").
export const GENERATION_CASES: GenerationCase[] = [
  // --- blouse ---
  {
    id: "blouse-v-long",
    prompt: "Quero uma blusa feminina com decote em V e manga longa.",
    expectedDecision: "apply",
    expectedType: "blouse",
    expectedStyle: { neckline: "V", sleeve: "long" },
  },
  {
    id: "blouse-band-collar",
    prompt: "Faz uma blusa com gola chinesa e manga curta.",
    expectedDecision: "apply",
    expectedType: "blouse",
    expectedStyle: { collar: "band", sleeve: "short" },
  },
  {
    id: "blouse-shirt-collar-buttons",
    prompt:
      "Blusa masculina, gola camiseira, manga longa, com botão na frente.",
    expectedDecision: "apply",
    expectedType: "blouse",
    expectedStyle: {
      collar: "shirt",
      sleeve: "long",
      frontClosure: "buttonStand",
    },
  },
  {
    id: "blouse-round-sleeveless-loose",
    prompt: "Blusa decote redondo, sem manga, bem folgada.",
    expectedDecision: "apply",
    expectedType: "blouse",
    expectedStyle: { neckline: "round", sleeve: "none", fit: "loose" },
  },
  {
    id: "blouse-darts-convertible",
    prompt: "Uma blusa com pences na frente e gola conversível.",
    expectedDecision: "apply",
    expectedType: "blouse",
    expectedStyle: { darts: true, collar: "convertible" },
  },
  {
    id: "blouse-close-fit",
    prompt: "Blusa bem justa, colada ao corpo, decote reto, manga curta.",
    expectedDecision: "apply",
    expectedType: "blouse",
    expectedStyle: { fit: "close", neckline: "straight", sleeve: "short" },
  },

  // --- dress ---
  {
    id: "dress-aline-v",
    prompt: "Vestido evasê, decote em V.",
    expectedDecision: "apply",
    expectedType: "dress",
    expectedStyle: { skirt: "a-line", neckline: "V" },
  },
  {
    id: "dress-gore",
    prompt: "Vestido com saia godê.",
    expectedDecision: "apply",
    expectedType: "dress",
    expectedStyle: { skirt: "gore" },
  },
  {
    id: "dress-circle",
    prompt: "Vestido rodado, com saia em círculo completo.",
    expectedDecision: "apply",
    expectedType: "dress",
    expectedStyle: { skirt: "circle" },
  },
  {
    id: "dress-half-circle-length",
    prompt:
      "Vestido com saia meio-círculo, comprimento na altura do joelho, uns 55cm.",
    expectedDecision: "apply",
    expectedType: "dress",
    expectedStyle: { skirt: "half-circle", skirtLengthCm: 55 },
  },
  {
    id: "dress-close-sleeveless",
    prompt: "Vestido justo ao corpo, sem manga.",
    expectedDecision: "apply",
    expectedType: "dress",
    expectedStyle: { fit: "close", sleeve: "none" },
  },
  {
    id: "dress-darts-short-sleeve",
    prompt: "Vestido com pences e manga curta.",
    expectedDecision: "apply",
    expectedType: "dress",
    expectedStyle: { darts: true, sleeve: "short" },
  },

  // --- skirt ---
  {
    id: "skirt-straight",
    prompt: "Saia reta na altura do joelho.",
    expectedDecision: "apply",
    expectedType: "skirt",
    expectedStyle: { skirt: "straight" },
  },
  {
    id: "skirt-aline",
    prompt: "Saia evasê.",
    expectedDecision: "apply",
    expectedType: "skirt",
    expectedStyle: { skirt: "a-line" },
  },
  {
    id: "skirt-gore",
    prompt: "Saia godê.",
    expectedDecision: "apply",
    expectedType: "skirt",
    expectedStyle: { skirt: "gore" },
  },
  {
    id: "skirt-circle",
    prompt: "Saia em círculo completo, bem rodada.",
    expectedDecision: "apply",
    expectedType: "skirt",
    expectedStyle: { skirt: "circle" },
  },
  {
    id: "skirt-half-circle-short",
    prompt: "Saia meio-círculo, curta, uns 40cm.",
    expectedDecision: "apply",
    expectedType: "skirt",
    expectedStyle: { skirt: "half-circle", skirtLengthCm: 40 },
  },
  {
    id: "skirt-seam-allowance",
    prompt: "Saia reta com margem de costura de 2cm.",
    expectedDecision: "apply",
    expectedType: "skirt",
    expectedStyle: { skirt: "straight", seamAllowanceCm: 2 },
  },

  // --- tshirt ---
  {
    id: "tshirt-male-basic",
    prompt: "Camiseta masculina básica.",
    expectedDecision: "apply",
    expectedType: "tshirt",
  },
  {
    id: "tshirt-long-sleeve",
    prompt: "Camiseta feminina, manga longa.",
    expectedDecision: "apply",
    expectedType: "tshirt",
    expectedStyle: { sleeve: "long" },
  },
  {
    id: "tshirt-high-stretch",
    prompt: "Camiseta com tecido bem elástico, bem justa ao corpo.",
    expectedDecision: "apply",
    expectedType: "tshirt",
    expectedStyle: { stretch: "high" },
  },
  {
    id: "tshirt-sleeveless",
    prompt: "Camiseta sem manga, tipo regata.",
    expectedDecision: "apply",
    expectedType: "tshirt",
    expectedStyle: { sleeve: "none" },
  },
  {
    id: "tshirt-low-stretch",
    prompt: "Camiseta de tecido pouco elástico, sem elasticidade.",
    expectedDecision: "apply",
    expectedType: "tshirt",
    expectedStyle: { stretch: "none" },
  },
  {
    id: "tshirt-medium-stretch-short-sleeve",
    prompt: "Camiseta manga curta, tecido com elasticidade média.",
    expectedDecision: "apply",
    expectedType: "tshirt",
    expectedStyle: { sleeve: "short", stretch: "medium" },
  },

  // --- trousers ---
  {
    id: "trousers-female-straight",
    prompt: "Calça reta feminina.",
    expectedDecision: "apply",
    expectedType: "trousers",
  },
  {
    id: "trousers-male-cropped",
    prompt: "Calça reta masculina, comprimento capri, uns 90cm.",
    expectedDecision: "apply",
    expectedType: "trousers",
    expectedStyle: { trouserLengthCm: 90 },
  },
  {
    id: "trousers-social",
    prompt: "Calça social reta.",
    expectedDecision: "apply",
    expectedType: "trousers",
  },
  {
    id: "trousers-seam-allowance",
    prompt: "Calça reta com margem de costura maior, uns 2.5cm.",
    expectedDecision: "apply",
    expectedType: "trousers",
    expectedStyle: { seamAllowanceCm: 2.5 },
  },
  {
    id: "trousers-full-length",
    prompt: "Calça reta comprida, na altura do tornozelo, uns 100cm.",
    expectedDecision: "apply",
    expectedType: "trousers",
    expectedStyle: { trouserLengthCm: 100 },
  },
  {
    id: "trousers-cropped-short",
    prompt: "Calça reta cropped, 70cm de comprimento.",
    expectedDecision: "apply",
    expectedType: "trousers",
    expectedStyle: { trouserLengthCm: 70 },
  },

  // --- non-apply decisions ---
  {
    id: "ask-underspecified",
    prompt: "Quero um vestido.",
    expectedDecision: "ask",
  },
  {
    id: "decline-jacket",
    prompt:
      "Faz um paletó estruturado com forro e lapela, tipo blazer de alfaiataria.",
    expectedDecision: "decline",
  },
  {
    id: "explain-dart",
    prompt: "O que é uma pence?",
    expectedDecision: "explain",
  },
];

// 8 editing cases -- at least one per GarmentType and one per numeric
// STYLE_LIMITS field (necklineDepthCm, skirtLengthCm, seamAllowanceCm,
// armholeDeepenCm, trouserLengthCm all appear below).
export const EDITING_CASES: EditingCase[] = [
  {
    id: "edit-blouse-neckline-depth",
    baseSpec: {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { neckline: "straight", sleeve: "short", darts: false },
    },
    instruction: "Aumenta a profundidade do decote para 8cm.",
    expectedChanged: ["necklineDepthCm"],
    expectedUnchanged: ["type", "gender", "neckline", "sleeve", "collar"],
    scopedPieceKey: "front",
  },
  {
    id: "edit-dress-skirt-length",
    baseSpec: {
      type: "dress",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "a-line", skirtLengthCm: 90, neckline: "round" },
    },
    instruction: "Diminui o comprimento da saia para 70cm.",
    expectedChanged: ["skirtLengthCm"],
    expectedUnchanged: ["type", "gender", "skirt", "neckline"],
    scopedPieceKey: "skirt",
  },
  {
    id: "edit-skirt-seam-allowance",
    baseSpec: {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "straight", seamAllowanceCm: 1 },
    },
    instruction: "Aumenta a margem de costura para 2cm.",
    expectedChanged: ["seamAllowanceCm"],
    expectedUnchanged: ["type", "gender", "skirt", "waistband"],
    scopedPieceKey: "skirt",
  },
  {
    id: "edit-tshirt-sleeve",
    baseSpec: {
      type: "tshirt",
      gender: "female",
      measurementOverrides: {},
      style: { sleeve: "short", stretch: "none" },
    },
    instruction: "Deixa a manga comprida.",
    expectedChanged: ["sleeve"],
    expectedUnchanged: ["type", "gender", "stretch"],
    scopedPieceKey: "sleeve",
  },
  {
    id: "edit-trousers-length",
    baseSpec: {
      type: "trousers",
      gender: "female",
      measurementOverrides: {},
      style: { trouserLengthCm: 100 },
    },
    instruction: "Deixa a calça mais curta, tipo cropped, uns 75cm.",
    expectedChanged: ["trouserLengthCm"],
    expectedUnchanged: ["type", "gender", "waistband"],
    scopedPieceKey: "front",
  },
  {
    id: "edit-blouse-armhole",
    baseSpec: {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { sleeve: "long", neckline: "straight", armholeDeepenCm: 0 },
    },
    instruction:
      "Aumenta a cava em 3cm, deixa mais folgada na altura do braço.",
    expectedChanged: ["armholeDeepenCm"],
    expectedUnchanged: ["type", "gender", "sleeve", "neckline"],
    scopedPieceKey: "front",
  },
  {
    id: "edit-dress-fit-loose",
    baseSpec: {
      type: "dress",
      gender: "female",
      measurementOverrides: {},
      style: { fit: "fitted", skirt: "gore" },
    },
    instruction: "Deixa o vestido bem folgado, largo.",
    expectedChanged: ["fit"],
    expectedUnchanged: ["type", "gender", "skirt"],
    scopedPieceKey: "front",
  },
  {
    id: "edit-blouse-collar",
    baseSpec: {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { collar: "none", sleeve: "long" },
    },
    instruction: "Adiciona uma gola chinesa.",
    expectedChanged: ["collar"],
    expectedUnchanged: ["type", "gender", "sleeve"],
    // #265: baseSpec has collar:"none", so no collar piece exists yet to
    // select -- "front" here deliberately tests the risky case: a user
    // adding a NEW feature while a plausible-but-unrelated piece is selected.
    // If the scoped section ever makes the model over-restrict (refuse to
    // add the collar because "front" was scoped), this case is what would
    // show it as a missed expected change, not a silent regression.
    scopedPieceKey: "front",
  },
];
