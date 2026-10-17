-- Starter categories of either kind no longer share a name. Spaces that already have them keep
-- theirs: once a space has its categories, they are its members' names.
update public.starter_category_names as names
set name = renamed.name
from (values
  (11, 'en', 'Gifts given'), (11, 'es-419', 'Regalos dados'), (11, 'pt-BR', 'Presentes dados'),
  (12, 'en', 'Other expenses'), (12, 'es-419', 'Otros gastos'), (12, 'pt-BR', 'Outras despesas'),
  (14, 'en', 'Gifts received'), (14, 'es-419', 'Regalos recibidos'), (14, 'pt-BR', 'Presentes recebidos'),
  (16, 'en', 'Other income'), (16, 'es-419', 'Otros ingresos'), (16, 'pt-BR', 'Outras receitas')
) as renamed (starter_category_id, language, name)
where names.starter_category_id = renamed.starter_category_id
  and names.language = renamed.language::public.language;
