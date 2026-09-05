import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  waitFor,
  userEvent,
  translatorFor,
} from "@/components/test-utils";
import type { NewPatternFormInput } from "@/lib/dashboardStore";
import type { SizeChartListEntry } from "@/lib/types";
import {
  COSTS,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_PATTERN_NAME_LENGTH,
} from "@/lib/types";
import { MAX_ATTACHMENT_COUNT } from "@/lib/editor/attachment";
import { NewPatternForm } from "./NewPatternForm";

// Both specifiers are exactly the ones the subject imports (CLAUDE.md: a
// mismatch never intercepts and reports zero calls instead of an error).
vi.mock("@/lib/api-client", () => ({ listSizeCharts: vi.fn() }));
vi.mock("@/lib/editor/attachment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/editor/attachment")>()),
  prepareImage: vi.fn(),
}));

const { listSizeCharts } = await import("@/lib/api-client");
const { prepareImage } = await import("@/lib/editor/attachment");

const t = translatorFor("NewPatternForm");
const tGarment = translatorFor("TechSheetTab");
const tCredit = translatorFor("MessageInput");
const F = ptBR.NewPatternForm.field;
const V = ptBR.NewPatternForm.value;

function chart(over: Partial<SizeChartListEntry> = {}): SizeChartListEntry {
  return {
    id: "sc-f",
    name: "Padrão feminino",
    gender: "female",
    bodyType: "hourglass",
    isSystem: true,
    isActive: true,
    sizes: ["P"],
    baseSizeIndex: 0,
    baseMeasurements: {},
    progressionRule: {},
    overrides: {},
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  } as SizeChartListEntry;
}

const CHARTS = [
  chart(),
  chart({
    id: "sc-m",
    name: "Padrão masculino",
    gender: "male",
    isActive: false,
  }),
];

// Ordered male-first with NEITHER active, which is what a brand-new account
// actually gets: the two system charts are seeded on first access and no
// activeSizeChartId is set yet.
//
// The middle entry is a CUSTOM female chart placed ahead of the system one on
// purpose. Without it every row is `isSystem`, so the fixture could not tell
// "the system female chart wins" from "any female chart wins" -- dropping
// `isSystem` from the preference left the suite green. Found by the
// Verifier's sensor.
const CHARTS_NONE_ACTIVE = [
  chart({
    id: "sc-m",
    name: "Padrão masculino",
    gender: "male",
    isActive: false,
  }),
  chart({
    id: "sc-custom-f",
    name: "Minha grade",
    gender: "female",
    isSystem: false,
    isActive: false,
  }),
  chart({
    id: "sc-f",
    name: "Padrão feminino",
    gender: "female",
    isActive: false,
  }),
];

function prepared(base64: string) {
  return { mediaType: "image/jpeg" as const, base64 };
}

let submitted: NewPatternFormInput | null;

function setup(props: Partial<Parameters<typeof NewPatternForm>[0]> = {}) {
  submitted = null;
  const user = userEvent.setup();
  renderWithIntl(
    <NewPatternForm
      onBack={() => {}}
      onSubmit={(input) => {
        submitted = input;
      }}
      submitting={false}
      {...props}
    />,
  );
  return user;
}

/** Picks `option` in the select labelled `label`. */
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(screen.getByRole("option", { name: option }));
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: t("submit") }));
}

function detailsField(): HTMLTextAreaElement {
  return screen.getByLabelText(F.details) as HTMLTextAreaElement;
}

function photoInput(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(
    'input[data-slot="photo-input"]',
  );
  if (!el) throw new Error("photo input not rendered");
  return el;
}

function jpeg(name: string) {
  return new File(["x"], name, { type: "image/jpeg" });
}

beforeEach(() => {
  vi.mocked(listSizeCharts).mockResolvedValue(CHARTS);
  vi.mocked(prepareImage).mockReset();
});

