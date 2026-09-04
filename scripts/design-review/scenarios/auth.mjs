// Autenticação -- /login and /signup.
//
// Reference: docs/design/screenshots/states/autenticacao/*.png, all 1280x900.
// Every expected value below was measured against the running app during the
// design-review session that produced it, then agreed on -- a number here is a
// decision, not a transcription of whatever the code happened to render.
//
// `page.$eval` / `page.$$eval` below are Playwright's DOM query helpers -- they
// serialise the given function and run it against a matched element in the page
// context. They are not JavaScript's `eval()`, and no string here is executed as
// code: every argument is a literal function defined in this file.
import {
  fill,
  seedRateLimit,
  clearRateLimit,
  clearLoginThrottles,
  clearResendThrottles,
  clearSignupThrottles,
  waitForEither,
  latestMailLink,
} from "../lib.mjs";

// Mirrors RESEND_COOLDOWN_MS in lib/auth/verification.ts.
const RESEND_COOLDOWN_MS = 60 * 1000;

const ALERT = "rgb(181, 80, 47)"; // --color-alert
const BORDER = "rgb(222, 217, 204)"; // --color-border
const INK = "rgb(28, 28, 25)";
const OLIVE_DARK = "rgb(56, 69, 44)"; // --color-olive-dark
const PASSWORD = "RevisaoDesign2026";

// The vertical rhythm the .dc.html specifies: 6px inside a Field
// (label->input, input->message), 12px between form children, and 16px above
// the submit (the same 12px plus its mt-1).
const GAP_FIELD = 6;
const GAP_FORM = 12;
const GAP_SUBMIT = 16;

const box = (page, sel) =>
  page.$eval(sel, (el) => {
    const b = el.getBoundingClientRect();
    return {
      top: Math.round(b.top),
      bottom: Math.round(b.bottom),
      height: Math.round(b.height),
      width: Math.round(b.width),
    };
  });

const style = (page, sel, prop) =>
  page.$eval(sel, (el, p) => getComputedStyle(el)[p], prop);

const text = (page, sel) => page.$eval(sel, (el) => el.textContent.trim());

const cardHeight = (page) =>
  page.$eval("form", (f) =>
    Math.round(f.closest("div").getBoundingClientRect().height),
  );

const count = (page, sel) => page.$$eval(sel, (n) => n.length);

// One shared unverified account for both states that need one.
//
// Signing up on every run is not an option: `signup` is capped at 5/h per IP
// and the bucket is consumed before the duplicate check, so even a call that
// answers `email_taken` spends a slot -- two scenarios signing up per run made
// the suite lock itself out after two runs. So: try to log in first, and only
// sign up when the account genuinely is not there yet. After the first ever
// run this costs nothing.
const FIXTURE_EMAIL = "review-unverified-fixture@moldai.test";
const INVALID_EMAIL = "revisao.invalido@moldai.test";
const UNVERIFIED_MSG =
  "Confirme seu email antes de entrar. Enviamos um link quando você criou a conta.";

async function reachUnverifiedLogin(page, ctx) {
  // Every attempt with this account spends a login_email slot and never
  // clears it: the bucket is consumed before the password check, and only a
  // *successful* login resets it -- which an unverified account can never do.
  // Ten attempts (five runs) would soft-lock the fixture for 15 minutes, so the
  // counter is cleared up front. These are review helpers driving a chosen
  // state, not a test of the limiter; login.rateLimited is where that lives.
  clearLoginThrottles([FIXTURE_EMAIL, INVALID_EMAIL]);

  const attempt = async () => {
    await page.goto(ctx.base + "/login");
    await fill(page, "#login-email", FIXTURE_EMAIL);
    await fill(page, "#login-password", PASSWORD);
    await page.click("form button[type=submit]");
    await page.waitForSelector("[data-slot=field-error]");
    return text(page, "[data-slot=field-error]");
  };

  if ((await attempt()) === UNVERIFIED_MSG) return;

  // Not there (or not unverified) -- create it, once, then try again.
  const res = await ctx.request.post(ctx.base + "/api/signup", {
    data: { name: "Revisao Design", email: FIXTURE_EMAIL, password: PASSWORD },
  });
  const body = await res.json().catch(() => ({}));
  if (body.status !== "ok" && body.error !== "email_taken") {
    throw new Error(
      `nao consegui criar a conta-fixture (${res.status()}): ${body.error}`,
    );
  }
  const msg = await attempt();
  if (msg !== UNVERIFIED_MSG) {
    throw new Error(
      `conta-fixture nao esta no estado nao-verificado; tela diz: "${msg}"`,
    );
  }
}

