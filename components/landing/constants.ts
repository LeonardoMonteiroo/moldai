// The free tier's monthly credit allowance, as shown to a signed-out
// visitor. lib/billing/wallet.ts's seedWallet is the actual source of truth
// (balance/total both start at 30) but is owned by a concurrent work lane in
// this sweep, so the literal is duplicated here rather than hoisted into a
// shared export -- reconcile the two if that file's exports ever change.
export const FREE_PLAN_CREDITS = 30;
