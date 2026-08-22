import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  Input,
} from "moldai-ui";

export const RenamePattern = () => (
  <div style={{ maxWidth: 360, padding: 24 }}>
    {/* Mirrors components/dashboard/PatternCard.tsx's rename dialog. */}
    <Field>
      <FieldLabel htmlFor="field-rename">Novo nome do molde</FieldLabel>
      <Input
        id="field-rename"
        defaultValue="Blusa manga longa"
        maxLength={80}
      />
    </Field>
  </div>
);

export const ProfileForm = () => (
  <div style={{ maxWidth: 420, padding: 24 }}>
    {/* Mirrors components/settings/ProfileSection.tsx: name editable,
        email read-only with an explanatory FieldDescription. */}
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="field-name">Nome</FieldLabel>
        <Input id="field-name" defaultValue="Ana Silva" />
      </Field>
      <Field data-disabled>
        <FieldLabel htmlFor="field-email">E-mail</FieldLabel>
        <Input id="field-email" defaultValue="ana.silva@email.com" disabled />
        <FieldDescription>
          O e-mail é o identificador de login e não pode ser alterado.
        </FieldDescription>
      </Field>
    </FieldGroup>
  </div>
);

export const PasswordChange = () => (
  <div style={{ maxWidth: 420, padding: 24 }}>
    {/* Mirrors components/settings/PasswordSection.tsx: the confirm field
        carries its own mismatch error instead of a floating form-level one. */}
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="field-password-current">Senha atual</FieldLabel>
        <Input
          id="field-password-current"
          type="password"
          defaultValue="********"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="field-password-new">Nova senha</FieldLabel>
        <Input
          id="field-password-new"
          type="password"
          defaultValue="abc12345"
        />
      </Field>
      <Field data-invalid>
        <FieldLabel htmlFor="field-password-confirm">
          Confirmar nova senha
        </FieldLabel>
        <Input
          id="field-password-confirm"
          type="password"
          defaultValue="abc12346"
          aria-invalid
        />
        <FieldError>As senhas não coincidem.</FieldError>
      </Field>
    </FieldGroup>
  </div>
);
