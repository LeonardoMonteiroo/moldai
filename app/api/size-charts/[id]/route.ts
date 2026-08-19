import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { updateSizeChart, deleteSizeChart } from "@/lib/db/sizeChart";
import type { SizeChartData } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

function notFound(): NextResponse {
  return NextResponse.json(
    { status: "not_found", error: "Grade não encontrada." },
    { status: 404 },
  );
}

export async function PATCH(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  let body: Partial<SizeChartData>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Corpo inválido." },
      { status: 400 },
    );
  }
  const updated = await updateSizeChart(id, gate.id, body);
  if (!updated) return notFound();
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const ok = await deleteSizeChart(id, gate.id);
  if (!ok) return notFound();
  return NextResponse.json({ status: "ok" });
}