describe("NewPatternForm — bounds", () => {
  // PFORM-03: the field stops you before the round trip does.
  it("caps the name field at the same length the API enforces", () => {
    setup();
    expect(screen.getByLabelText(F.name)).toHaveAttribute(
      "maxlength",
      String(MAX_PATTERN_NAME_LENGTH),
    );
  });

  // PFORM-05. The cap is the chat-message ceiling MINUS the composed head,
  // because the message the route length-checks is head + blank line +
  // details. Capping at the raw ceiling would let the field accept a submit
  // the route rejects with message_too_long, after a create round trip and
  // with no retry that could succeed.
  it("reserves room for the composed head inside the chat message cap", () => {
    setup();
    const head = tGarment("garmentType.blouse");
    const max = Number(detailsField().getAttribute("maxlength"));
    expect(max + head.length + 2).toBe(MAX_CHAT_MESSAGE_LENGTH);
  });

  it("shrinks that room as each style choice lengthens the head", async () => {
    const user = setup();
    const before = Number(detailsField().getAttribute("maxlength"));
    await choose(user, F.neckline, V.neckline.round);
    const after = Number(detailsField().getAttribute("maxlength"));
    expect(after).toBeLessThan(before);
    expect(after).toBe(before - ` · ${F.neckline}: ${V.neckline.round}`.length);
  });

  // Dashboard.dc.html:285-290 gives the form's Input and every SelectTrigger
  // hint-size="100%,36px", and the two footer Buttons size="sm"
  // hint-size="auto,32px". SelectTrigger's `sm` renders 32px, so using it
  // here left every select a step shorter than the name input beside it --
  // caught by measuring a real render, not by reading the code. data-size is
  // the primitive's own contract, which is assertable where a computed
  // height in jsdom is not.
  it("sizes every select to the design's 36px, matching the name input", () => {
    setup();
    for (const el of document.querySelectorAll(
      '[data-slot="select-trigger"]',
    )) {
      expect(el).toHaveAttribute("data-size", "default");
    }
    expect(screen.getByLabelText(F.name)).toHaveClass("h-9");
  });

  it("keeps the footer actions at the design's smaller 32px", () => {
    setup();
    for (const name of [t("back"), t("submit")]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "data-size",
        "sm",
      );
    }
  });

  // PFORM-10: the real charge, stated where the paying action is.
  it("states the generation's real credit cost", () => {
    setup();
    expect(
      screen.getByText(tCredit("creditCost", { cost: COSTS.adjust })),
    ).toBeInTheDocument();
  });
});

