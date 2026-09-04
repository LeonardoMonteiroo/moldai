#!/usr/bin/env node
// Drivers for the design-review session -- not a test suite.
//
// Each scenario knows how to put a screen into one real state (a genuine failed
// login, a genuinely pending request, a genuinely rate-limited account) so it
// can be looked at next to its reference capture. The point is to remove the
// fiddly part of getting there, not to hand down a pass/fail verdict.
//
// The values each scenario prints are what the review agreed on for that state.
// They are reported, never enforced: a difference is something to look at and
// decide about, which is exactly the conversation the review is.
//
//   node scripts/design-review/run.mjs login.invalid   # abre e MANTEM aberto
//   node scripts/design-review/run.mjs login           # todos de login
//   node scripts/design-review/run.mjs                 # todos
//
// REVIEW_URL         alvo (padrao http://localhost:3000)
// REVIEW_OUT         onde salvar as capturas
// REVIEW_HEADLESS=1  sem janela (util para so gerar capturas)
// REVIEW_HOLD=0      nao segurar a janela mesmo com um unico cenario
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BASE_URL,
  OUT_DIR,
  collector,
  withPage,
  capturePath,
  referencePath,
} from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(HERE, "scenarios");

const SCENARIOS = (
  await Promise.all(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".mjs"))
      .map((f) => import(pathToFileURL(path.join(dir, f)).href)),
  )
).flatMap((m) => m.default);

const filter = process.argv[2];
const selected = filter
  ? SCENARIOS.filter((s) => s.id === filter || s.id.startsWith(filter + "."))
  : SCENARIOS;

if (!selected.length) {
  console.error(`Nenhum cenario casa com "${filter}".`);
  console.error("Disponiveis:\n  " + SCENARIOS.map((s) => s.id).join("\n  "));
  process.exit(1);
}

// One scenario in a visible browser is the review workflow itself: reach the
// state, then leave it on screen to be judged. Holding the window open is the
// default there, and off for a batch, which is just generating captures.
const headless = process.env.REVIEW_HEADLESS === "1";
const hold =
  selected.length === 1 && !headless && process.env.REVIEW_HOLD !== "0";

console.log(`alvo   ${BASE_URL}`);
console.log(`saida  ${OUT_DIR}\n`);

for (const sc of selected) {
  const t = collector();
  const ctx = { base: BASE_URL };
  let error = null;
  let shot = null;

  try {
    await withPage(async (page, context) => {
      ctx.request = context.request;
      if (sc.setup) await sc.setup(ctx);
      await sc.drive(page, ctx);
      // Let fonts and any transition settle before measuring or capturing, so
      // a number never comes from a box that is still moving.
      await page.waitForTimeout(400);
      if (sc.check) await sc.check(page, t);
      shot = capturePath(sc.id);
      await page.screenshot({ path: shot });

      if (hold) {
        console.log("\n  janela aberta para validacao. Ctrl+C encerra.");
        await new Promise(() => {});
      }
    });
  } catch (e) {
    error = e;
  } finally {
    if (sc.teardown) {
      try {
        await sc.teardown(ctx);
      } catch (e) {
        console.error(`  aviso: teardown falhou: ${e.message}`);
      }
    }
  }

  if (error) {
    console.log(`x  ${sc.id}: nao cheguei ao estado`);
    console.log(`   ${error.message.split("\n")[0]}`);
    continue;
  }

  console.log(`.  ${sc.id}  (${t.rows.length} valores conferidos)`);
  for (const r of t.differences) {
    console.log(`   ~ ${r.what}: combinado ${r.expected}, na tela ${r.actual}`);
  }
  if (shot) {
    console.log(`   captura   ${shot}`);
    if (sc.reference)
      console.log(`   refer.    ${referencePath(sc.reference)}`);
  }
}
