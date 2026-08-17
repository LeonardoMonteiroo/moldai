-- Reset dos moldes: o EditorState persistido mudou de shape (chaves PT→EN)
-- no rename total. Moldes antigos não desserializam no código novo.
-- Dado dev/pré-produção — reset é aceitável (decisão registrada no spec).
DELETE FROM "Molde";