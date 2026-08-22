import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Input,
} from "moldai-ui";

export const RenamePattern = () => (
  <Dialog open onOpenChange={() => {}}>
    <DialogContent>
      <form>
        <DialogHeader>
          <DialogTitle>Renomear molde</DialogTitle>
        </DialogHeader>
        <Field className="py-4">
          <FieldLabel htmlFor="rename-pattern">Novo nome do molde</FieldLabel>
          <Input id="rename-pattern" defaultValue="Blusa manga longa" />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline">
            Cancelar
          </Button>
          <Button type="submit">Salvar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
);

export const AddSize = () => (
  <Dialog open onOpenChange={() => {}}>
    <DialogContent>
      <form>
        <DialogHeader>
          <DialogTitle>Adicionar tamanho</DialogTitle>
          <DialogDescription>
            Escolha um novo tamanho para adicionar à grade.
          </DialogDescription>
        </DialogHeader>
        <Field className="py-4">
          <FieldLabel htmlFor="new-size">Nome do tamanho</FieldLabel>
          <Input id="new-size" placeholder="Ex.: XG" />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline">
            Cancelar
          </Button>
          <Button type="submit">Adicionar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
);