describe("NewPatternForm — style controls", () => {
  // PFORM-20
  it("defaults every style select to the leave-it-to-the-AI option", () => {
    setup();
    for (const label of [
      F.neckline,
      F.sleeve,
      F.collar,
      F.frontClosure,
      F.fit,
    ]) {
      expect(screen.getByRole("combobox", { name: label })).toHaveTextContent(
        t("styleAuto"),
      );
    }
  });

  // PFORM-20: the field must be absent from the spec, not present-as-default.
  it("sends no style field while every select is left on that default", async () => {
    const user = setup();
    await submit(user);
    expect(submitted!.formSpec.style).toEqual({});
  });

  it("sends only the style fields that were actually chosen", async () => {
    const user = setup();
    await choose(user, F.neckline, V.neckline.round);
    await submit(user);
    expect(submitted!.formSpec.style).toEqual({ neckline: "round" });
  });

  // Found by mutation testing, not by inspection: the sentinel is only
  // reachable in state after the user picks a real value and then changes
  // their mind back. Sending it would be worse than sending nothing, because
  // validateSpec resolves an unrecognised neckline to "straight" -- so
  // "leave it to the AI" would silently draft a straight neckline instead.
  it("sends no value for a field switched back to the leave-it-to-the-AI option", async () => {
    const user = setup();
    await choose(user, F.neckline, V.neckline.round);
    await choose(user, F.neckline, t("styleAuto"));
    await submit(user);
    expect(submitted!.formSpec.style).toEqual({});
    expect("neckline" in submitted!.formSpec.style).toBe(false);
  });

  it("also composes no message fragment for a field switched back to that default", async () => {
    const user = setup();
    await choose(user, F.neckline, V.neckline.round);
    await choose(user, F.neckline, t("styleAuto"));
    await submit(user);
    expect(submitted!.message).toBe(tGarment("garmentType.blouse"));
  });

  // PFORM-21
  it("omits body-only controls for a skirt", async () => {
    const user = setup();
    await choose(user, F.type, tGarment("garmentType.skirt"));
    for (const label of [F.neckline, F.sleeve, F.collar, F.frontClosure]) {
      expect(
        screen.queryByRole("combobox", { name: label }),
      ).not.toBeInTheDocument();
    }
    expect(
      screen.getByRole("combobox", { name: F.waistband }),
    ).toBeInTheDocument();
  });

  // PFORM-21. body.ts splits the front only for a non-knit garment with no
  // dress hem, so the control would silently do nothing on a dress or a
  // tshirt -- the same reason `cuff` is gated on a long sleeve.
  it.each([
    ["dress", "garmentType.dress"],
    ["tshirt", "garmentType.tshirt"],
  ])("omits the front-closure control for a %s", async (_type, key) => {
    const user = setup();
    expect(
      screen.getByRole("combobox", { name: F.frontClosure }),
    ).toBeInTheDocument();

    await choose(user, F.type, tGarment(key));
    expect(
      screen.queryByRole("combobox", { name: F.frontClosure }),
    ).not.toBeInTheDocument();
  });

  it("never sends a front closure for a type whose front is never split", async () => {
    const user = setup();
    await choose(user, F.frontClosure, V.frontClosure.buttonStand);
    await choose(user, F.type, tGarment("garmentType.tshirt"));
    await submit(user);
    expect(submitted!.formSpec.style.frontClosure).toBeUndefined();
  });

  // PFORM-21, the other direction: a blouse has no waistband to draft.
  it("omits the waistband control for a blouse", () => {
    setup();
    expect(
      screen.queryByRole("combobox", { name: F.waistband }),
    ).not.toBeInTheDocument();
  });

  // PFORM-22: no drafter reads style.cuff for a short or sleeveless garment.
  it("offers the cuff control only while the sleeve is long", async () => {
    const user = setup();
    expect(
      screen.queryByRole("combobox", { name: F.cuff }),
    ).not.toBeInTheDocument();

    await choose(user, F.sleeve, V.sleeve.long);
    expect(screen.getByRole("combobox", { name: F.cuff })).toBeInTheDocument();

    await choose(user, F.sleeve, V.sleeve.short);
    expect(
      screen.queryByRole("combobox", { name: F.cuff }),
    ).not.toBeInTheDocument();
  });

  it("drops a chosen cuff from the spec once the sleeve is no longer long", async () => {
    const user = setup();
    await choose(user, F.sleeve, V.sleeve.long);
    await choose(user, F.cuff, V.cuff.straight);
    await choose(user, F.sleeve, V.sleeve.short);
    await submit(user);
    expect(submitted!.formSpec.style.cuff).toBeUndefined();
    expect(submitted!.formSpec.style.sleeve).toBe("short");
  });

  // PFORM-23: asserted on the submitted spec, since a value left in state
  // would be sent as an explicit choice the user can no longer see.
  it("clears a style value the newly chosen garment type does not apply", async () => {
    const user = setup();
    await choose(user, F.collar, V.collar.band);
    await choose(user, F.type, tGarment("garmentType.skirt"));
    await submit(user);
    expect(submitted!.formSpec.type).toBe("skirt");
    expect(submitted!.formSpec.style.collar).toBeUndefined();
  });

  it("resets that control to the default when the type changes back", async () => {
    const user = setup();
    await choose(user, F.collar, V.collar.band);
    await choose(user, F.type, tGarment("garmentType.skirt"));
    await choose(user, F.type, tGarment("garmentType.blouse"));
    expect(screen.getByRole("combobox", { name: F.collar })).toHaveTextContent(
      t("styleAuto"),
    );
  });

  // The form has no measurement fields, and an empty object is what lets the
  // route's merge keep whatever the model read out of the details text.
  it("never sends a measurement override", async () => {
    const user = setup();
    await submit(user);
    expect(submitted!.formSpec.measurementOverrides).toEqual({});
  });
});