const scenarios = [
  {
    id: "login.default",
    reference: "states/autenticacao/01-login.png",
    async drive(page, ctx) {
      await page.goto(ctx.base + "/login");
      await page.waitForSelector("#login-email");
    },
    async check(page, t) {
      t.eq(
        "label font-size",
        await style(page, "label[for=login-email]", "fontSize"),
        "12.5px",
      );
      t.eq(
        "label cor (sem erro)",
        await style(page, "label[for=login-email]", "color"),
        INK,
      );
      t.eq(
        "borda do input",
        await style(page, "#login-email", "borderColor"),
        BORDER,
      );
      t.eq("altura do input", (await box(page, "#login-email")).height, 36);
      t.eq(
        "sem mensagem de erro",
        await count(page, "[data-slot=field-error]"),
        0,
      );
      // The card height is the design's most sensitive single number: it is the
      // sum of every gap above it, so drift anywhere inside surfaces here.
      t.eq("altura do card", await cardHeight(page), 472);
      const senha = await box(page, "#login-password");
      const esqueci = await box(page, 'a[href="/password-reset"]');
      t.eq("input->Esqueci", esqueci.top - senha.bottom, GAP_FORM);
    },
  },

  {
    id: "login.invalid",
    reference: "states/autenticacao/02-login-erro-credenciais.png",
    // A wrong password never resets login_email, so this address throttles
    // itself after ten runs and the screen would show the rate-limited message
    // instead of the one this scenario is for.
    async setup() {
      clearLoginThrottles([INVALID_EMAIL]);
    },
    async drive(page, ctx) {
      await page.goto(ctx.base + "/login");
      await fill(page, "#login-email", INVALID_EMAIL);
      await fill(page, "#login-password", "senha-propositalmente-errada");
      await page.click("form button[type=submit]");
      await page.waitForSelector("[data-slot=field-error]");
    },
    async check(page, t) {
      t.eq(
        "mensagem",
        await text(page, "[data-slot=field-error]"),
        "Email ou senha inválidos.",
      );
      t.eq(
        "mensagem font-size",
        await style(page, "[data-slot=field-error]", "fontSize"),
        "11.5px",
      );
      t.eq(
        "mensagem cor",
        await style(page, "[data-slot=field-error]", "color"),
        ALERT,
      );
      // Both inputs redden. The email one carried no aria-invalid until this
      // review, so only the password field was marked -- visually and to a
      // screen reader.
      t.eq(
        "borda email",
        await style(page, "#login-email", "borderColor"),
        ALERT,
      );
      t.eq(
        "borda senha",
        await style(page, "#login-password", "borderColor"),
        ALERT,
      );
      t.eq(
        "aria-invalid email",
        await page.getAttribute("#login-email", "aria-invalid"),
        "true",
      );
      t.eq(
        "aria-invalid senha",
        await page.getAttribute("#login-password", "aria-invalid"),
        "true",
      );
      // Deliberate divergence from the .dc.html, recorded in docs/decisions/design-handoff.md:
      // the design leaves labels at default ink, this app reddens them.
      t.eq(
        "label vermelho (divergencia deliberada)",
        await style(page, "label[for=login-email]", "color"),
        ALERT,
      );
      const senha = await box(page, "#login-password");
      const msg = await box(page, "[data-slot=field-error]");
      t.eq("input->mensagem", msg.top - senha.bottom, GAP_FIELD);
    },
  },

  {
    id: "login.unverified",
    reference: "states/autenticacao/03-login-nao-verificado.png",
    async drive(page, ctx) {
      await reachUnverifiedLogin(page, ctx);
    },
    async check(page, t) {
      t.eq(
        "mensagem",
        await text(page, "[data-slot=field-error]"),
        "Confirme seu email antes de entrar. Enviamos um link quando você criou a conta.",
      );
      t.eq(
        "mensagem e anunciada",
        await page.getAttribute("[data-slot=field-error]", "role"),
        "alert",
      );
      const reenviar = "form button[type=button]";
      t.eq("botao reenviar existe", await count(page, reenviar), 1);
      t.eq(
        "rotulo do reenviar",
        await text(page, reenviar),
        "Reenviar link de confirmação",
      );
      t.eq("altura do reenviar", (await box(page, reenviar)).height, 36);
      // Order matters: the design puts the resend between "Esqueci" and "Entrar".
      const esqueci = await box(page, 'a[href="/password-reset"]');
      const rb = await box(page, reenviar);
      const entrar = await box(page, "form button[type=submit]");
      t.eq("Esqueci->Reenviar", rb.top - esqueci.bottom, GAP_FORM);
      t.eq("Reenviar->Entrar", entrar.top - rb.bottom, GAP_SUBMIT);
    },
  },

  {
    id: "login.rateLimited",
    reference: "states/autenticacao/04-login-rate-limited.png",
    // Seeded rather than driven: ten real attempts would also drain the
    // IP-keyed `login` bucket, which every other scenario in this run shares.
    async setup(ctx) {
      ctx.email = "revisao.ratelimit@moldai.test";
      seedRateLimit("login_email", ctx.email, 10);
    },
    async teardown(ctx) {
      clearRateLimit("login_email", ctx.email);
    },
    async drive(page, ctx) {
      await page.goto(ctx.base + "/login");
      await fill(page, "#login-email", ctx.email);
      await fill(page, "#login-password", "QualquerSenha123");
      await page.click("form button[type=submit]");
      await page.waitForSelector("[data-slot=field-error]");
    },
    async check(page, t) {
      t.eq(
        "mensagem",
        await text(page, "[data-slot=field-error]"),
        "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
      );
      // The resend button belongs to the unverified state alone.
      t.eq(
        "sem botao reenviar",
        await count(page, "form button[type=button]"),
        0,
      );
      t.eq(
        "borda email",
        await style(page, "#login-email", "borderColor"),
        ALERT,
      );
      t.eq(
        "borda senha",
        await style(page, "#login-password", "borderColor"),
        ALERT,
      );
    },
  },

  {
    id: "login.resent",
    reference: "states/autenticacao/05-login-email-reenviado.png",
    // Uses the persistent fixture account, not a fresh one: signing up mints a
    // verification token, and the resend refuses a reissue for 60s after it.
    // A brand-new account would therefore answer `cooldown` instead of success.
    async setup() {
      clearResendThrottles([FIXTURE_EMAIL]);
    },
    async drive(page, ctx) {
      await reachUnverifiedLogin(page, ctx);
      await page.click("form button[type=button]");
      try {
        await waitForEither(page, "form p", "[data-slot=field-error]");
      } catch (e) {
        // A resend from a previous run within the last minute leaves the
        // account inside RESEND_COOLDOWN_MS. That is the route behaving
        // correctly, not a regression -- wait it out and try once more.
        // Only the 60s cooldown is worth waiting out. Any other message
        // (an exhausted resend_email bucket, say) would still be there after
        // a minute, so re-raise instead of hiding it behind a wait.
        if (!/Aguarde um minuto/i.test(e.message)) throw e;
        console.log(
          "        dentro do cooldown de reenvio; aguardando 60s e repetindo",
        );
        await new Promise((r) => setTimeout(r, RESEND_COOLDOWN_MS + 1000));
        await reachUnverifiedLogin(page, ctx);
        await page.click("form button[type=button]");
        await waitForEither(page, "form p", "[data-slot=field-error]");
      }
    },
    async check(page, t) {
      t.eq(
        "aviso",
        await text(page, "form p"),
        "Link reenviado. Confira seu email.",
      );
      t.eq("aviso cor", await style(page, "form p", "color"), OLIVE_DARK);
      t.eq(
        "aviso font-size",
        await style(page, "form p", "fontSize"),
        "12.5px",
      );
      // Success clears the error outright: borders and labels go back to normal.
      t.eq(
        "borda volta ao normal",
        await style(page, "#login-email", "borderColor"),
        BORDER,
      );
      t.eq(
        "label volta ao normal",
        await style(page, "label[for=login-email]", "color"),
        INK,
      );
      t.eq(
        "reenviar foi substituido",
        await count(page, "form button[type=button]"),
        0,
      );
    },
  },

  {
    id: "login.loading",
    reference: "states/autenticacao/06-login-loading.png",
    // Held by never fulfilling the auth request, so this is the real loading
    // state with a genuinely pending POST behind it, not a prop forced true.
    async drive(page, ctx) {
      await page.goto(ctx.base + "/login");
      await page.route("**/api/auth/**", () => {});
      await fill(page, "#login-email", "revisao.loading@moldai.test");
      await fill(page, "#login-password", "QualquerSenha123");
      await page.click("form button[type=submit]");
      await page.waitForFunction(
        () => document.querySelector("form button[type=submit]").disabled,
      );
    },
    async check(page, t) {
      const sub = "form button[type=submit]";
      t.eq("rotulo", await text(page, sub), "Entrando…");
      t.eq("desabilitado", await page.$eval(sub, (b) => b.disabled), true);
      t.eq("altura inalterada", (await box(page, sub)).height, 36);
      t.eq("opacidade do disabled", await style(page, sub, "opacity"), "0.5");
      t.eq(
        "nada entra em erro",
        await count(page, "[data-slot=field-error]"),
        0,
      );
    },
  },

  {
    id: "signup.default",
    reference: "states/autenticacao/07-signup.png",
    async drive(page, ctx) {
      await page.goto(ctx.base + "/signup");
      await page.waitForSelector("#signup-email");
    },
    async check(page, t) {
      t.eq(
        "campos",
        (await page.$$eval("form input", (n) => n.map((i) => i.id))).join(","),
        "signup-name,signup-email,signup-password,signup-confirm",
      );
      // Deliberately NOT the design's "com letras e números": no such rule is
      // enforced today, so that copy would be a false promise. Tracked as #238;
      // when it ships, this string changes with it.
      t.eq(
        "hint da senha",
        await text(page, "[data-slot=field-description]"),
        "Mínimo de 8 caracteres.",
      );
      t.eq(
        "hint font-size",
        await style(page, "[data-slot=field-description]", "fontSize"),
        "11.5px",
      );
      t.eq("altura do card", await cardHeight(page), 608);
      // The design draws this enabled, but disabled states are explicitly
      // unspecified there ("Estados de interacao.dc.html"), so gating is ours.
      t.eq(
        "submit travado no formulario vazio",
        await page.$eval("form button[type=submit]", (b) => b.disabled),
        true,
      );
    },
  },

  {
    id: "signup.mismatch",
    reference: "states/autenticacao/08-signup-senhas-diferentes.png",
    async drive(page, ctx) {
      await page.goto(ctx.base + "/signup");
      await fill(page, "#signup-name", "Revisao Design");
      await fill(page, "#signup-email", "revisao.mismatch@moldai.test");
      await fill(page, "#signup-password", "SenhaValida123");
      await fill(page, "#signup-confirm", "SenhaDiferente456");
      await page.waitForSelector("[data-slot=field-error]");
    },
    async check(page, t) {
      t.eq(
        "mensagem",
        await text(page, "[data-slot=field-error]"),
        "As senhas não conferem.",
      );
      // The whole point of this state: only the confirm field is marked, and
      // the three fields above it stay untouched.
      t.eq(
        "borda nome intacta",
        await style(page, "#signup-name", "borderColor"),
        BORDER,
      );
      t.eq(
        "borda email intacta",
        await style(page, "#signup-email", "borderColor"),
        BORDER,
      );
      t.eq(
        "borda senha intacta",
        await style(page, "#signup-password", "borderColor"),
        BORDER,
      );
      t.eq(
        "borda confirmar em alerta",
        await style(page, "#signup-confirm", "borderColor"),
        ALERT,
      );
      t.eq(
        "aria-invalid so no confirmar",
        await page.getAttribute("#signup-confirm", "aria-invalid"),
        "true",
      );
    },
  },

  {
    id: "signup.taken",
    reference: "states/autenticacao/09-signup-email-em-uso.png",
    // Reuses the unverified fixture: any existing address produces this state,
    // and reusing one avoids creating an account per run against a 5/h cap.
    async setup() {
      clearSignupThrottles([FIXTURE_EMAIL]);
    },
    async drive(page, ctx) {
      await page.goto(ctx.base + "/signup");
      await fill(page, "#signup-name", "Revisao Design");
      await fill(page, "#signup-email", FIXTURE_EMAIL);
      await fill(page, "#signup-password", "SenhaValida123");
      await fill(page, "#signup-confirm", "SenhaValida123");
      await page.click("form button[type=submit]");
      await page.waitForSelector("[data-slot=field-error]");
    },
    async check(page, t) {
      t.eq(
        "mensagem",
        await text(page, "[data-slot=field-error]"),
        "Este email já está cadastrado.",
      );
      // The design attaches this to the Email field, not to the foot of the
      // form: the message sits between the Email input and the Senha label.
      const email = await box(page, "#signup-email");
      const msg = await box(page, "[data-slot=field-error]");
      const senhaLabel = await box(page, "label[for=signup-password]");
      t.eq("mensagem abaixo do email", msg.top - email.bottom, GAP_FIELD);
      t.eq("mensagem acima da senha", msg.bottom < senhaLabel.top, true);
      t.eq(
        "borda email em alerta",
        await style(page, "#signup-email", "borderColor"),
        ALERT,
      );
      t.eq(
        "borda nome intacta",
        await style(page, "#signup-name", "borderColor"),
        BORDER,
      );
      t.eq(
        "borda senha intacta",
        await style(page, "#signup-password", "borderColor"),
        BORDER,
      );
      t.eq(
        "borda confirmar intacta",
        await style(page, "#signup-confirm", "borderColor"),
        BORDER,
      );
      t.eq(
        "aria-invalid so no email",
        await page.getAttribute("#signup-email", "aria-invalid"),
        "true",
      );
    },
  },

  {
    id: "signup.loading",
    reference: "states/autenticacao/10-signup-loading.png",
    // The POST is intercepted and never fulfilled, so this is the real loading
    // state with a genuinely pending request. It also never reaches the server,
    // which means no account is created and no signup bucket slot is spent.
    async drive(page, ctx) {
      await page.goto(ctx.base + "/signup");
      await page.route("**/api/signup", () => {});
      await fill(page, "#signup-name", "Revisao Design");
      await fill(page, "#signup-email", "revisao.loading@moldai.test");
      await fill(page, "#signup-password", "SenhaValida123");
      await fill(page, "#signup-confirm", "SenhaValida123");
      await page.click("form button[type=submit]");
      await page.waitForFunction(
        () => document.querySelector("form button[type=submit]").disabled,
      );
    },
    async check(page, t) {
      const sub = "form button[type=submit]";
      t.eq("rotulo", await text(page, sub), "Criando conta…");
      t.eq("desabilitado", await page.$eval(sub, (b) => b.disabled), true);
      t.eq("altura inalterada", (await box(page, sub)).height, 36);
      t.eq("opacidade do disabled", await style(page, sub, "opacity"), "0.5");
      t.eq(
        "nada entra em erro",
        await count(page, "[data-slot=field-error]"),
        0,
      );
      // The four inputs stay untouched while the request is in flight.
      for (const id of ["name", "email", "password", "confirm"]) {
        t.eq(
          `borda ${id} intacta`,
          await style(page, `#signup-${id}`, "borderColor"),
          BORDER,
        );
      }
    },
  },

  {
    id: "signup.sent",
    reference: "states/autenticacao/11-signup-email-enviado.png",
    // This one cannot be faked: the confirmation panel only appears after a
    // real, successful signup, so it creates an account and sends a real mail
    // (Mailpit, in the dev stack). Hence a unique address per run -- reusing one
    // would answer `email_taken` and land on the error state instead. It leaves
    // a row behind in the dev database by design; there is no other way to reach
    // this screen.
    async setup(ctx) {
      clearSignupThrottles();
      ctx.email = `review-sent-${Date.now()}@moldai.test`;
    },
    async drive(page, ctx) {
      await page.goto(ctx.base + "/signup");
      await fill(page, "#signup-name", "Revisao Design");
      await fill(page, "#signup-email", ctx.email);
      await fill(page, "#signup-password", "SenhaValida123");
      await fill(page, "#signup-confirm", "SenhaValida123");
      await page.click("form button[type=submit]");
      // The whole form is replaced by the confirmation panel, so waiting on the
      // heading is what tells us we got the success branch and not an error.
      await page.waitForFunction(
        () =>
          document.querySelector("h1")?.textContent.trim() ===
          "Confirme seu email",
      );
    },
    async check(page, t) {
      t.eq("titulo", await text(page, "h1"), "Confirme seu email");
      // The address is echoed back in bold inside the body copy -- the design's
      // one dynamic piece of text on this screen.
      const corpo = await text(page, "h1 ~ div p");
      t.eq("corpo cita o email", corpo.includes("@moldai.test"), true);
      t.eq("corpo em ink", await style(page, "h1 ~ div p", "color"), INK);
      t.eq(
        "email em destaque",
        await style(page, "h1 ~ div p span", "fontWeight"),
        "500",
      );
      t.eq(
        "dica",
        await text(page, "h1 ~ div p + p"),
        "Não chegou? Verifique o spam ou reenvie.",
      );
      const reenviar = "h1 ~ div button";
      t.eq("botao reenviar", await text(page, reenviar), "Reenviar");
      t.eq("altura do reenviar", (await box(page, reenviar)).height, 36);
      // The form, the divider and the Google button are all gone in this state.
      t.eq("formulario substituido", await count(page, "form input"), 0);
      t.eq("sem botao do google", await count(page, "form"), 0);
      // Full width, matching the design and LoginCard's own resend button.
      t.eq(
        "reenviar ocupa a largura do card",
        (await box(page, reenviar)).width,
        await page.$eval("h1", (h) =>
          Math.round(h.getBoundingClientRect().width),
        ),
      );
      const rodape = await text(page, "h1 ~ p");
      t.eq("rodape", rodape, "Voltar para login");
      t.eq(
        "rodape centralizado",
        await style(page, "h1 ~ p", "textAlign"),
        "center",
      );
    },
  },

  {
    id: "reset.request",
    reference: "states/autenticacao/12-esqueci-senha.png",
    async drive(page, ctx) {
      await page.goto(ctx.base + "/password-reset");
      await page.waitForSelector("#reset-email");
    },
    async check(page, t) {
      t.eq("titulo", await text(page, "h1"), "Redefinir senha");
      t.eq(
        "subtitulo",
        await text(page, "h1 + p"),
        "Informe seu email e enviaremos um link para redefinir sua senha.",
      );
      t.eq("um unico campo", await count(page, "form input"), 1);
      t.eq("label", await text(page, "label[for=reset-email]"), "Email");
      t.eq(
        "label font-size",
        await style(page, "label[for=reset-email]", "fontSize"),
        "12.5px",
      );
      t.eq("altura do input", (await box(page, "#reset-email")).height, 36);
      const sub = "form button[type=submit]";
      t.eq("rotulo do botao", await text(page, sub), "Enviar link");
      // Unlike signup, this form does not gate its submit: an empty address is
      // answered by the route, which always says 200 so it cannot be used to
      // probe which addresses exist.
      t.eq("botao habilitado", await page.$eval(sub, (b) => b.disabled), false);
      t.eq(
        "rodape centralizado",
        await style(page, "h1 ~ p:last-of-type", "textAlign"),
        "center",
      );
      const email = await box(page, "#reset-email");
      const botao = await box(page, sub);
      // 16px, not 12: the submit carries mt-1 here like every other card.
      t.eq("input->botao", botao.top - email.bottom, GAP_SUBMIT);
    },
  },

  {
    id: "reset.sent",
    reference: "states/autenticacao/13-esqueci-senha-enviado.png",
    async drive(page, ctx) {
      await page.goto(ctx.base + "/password-reset");
      await fill(page, "#reset-email", FIXTURE_EMAIL);
      await page.click("form button[type=submit]");
      await page.waitForFunction(
        () =>
          document.querySelector("h1")?.textContent.trim() ===
          "Verifique seu email",
      );
    },
    async check(page, t) {
      t.eq("titulo", await text(page, "h1"), "Verifique seu email");
      // Deliberately NOT the design's wording, which names the address back.
      // The route always answers 200 so it cannot be used to test whether an
      // address is registered; echoing it here would make the UI that oracle.
      t.eq(
        "corpo generico (nao cita o endereco)",
        await text(page, "h1 + p"),
        "Se este email estiver cadastrado, você vai receber um link para redefinir sua senha.",
      );
      t.eq("corpo em ink", await style(page, "h1 + p", "color"), INK);
      t.eq(
        "rodape",
        await text(page, "h1 ~ p:last-of-type"),
        "Voltar para login",
      );
      t.eq(
        "rodape centralizado",
        await style(page, "h1 ~ p:last-of-type", "textAlign"),
        "center",
      );
      // Tracked as #239: the design also gives this state a resend button and
      // a hint line, neither of which exists yet.
      t.eq(
        "sem botao reenviar (issue #239)",
        await count(page, "h1 ~ button, h1 ~ * button"),
        0,
      );
    },
  },

  {
    id: "verify.prompt",
    reference: "states/autenticacao/14-verificar-email.png",
    // The token comes out of Mailpit because it exists nowhere else: the row
    // stores a sha-256 digest, not the token itself. This scenario deliberately
    // does NOT click the button -- confirming would consume the fixture's token
    // and verify the very account login.unverified and login.resent depend on.
    async setup(ctx) {
      const link = await latestMailLink(
        FIXTURE_EMAIL,
        /https?:\/\/[^\s"'<>]+verify[^\s"'<>]*/i,
      );
      ctx.token = new URL(link).searchParams.get("token");
    },
    async drive(page, ctx) {
      await page.goto(ctx.base + "/verify?token=" + ctx.token);
      await page.waitForSelector("h1 ~ button");
    },
    async check(page, t) {
      t.eq("titulo", await text(page, "h1"), "Confirmar email");
      t.eq(
        "corpo",
        await text(page, "h1 + p"),
        "Clique no botão para confirmar que este email é seu e liberar o acesso à sua conta.",
      );
      // Full ink here, unlike the password-reset intro, which the design
      // colours muted-2 on purpose.
      t.eq("corpo em ink", await style(page, "h1 + p", "color"), INK);
      t.eq(
        "corpo line-height 1.6",
        await style(page, "h1 + p", "lineHeight"),
        "20px",
      );
      const btn = "h1 ~ button";
      t.eq("rotulo do botao", await text(page, btn), "Confirmar meu email");
      t.eq("altura do botao", (await box(page, btn)).height, 36);
      t.eq("botao habilitado", await page.$eval(btn, (b) => b.disabled), false);
      // Full width, like the design and every other auth card.
      t.eq(
        "botao ocupa a largura do card",
        (await box(page, btn)).width,
        (await box(page, "h1")).width,
      );
      t.eq(
        "rodape",
        await text(page, "h1 ~ p:last-of-type"),
        "Voltar para login",
      );
      t.eq(
        "rodape centralizado",
        await style(page, "h1 ~ p:last-of-type", "textAlign"),
        "center",
      );
    },
  },

  {
    id: "verify.expired",
    reference: "states/autenticacao/15-verificar-link-expirado.png",
    // A token the route cannot possibly accept -- no fixture needed, and it
    // consumes nothing.
    async drive(page, ctx) {
      await page.goto(
        ctx.base + "/verify?token=token-invalido-de-revisao-0000",
      );
      await page.waitForSelector("h1 ~ button");
      await page.click("h1 ~ button");
      await page.waitForSelector(".text-alert");
    },
    async check(page, t) {
      t.eq(
        "mensagem",
        await text(page, ".text-alert"),
        "Este link não é válido. Peça um novo na tela de login.",
      );
      t.eq("mensagem cor", await style(page, ".text-alert", "color"), ALERT);
      // 11.5px like every FieldError -- this paragraph is hand-written, so the
      // primitive's sizing never reached it until the review caught up.
      t.eq(
        "mensagem font-size",
        await style(page, ".text-alert", "fontSize"),
        "11.5px",
      );
      // Tracked as #240: the design turns the button into "Reenviar link de
      // confirmação" here, because retrying a dead token can never work.
      t.eq(
        "botao ainda oferece reconfirmar (issue #240)",
        await text(page, "h1 ~ button"),
        "Confirmar meu email",
      );
    },
  },

  {
    id: "verify.done",
    reference: "states/autenticacao/16-verificado.png",
    // The only state that must actually CONSUME a token, which verifies the
    // account for good -- so it gets a throwaway address every run. Using the
    // shared fixture here would verify it and break login.unverified and
    // login.resent, which need it to stay unverified.
    async setup(ctx) {
      clearSignupThrottles();
      ctx.email = `review-verified-${Date.now()}@moldai.test`;
      const res = await ctx.request.post(ctx.base + "/api/signup", {
        data: { name: "Revisao Design", email: ctx.email, password: PASSWORD },
      });
      const body = await res.json().catch(() => ({}));
      if (body.status !== "ok") {
        throw new Error(`signup falhou (${res.status()}): ${body.error}`);
      }
      const link = await latestMailLink(
        ctx.email,
        /https?:\/\/[^\s"'<>]+verify[^\s"'<>]*/i,
      );
      ctx.token = new URL(link).searchParams.get("token");
    },
    async drive(page, ctx) {
      await page.goto(ctx.base + "/verify?token=" + ctx.token);
      await page.click("h1 ~ button");
      await page.waitForFunction(
        () =>
          document.querySelector("h1")?.textContent.trim() ===
          "Email confirmado!",
      );
    },
    async check(page, t) {
      t.eq("titulo", await text(page, "h1"), "Email confirmado!");
      t.eq(
        "corpo",
        await text(page, "h1 + p"),
        "Tudo certo. Agora é só entrar com sua senha.",
      );
      t.eq("corpo em ink", await style(page, "h1 + p", "color"), INK);
      const cta = 'h1 ~ a[href="/login"]';
      t.eq("rotulo do botao", await text(page, cta), "Ir para o login");
      t.eq(
        "botao ocupa a largura do card",
        (await box(page, cta)).width,
        (await box(page, "h1")).width,
      );
    },
  },
];

export default scenarios;
