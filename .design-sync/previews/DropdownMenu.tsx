import { ChevronDownIcon, MoreHorizontalIcon } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "moldai-ui";

// Mirrors components/dashboard/PatternCard.tsx's "⋯" card menu.
export const PatternMenu = () => (
  <DropdownMenu open onOpenChange={() => {}}>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon-sm" aria-label="Mais opções">
        <MoreHorizontalIcon />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-[150px]">
      <DropdownMenuGroup>
        <DropdownMenuItem>Renomear</DropdownMenuItem>
        <DropdownMenuItem variant="destructive">Excluir</DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

// Mirrors components/shared/PageHeader.tsx's avatar dropdown, present on
// every full-page screen.
export const AccountMenu = () => (
  <DropdownMenu open onOpenChange={() => {}}>
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="chrome"
        aria-label="Conta"
        className="gap-1.5 px-1"
      >
        <Avatar
          title="ana@atelie.com"
          className="border-olive-border size-[30px] border"
        >
          <AvatarFallback className="bg-olive-tint text-olive text-ui font-semibold">
            AN
          </AvatarFallback>
        </Avatar>
        <ChevronDownIcon data-icon="inline-end" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-[190px]">
      <DropdownMenuLabel className="text-muted text-meta truncate font-normal">
        ana@atelie.com
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem>Créditos e uso</DropdownMenuItem>
        <DropdownMenuItem>Plano e cobrança</DropdownMenuItem>
        <DropdownMenuItem>Preferências</DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem>Sair</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

// Mirrors components/editor/Footer.tsx's "Exportar" menu — item rows that
// carry a secondary note line, plus a trailing DropdownMenuLabel used as a
// non-interactive footnote rather than a group heading.
export const ExportMenu = () => (
  <DropdownMenu open onOpenChange={() => {}}>
    <DropdownMenuTrigger asChild>
      <Button variant="outline">Exportar</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-[230px]">
      <DropdownMenuGroup>
        <DropdownMenuItem className="flex-col items-start gap-0">
          <span className="text-ui">SVG · 1:1 (plotter)</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex-col items-start gap-0">
          <span className="text-ui">DXF · Audaces/AAMA-ASTM · beta</span>
          <span className="text-muted text-meta leading-snug">
            Camadas numeradas D6673. Ainda sem piques/furos/linha de costura.
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex-col items-start gap-0">
          <span className="text-ui">PDF · A4 (colar em casa)</span>
          <span className="text-muted text-meta">~3 folhas A4</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-muted text-tick leading-snug font-normal">
        Linha líquida — sem margem de costura embutida.
      </DropdownMenuLabel>
    </DropdownMenuContent>
  </DropdownMenu>
);