describe("NewPatternForm — size chart", () => {
  // PFORM-40
  it("lists every chart the account owns and sends the chosen one", async () => {
    const user = setup();
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: F.sizeChart }),
      ).toHaveTextContent(CHARTS[0].name),
    );

    await choose(user, F.sizeChart, CHARTS[1].name);
    await submit(user);
    expect(submitted!.sizeChartId).toBe("sc-m");
  });

  it("defaults to the account's active chart", async () => {
    const user = setup();
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: F.sizeChart }),
      ).toHaveTextContent(CHARTS[0].name),
    );
    await submit(user);
    expect(submitted!.sizeChartId).toBe("sc-f");
  });

  // The control decides more than its label says: the chart's own gender
  // becomes the block the molde is traced from (PFORM-41), so saying so is
  // the honest-limitation rule, not decoration.
  it("states that the chosen chart decides the block's gender", async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByText(t("chartGenderNote"))).toBeInTheDocument(),
    );
  });

  // Caught by a real render: a brand-new account has no active chart, and
  // taking the first entry handed it the MALE block for a form that defaults
  // to "Blusa", with nothing on screen saying so. The app's own fallback
  // elsewhere is the system female chart.
  it("falls back to the system female chart when none is active", async () => {
    vi.mocked(listSizeCharts).mockResolvedValue(CHARTS_NONE_ACTIVE);
    const user = setup();
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: F.sizeChart }),
      ).toHaveTextContent("Padrão feminino"),
    );
    await submit(user);
    expect(submitted!.sizeChartId).toBe("sc-f");
  });

  // PFORM-46: additive failure -- it states why and still lets you submit.
  it("disables the chart select with a stated reason when the list fails to load", async () => {
    vi.mocked(listSizeCharts).mockRejectedValue(new Error("nope"));
    setup();
    await waitFor(() =>
      expect(screen.getByText(t("chartLoadFailed"))).toBeInTheDocument(),
    );
    expect(screen.getByRole("combobox", { name: F.sizeChart })).toBeDisabled();
  });

  it("still submits after a failed chart load, falling back to the account's chart", async () => {
    vi.mocked(listSizeCharts).mockRejectedValue(new Error("nope"));
    const user = setup();
    await waitFor(() =>
      expect(screen.getByText(t("chartLoadFailed"))).toBeInTheDocument(),
    );
    await submit(user);
    expect(submitted!.sizeChartId).toBeNull();
  });
});

