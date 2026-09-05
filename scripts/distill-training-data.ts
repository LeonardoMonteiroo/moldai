// #269 Fase 4(b): distills synthetic (pt-BR prompt, GarmentSpec) training
// pairs from docs/reference/pattern-catalog-benchmark/entries/ -- 282
// anonymized numeric-reference entries the repo owner has usage rights to,
// each carrying a `descriptionEn`, `category`, `gender` and a best-guess
// `moldaiArchetype`. Only the 5 archetypes MOLDAI_CAPABILITY actually drafts
// are used; entries with `moldaiArchetype: null` or an unsupported one
// (dress is supported, but e.g. "outerwear"/"swimwear" are not) are skipped.
//
// Two real Anthropic calls per entry, not one:
//   1. A short PLAIN-TEXT completion rewrites descriptionEn/category/gender
//      into a natural, first-person pt-BR customer request -- the catalog's
//      own text is English, and this repo's one supported locale is pt-BR
//      (see docs/architecture/i18n.md). A phrase-substitution dictionary
//      was considered and rejected: the catalog's descriptions are too
//      varied for a small dictionary to cover honestly, and a stilted
//      template would make worse training data than no data at all.
//   2. That pt-BR sentence is fed through proposeGarment exactly like a real
//      chat turn -- the SAME facade the app itself uses, never a shortcut
//      that calls the SDK's tool-use path directly.
//
// The pair is kept ONLY if step 2 decided "apply" AND the resulting spec
// actually drafts (checkEngineSupport clears every blocking gap, drafts at
// least one piece, seamCheck is empty) -- lib/ai/eval/score.ts's own
// draftSucceeds, the exact criterion the eval harness scores against. This
// makes the dataset self-verifying: every kept pair is provably a spec the
// app's own drafter can turn into a real pattern, never a hallucinated one.
//
// Each kept pair also carries the EXACT system prompt (static+dynamic) it
// was generated under, so scripts/lora/prepare_dataset.py -- which runs on
// the GPU training host, where this Node project is not checked out -- has
// everything it needs from the JSONL alone.
//
// NOT a *.test.ts (excluded from vitest's globs the same way scripts/ai-eval.ts
// is) and not run implicitly by anything -- `npm run distill:ai`, optionally
// capped with DISTILL_LIMIT=N (a smoke run before spending tokens on all
// ~185 supported entries). Output is gitignored (/data/training/) -- local
// tooling output, not a repo asset.
import Anthropic from "@anthropic-ai/sdk";
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  appendFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { proposeGarment } from "../lib/ai";
import { staticSectionsFor, buildDynamicSection } from "../lib/ai/prompt";
import { seedPatternState, addMessage } from "../lib/editor/state";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "../lib/measurements";
import { DEFAULT_ENGINE_ID, engineFor } from "../lib/draft/engine/capability";
import { getEngine } from "../lib/draft/engine/registry";
import { draftSucceeds } from "../lib/ai/eval/score";
import { t } from "../lib/i18n/test-translate";
import type { PatternState, GarmentSpec, GarmentType } from "../lib/types";

const ENTRIES_DIR = resolve(
  __dirname,
  "../docs/reference/pattern-catalog-benchmark/entries",
);
const OUTPUT_PATH = resolve(__dirname, "../data/training/distilled.jsonl");

const SUPPORTED_ARCHETYPES: GarmentType[] = [
  "blouse",
  "dress",
  "skirt",
  "tshirt",
  "trousers",
];

interface CatalogEntry {
  sourceId: string;
  category: string;
  moldaiArchetype: string | null;
  descriptionEn: string;
  gender: string | null;
}

function loadEntries(): CatalogEntry[] {
  return readdirSync(ENTRIES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(resolve(ENTRIES_DIR, f), "utf8")))
    .filter(
      (e): e is CatalogEntry =>
        typeof e.moldaiArchetype === "string" &&
        (SUPPORTED_ARCHETYPES as string[]).includes(e.moldaiArchetype),
    );
}

const client = new Anthropic();

// #269: the catalog's own `gender` is sometimes the literal JSON `null`
// (e.g. entry 003) -- interpolating that straight into the prompt produced
// the literal string "Gênero: null", a garbled instruction that measurably
// pushed the translation off a plain garment order (an "explain" decision
// resulted from exactly this entry during the smoke run this comment is
// pinned against).
function genderLine(gender: string | null): string {
  if (!gender || gender === "unisex") return "unissex";
  return gender;
}

