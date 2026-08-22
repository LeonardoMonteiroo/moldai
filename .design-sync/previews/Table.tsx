import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "moldai-ui";

const detailRows = [
  { label: "Dimensões (larg × alt)", value: "46 × 62 cm" },
  { label: "Largura do busto", value: "92 cm" },
  { label: "Comprimento da manga", value: "58 cm" },
  { label: "Cava", value: "21 cm" },
];

export const PieceDetails = () => (
  <div
    style={{
      maxWidth: 360,
      borderRadius: 10,
      border: "1px solid #ded9cc",
      overflow: "hidden",
    }}
  >
    <Table>
      <TableBody>
        {detailRows.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="text-muted w-1/2 px-3 py-[7px] whitespace-normal">
              {row.label}
            </TableCell>
            <TableCell className="px-3 py-[7px] font-medium">
              {row.value}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

const ledger = [
  { date: "20/08/2026", type: "Geração de molde", credits: "−4" },
  { date: "18/08/2026", type: "Graduação de tamanhos", credits: "−6" },
  { date: "15/08/2026", type: "Compra de créditos avulsos", credits: "+100" },
  { date: "01/08/2026", type: "Renovação mensal", credits: "+30" },
];

export const UsageHistory = () => (
  <div style={{ maxWidth: 420 }}>
    <Table>
      <TableCaption>Histórico de uso dos últimos 30 dias</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Ação</TableHead>
          <TableHead className="text-right">Créditos</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ledger.map((row) => (
          <TableRow key={row.date + row.type}>
            <TableCell className="text-muted">{row.date}</TableCell>
            <TableCell>{row.type}</TableCell>
            <TableCell className="text-right font-medium">
              {row.credits}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
