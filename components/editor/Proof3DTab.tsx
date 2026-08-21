import { Rotate3dIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function Proof3DTab() {
  const t = useTranslations("Proof3DTab");
  return (
    <Empty>
      <EmptyHeader>
        {/* The mark was a ◍ glyph sized at 28px — a decoration priced on the
            type scale. As an icon it is sized like one, and says what the tab
            would do. */}
        <EmptyMedia variant="icon" aria-hidden="true">
          <Rotate3dIcon />
        </EmptyMedia>
        <EmptyTitle className="text-control font-semibold">
          {t("title")}
        </EmptyTitle>
        <EmptyDescription className="max-w-[280px]">
          {t("description")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
