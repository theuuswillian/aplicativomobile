begin;

-- Preço de referência informado pelo usuário ou recebido de uma fonte licenciada.
-- NULL preserva a origem desconhecida de registros antigos.
alter table public.investment_assets
  add column price_source text
  check (price_source is null or price_source in ('manual', 'brapi.dev'));

comment on column public.investment_assets.price_source is
  'Origem do preço de referência; manual não alimenta o Radar.';

commit;