async function translateToPtBrPrompt(entry: CatalogEntry): Promise<string> {
  const resp = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Reescreva esta descrição de peça de roupa como um PEDIDO curto, direto e natural de um cliente de ateliê de costura, em português do Brasil, em primeira pessoa (ex: "Quero uma calça..."). Nunca escreva como uma pergunta. Não invente detalhes que não estejam na descrição -- se a descrição não menciona um detalhe (gola, manga, comprimento), não o mencione também. Responda só com a frase do pedido, nada mais.\n\nGênero: ${genderLine(entry.gender)}\nCategoria: ${entry.category}\nDescrição: ${entry.descriptionEn}`,
      },
    ],
  });
  const block = resp.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("translation call returned no text block");
  }
  return block.text.trim();
}

function baseRowFor(gender: string | null | undefined): typeof SIZE_TABLE.M {
  return gender === "male" || gender === "men"
    ? SIZE_TABLE_MALE.M
    : SIZE_TABLE.M;
}

function seedState(gender: string | null): PatternState {
  const table =
    gender === "male" || gender === "men" ? SIZE_TABLE_MALE : SIZE_TABLE;
  const state = seedPatternState(t);
  state.pattern = {
    ...state.pattern,
    sizeTable: table,
    baseSize: "M",
    sizes: Object.keys(table),
  };
  return state;
}

interface DistilledPair {
  sourceId: string;
  promptPt: string;
  spec: GarmentSpec;
  // Kept alongside spec so scripts/lora/prepare_dataset.py can reconstruct a
  // REALISTIC full propose_garment tool call -- the schema requires
  // assistantMessage on every call (lib/ai/schema.ts's `required`), and a
  // fine-tune trained only on {decision,spec} would never see that field
  // populated at all.
  assistantMessage: string;
  // The EXACT system prompt this example was generated under (static +
  // dynamic sections, joined the same way lib/ai/index.ts's own request
  // does) -- captured here so scripts/lora/prepare_dataset.py needs zero
  // dependency on this Node/TypeScript project. A GPU training host will
  // not have this repo checked out; the JSONL this script writes must be
  // fully self-contained.
  system: string;
}

async function main() {
  const limitRaw = process.env.DISTILL_LIMIT;
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const entries = loadEntries();
  const targets = limit ? entries.slice(0, limit) : entries;

  console.log(
    `Distilling from ${targets.length}/${entries.length} supported catalog entries` +
      (limit ? ` (DISTILL_LIMIT=${limit})` : "") +
      ` -- ${targets.length * 2} Anthropic calls.`,
  );

  const capability = getEngine(DEFAULT_ENGINE_ID).capability;
  mkdirSync(resolve(__dirname, "../data/training"), { recursive: true });
  writeFileSync(OUTPUT_PATH, "");

  let kept = 0;
  for (const entry of targets) {
    process.stdout.write(`${entry.sourceId} (${entry.moldaiArchetype})... `);
    try {
      const promptPt = await translateToPtBrPrompt(entry);
      const state = seedState(entry.gender);
      addMessage(state, {
        id: `msg-${entry.sourceId}`,
        author: "user",
        text: promptPt,
        createdAt: Date.now(),
      });
      const decision = await proposeGarment(state, { answering: false });
      if (decision.decision !== "apply") {
        console.log(`skip (${decision.decision})`);
        continue;
      }
      const ok = draftSucceeds(
        DEFAULT_ENGINE_ID,
        capability,
        decision.spec,
        baseRowFor(decision.spec.gender ?? entry.gender),
        t,
      );
      if (!ok) {
        console.log("skip (draft failed)");
        continue;
      }
      const engine = engineFor(state.pattern.engine);
      const system =
        staticSectionsFor(engine) +
        "\n\n" +
        buildDynamicSection(state, { answering: false });
      const pair: DistilledPair = {
        sourceId: entry.sourceId,
        promptPt,
        spec: decision.spec,
        assistantMessage: decision.assistantMessage,
        system,
      };
      appendFileSync(OUTPUT_PATH, JSON.stringify(pair) + "\n");
      kept++;
      console.log("kept");
    } catch (err) {
      console.log("ERROR:", err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n${kept}/${targets.length} pairs kept -> ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