describe("NewPatternForm — photos", () => {
  // PFORM-60
  it("stops offering the add control once the cap is reached", async () => {
    const user = setup();
    vi.mocked(prepareImage).mockImplementation(async (file: File) =>
      prepared(file.name),
    );

    const files = Array.from({ length: MAX_ATTACHMENT_COUNT }, (_, i) =>
      jpeg(`p${i}.jpg`),
    );
    await user.upload(photoInput(), files);

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: t("addPhoto") }),
      ).not.toBeInTheDocument(),
    );
  });

  // PFORM-60's "accept up to MAX_ATTACHMENT_COUNT" clause. Found by the
  // Verifier's sensor: the per-batch cap in pickPhotos survived deletion
  // because nothing picked more than the cap in ONE multi-select. Without
  // it the server refuses the over-count list pre-debit, but only after a
  // Pattern was created, and its 400 resolves to the generic message.
  it("holds only the first MAX_ATTACHMENT_COUNT of an over-long selection", async () => {
    const user = setup();
    vi.mocked(prepareImage).mockImplementation(async (file: File) =>
      prepared(file.name),
    );

    const tooMany = Array.from({ length: MAX_ATTACHMENT_COUNT + 2 }, (_, i) =>
      jpeg(`p${i}.jpg`),
    );
    await user.upload(photoInput(), tooMany);

    await waitFor(() =>
      expect(
        screen.getAllByRole("button", {
          name: ptBR.AttachmentChips.removeAttachment,
        }),
      ).toHaveLength(MAX_ATTACHMENT_COUNT),
    );

    await submit(user);
    expect(submitted!.images).toHaveLength(MAX_ATTACHMENT_COUNT);
    // The first N, in the order picked -- not the last N, and not shuffled.
    expect(submitted!.images.map((i) => i.base64)).toEqual(
      Array.from({ length: MAX_ATTACHMENT_COUNT }, (_, i) => `p${i}.jpg`),
    );
  });

  it("sends every prepared photo it holds", async () => {
    const user = setup();
    vi.mocked(prepareImage).mockImplementation(async (file: File) =>
      prepared(file.name),
    );

    await user.upload(photoInput(), [jpeg("a.jpg"), jpeg("b.jpg")]);
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", {
          name: ptBR.AttachmentChips.removeAttachment,
        }),
      ).toHaveLength(2),
    );
    await submit(user);

    expect(submitted!.images.map((i) => i.base64)).toEqual(["a.jpg", "b.jpg"]);
  });

  // PFORM-62
  it("shows the rejected file's own reason and keeps the photos already added", async () => {
    const user = setup();
    vi.mocked(prepareImage)
      .mockResolvedValueOnce(prepared("kept.jpg"))
      .mockResolvedValueOnce({ error: "too_large" });

    await user.upload(photoInput(), [jpeg("kept.jpg"), jpeg("huge.jpg")]);

    await waitFor(() =>
      expect(
        screen.getByText(ptBR.AttachmentChips.errors.too_large),
      ).toBeInTheDocument(),
    );
    await submit(user);
    expect(submitted!.images.map((i) => i.base64)).toEqual(["kept.jpg"]);
  });

  it("resolves each rejection to its own message, not one generic notice", async () => {
    const user = setup();
    vi.mocked(prepareImage).mockResolvedValue({ error: "unsupported_type" });

    await user.upload(photoInput(), [jpeg("weird.tiff")]);

    await waitFor(() =>
      expect(
        screen.getByText(ptBR.AttachmentChips.errors.unsupported_type),
      ).toBeInTheDocument(),
    );
  });

  // PFORM-63
  it("removes only the photo whose own remove control was used", async () => {
    const user = setup();
    vi.mocked(prepareImage).mockImplementation(async (file: File) =>
      prepared(file.name),
    );

    await user.upload(photoInput(), [
      jpeg("a.jpg"),
      jpeg("b.jpg"),
      jpeg("c.jpg"),
    ]);
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", {
          name: ptBR.AttachmentChips.removeAttachment,
        }),
      ).toHaveLength(3),
    );

    await user.click(
      screen.getAllByRole("button", {
        name: ptBR.AttachmentChips.removeAttachment,
      })[1],
    );
    await submit(user);

    expect(submitted!.images.map((i) => i.base64)).toEqual(["a.jpg", "c.jpg"]);
  });

  // Also caught by a real render: with the style selects added the dialog
  // grew taller than a 900px viewport, which put "Gerar molde com IA" below
  // the fold. Only the field column scrolls, so the footer stays reachable.
  it("scrolls the field column rather than growing past the viewport", () => {
    setup();
    const column = screen.getByLabelText(F.name).closest("div.overflow-y-auto");
    expect(column).not.toBeNull();
    expect(column).toHaveClass("max-h-[55vh]");
    // The footer sits OUTSIDE that scroller, which is what keeps it on screen.
    const submitBtn = screen.getByRole("button", { name: t("submit") });
    expect(column!.contains(submitBtn)).toBe(false);
  });

  it("states the photo cap on screen", () => {
    setup();
    expect(
      screen.getByText(t("photoLimitNote", { max: MAX_ATTACHMENT_COUNT })),
    ).toBeInTheDocument();
  });
});

describe("NewPatternForm — composed message", () => {
  it("names the garment type even when nothing else is filled in", async () => {
    const user = setup();
    await submit(user);
    expect(submitted!.message).toBe(tGarment("garmentType.blouse"));
  });

  it("names every chosen style value alongside the garment type", async () => {
    const user = setup();
    await choose(user, F.neckline, V.neckline.round);
    await choose(user, F.sleeve, V.sleeve.long);
    await submit(user);

    expect(submitted!.message).toBe(
      [
        tGarment("garmentType.blouse"),
        `${F.neckline}: ${V.neckline.round}`,
        `${F.sleeve}: ${V.sleeve.long}`,
      ].join(" · "),
    );
  });

  it("appends the details text as its own paragraph", async () => {
    const user = setup();
    await user.type(screen.getByLabelText(F.details), "com zíper invisível");
    await submit(user);

    expect(submitted!.message).toBe(
      `${tGarment("garmentType.blouse")}\n\ncom zíper invisível`,
    );
  });

  // Edge case from the spec: whitespace-only details must not produce a
  // trailing blank paragraph, and must not make the message empty either --
  // the route rejects an empty message with missing_message.
  it("ignores whitespace-only details", async () => {
    const user = setup();
    await user.type(screen.getByLabelText(F.details), "   ");
    await submit(user);
    expect(submitted!.message).toBe(tGarment("garmentType.blouse"));
  });

  it("trims the name and passes it through", async () => {
    const user = setup();
    await user.type(screen.getByLabelText(F.name), "  Blusa gola alta  ");
    await submit(user);
    expect(submitted!.name).toBe("Blusa gola alta");
  });
});

