-- #37: the renewal sweep reset `balance` straight to `total`, deleting any
-- credits bought via top-up outside the monthly plan allowance. `purchased`
-- is a carry-over pool that a renewal never touches; `total` stays the plan
-- allowance only. Existing rows default to 0 — there is no way to
-- retroactively attribute an already-elevated balance to a past purchase,
-- so any wallet that already hit this bug keeps whatever balance it has now
-- and starts accruing correctly from here on.
ALTER TABLE "Wallet" ADD COLUMN "purchased" INTEGER NOT NULL DEFAULT 0;
