-- planLabel held pt-BR display text ("Grátis"/"Ateliê") fully derivable from
-- "plan", which made it possible for the label to drift from the plan it
-- described. The label is now a catalog lookup keyed by the plan enum, so the
-- column carries nothing that cannot be recomputed.
ALTER TABLE "Wallet" DROP COLUMN "planLabel";
