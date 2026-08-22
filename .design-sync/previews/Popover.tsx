import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Separator,
} from "moldai-ui";

const sizes = ["PP", "P", "M", "G", "GG"];

// Mirrors components/editor/TabBar.tsx's SizeSelector: the base-size chip
// popover in the editor's tab bar.
export const SizeSelector = () => (
  <Popover open onOpenChange={() => {}}>
    <PopoverTrigger asChild>
      <Button variant="outline" size="chrome" className="text-muted-2">
        Tamanho M
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-[232px] p-2">
      <div className="flex gap-[5px] px-1 pb-2">
        {sizes.map((size) => (
          <Badge
            key={size}
            variant={size === "M" ? "accent" : "quiet"}
            size="chip"
          >
            {size}
          </Badge>
        ))}
      </div>
      <Separator />
      <div className="flex flex-col items-start gap-[5px] px-1 pt-2">
        <Badge variant="soon">em breve</Badge>
        <span className="text-muted text-meta leading-tight">
          Trocar o tamanho-base sem regerar
        </span>
      </div>
    </PopoverContent>
  </Popover>
);

// No real PopoverHeader/Title/Description usage exists in the app today
// (TabBar builds its own content instead) — this composes those sub-parts
// plausibly for the domain: an info popover explaining a size-chart
// substitution, reusing the real "sizeChartSubstituted" catalog copy from
// the ChatBubble/PatternData namespace.
export const SizeChartInfo = () => (
  <Popover open onOpenChange={() => {}}>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="chrome">
        Grade usada
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start">
      <PopoverHeader>
        <PopoverTitle>Grade usada</PopoverTitle>
        <PopoverDescription>
          Sua grade ativa (“Masculino adulto”) não serve para esta peça, então
          usei “Feminino adulto · ABNT”.
        </PopoverDescription>
      </PopoverHeader>
    </PopoverContent>
  </Popover>
);
