import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "moldai-ui";

// Mirrors components/shared/ConfirmModal.tsx exactly, as used from the
// dashboard's pattern-card "⋯" menu (components/dashboard/PatternCard.tsx).
export const DeletePattern = () => (
  <AlertDialog open onOpenChange={() => {}}>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Excluir este molde?</AlertDialogTitle>
        <AlertDialogDescription>
          Isso apaga o molde e toda a conversa, e não pode ser desfeito.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel size="sm">Cancelar</AlertDialogCancel>
        <AlertDialogAction size="sm" variant="destructiveOutline">
          Excluir
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

// Same ConfirmModal shape, real copy from the SizeChartTable catalog
// namespace (messages/pt-BR.json) for a second destructive-confirm domain.
export const DeleteSizeChart = () => (
  <AlertDialog open onOpenChange={() => {}}>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Excluir esta grade?</AlertDialogTitle>
        <AlertDialogDescription>
          Isso apaga a grade e não pode ser desfeito.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel size="sm">Cancelar</AlertDialogCancel>
        <AlertDialogAction size="sm" variant="destructiveOutline">
          Excluir
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