// #269 Fase 5: the engine Select, and the type Select it gates.
describe("NewPatternForm — engine selection", () => {
  it("defaults to moldai and sends it alongside the rest of the submission", async () => {
    const user = setup();
    await submit(user);
    expect(submitted!.engine).toBe("moldai");
  });

  it("disables a freesewing-only type under moldai, and enables it once freesewing is chosen", async () => {
    const user = setup();
    await user.click(screen.getByRole("combobox", { name: F.type }));
    expect(
      screen.getByRole("option", { name: tGarment("garmentType.coat") }),
    ).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Escape}");

    await choose(user, F.engine, tGarment("engine.freesewing"));
    await user.click(screen.getByRole("combobox", { name: F.type }));
    expect(
      screen.getByRole("option", { name: tGarment("garmentType.coat") }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("never rewrites an already-chosen type when the engine changes -- it blocks submit and states the reason instead", async () => {
    const user = setup();
    await choose(user, F.engine, tGarment("engine.freesewing"));
    await choose(user, F.type, tGarment("garmentType.coat"));

    // Switching back to moldai (which does not draft "coat") must not
    // silently revert the type field out from under the user.
    await choose(user, F.engine, tGarment("engine.moldai"));

    expect(screen.getByRole("combobox", { name: F.type })).toHaveTextContent(
      tGarment("garmentType.coat"),
    );
    expect(
      screen.getByText(ptBR.NewPatternForm.typeUnsupportedByEngine),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("submit") })).toBeDisabled();

    // Switching back to a supporting engine clears the block.
    await choose(user, F.engine, tGarment("engine.freesewing"));
    expect(screen.getByRole("button", { name: t("submit") })).toBeEnabled();
    await submit(user);
    expect(submitted!.engine).toBe("freesewing");
    expect(submitted!.formSpec.type).toBe("coat");
  });
});

describe("NewPatternForm — submitting and failure", () => {
  // PFORM-07's form half.
  it("disables every control while the round trip is in flight", () => {
    setup({ submitting: true });
    expect(screen.getByLabelText(F.name)).toBeDisabled();
    expect(screen.getByLabelText(F.details)).toBeDisabled();
    expect(screen.getByRole("combobox", { name: F.type })).toBeDisabled();
    expect(screen.getByRole("button", { name: t("back") })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: t("submitting") }),
    ).toBeDisabled();
  });

  // PFORM-09's form half: the dashboard's shared notice renders one fixed
  // sentence and sits behind this dialog, so the code is resolved here.
  it("resolves a known failure code to its own message", () => {
    setup({ errorCode: "insufficient_credits" });
    expect(
      screen.getByText(ptBR.NewPatternForm.errors.insufficient_credits),
    ).toBeInTheDocument();
  });

  // The store keeps pendingPatternId alive on this code so a submit after
  // buying resumes the same Pattern. Without a way to reach that, naming the
  // blocker is a dead end -- VerificationPanel pairs the same code with the
  // same link.
  it("offers a way to buy credits when that is what blocked the submit", () => {
    setup({ errorCode: "insufficient_credits" });
    expect(
      screen.getByRole("link", { name: t("buyCreditsLink") }),
    ).toHaveAttribute("href", "/settings?section=plan");
  });

  it("offers no such link for a failure buying credits would not fix", () => {
    setup({ errorCode: "create_failed" });
    expect(
      screen.queryByRole("link", { name: t("buyCreditsLink") }),
    ).not.toBeInTheDocument();
  });

  it("resolves a message-too-long rejection to its own message", () => {
    setup({ errorCode: "message_too_long" });
    expect(
      screen.getByText(ptBR.NewPatternForm.errors.message_too_long),
    ).toBeInTheDocument();
  });

  it("resolves an unrecognised failure code to the generic message", () => {
    setup({ errorCode: "some_code_this_screen_never_names" });
    expect(
      screen.getByText(ptBR.NewPatternForm.errors.fallback),
    ).toBeInTheDocument();
  });

  it("shows no failure message when there is no error", () => {
    setup();
    expect(
      screen.queryByText(ptBR.NewPatternForm.errors.fallback),
    ).not.toBeInTheDocument();
  });
});
