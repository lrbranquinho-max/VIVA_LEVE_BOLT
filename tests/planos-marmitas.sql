-- Integration checks against the real schema. All business data is rolled back.
begin;
do $$
declare
  cliente uuid; admin_id uuid; courier uuid; outro uuid;
  email_cliente text; email_admin text; email_courier text;
  sabores bigint[]:='{}'; kit bigint; kit24 bigint; avulso bigint;
  carrinho jsonb; payload jsonb; result jsonb; pedido bigint; plano uuid; primeira bigint; segunda bigint;
  idempotencia uuid:=gen_random_uuid(); primeira_data date; codigo text; falhou boolean; d record; cfg jsonb;
begin
  -- A nested subtransaction guarantees rollback even if the outer ROLLBACK is omitted.
  begin
  -- Synthetic accounts only: never use or overwrite an existing customer's profile.
  admin_id:=gen_random_uuid(); cliente:=gen_random_uuid(); courier:=gen_random_uuid();
  email_admin:=admin_id::text||'@example.invalid'; email_cliente:=cliente::text||'@example.invalid'; email_courier:=courier::text||'@example.invalid';
  insert into auth.users(id,email) values(admin_id,email_admin),(cliente,email_cliente),(courier,email_courier);
  insert into public.admin_usuario_roles(email,role,nome,ativo,user_id) values(email_admin,'admin','Admin QA',true,admin_id);
  outro:=admin_id;
  insert into public.admin_usuario_roles(email,role,nome,ativo,user_id)
  values(email_courier,'delivery','Entregador QA',true,courier)
  on conflict(email,role) do update set ativo=true,user_id=excluded.user_id;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',cliente,'email',email_cliente,'role','authenticated')::text,true);
  insert into public.perfis_clientes(id,nome_completo,telefone,endereco_rua,endereco_numero,bairro,regiao_df)
  values(cliente,'Cliente QA','61999999999','Rua QA','1','Centro',(select regiao from public.regioes_atendimento where status='ativa' limit 1))
  on conflict(id) do update set nome_completo=excluded.nome_completo,telefone=excluded.telefone,endereco_rua=excluded.endereco_rua,endereco_numero=excluded.endereco_numero,bairro=excluded.bairro,regiao_df=excluded.regiao_df;
  update public.app_config set valor=valor||'{"data_liberacao_vendas":"2020-01-01T00:00:00-03:00","cupom_dia_d_ativo":false,"meios_pagamento":{"pix":true,"mercado_pago":true,"cielo":true}}' where chave='loja_config';
  update public.app_config set valor='{"dias":[1,2,3,4,5,6],"antecedencia_dias":1,"bandeiras":{"Alelo":true,"VR":true,"Ticket":true,"Pluxee":true}}' where chave='planos_config';
  for n in 1..6 loop
    insert into public.produtos(nome,preco,categoria,ativo,estoque,disponivel_kit) values('Sabor QA '||n,20,'Marmitas',true,100,true) returning id into avulso;
    sabores:=array_append(sabores,avulso);
  end loop;
  cfg:='{"total_marmitas":14,"entregas":2,"marmitas_por_entrega":7,"intervalo_dias":7,"sabores_min":3,"sabores_max":5,"permite_voucher":true}';
  insert into public.produtos(nome,preco,categoria,ativo,tipo_produto,plano_config) values('Kit QA',200,'Marmitas',true,'kit',cfg) returning id into kit;
  insert into public.produtos(nome,preco,categoria,ativo,tipo_produto,plano_config) values('Kit24 QA',299,'Marmitas',true,'kit',cfg||'{"total_marmitas":24,"entregas":4,"marmitas_por_entrega":6}') returning id into kit24;
  primeira_data:=(now() at time zone 'America/Sao_Paulo')::date+2;
  if extract(dow from primeira_data)=0 then primeira_data:=primeira_data+1; end if;
  carrinho:=jsonb_build_array(jsonb_build_object('id',kit,'quantidade',1,'preco',0.01,'plano',jsonb_build_object('primeira_data',primeira_data,'sabores',jsonb_build_array(
    jsonb_build_object('id',sabores[1],'quantidade',5),jsonb_build_object('id',sabores[2],'quantidade',5),jsonb_build_object('id',sabores[3],'quantidade',4)))));

  payload:=jsonb_set(carrinho,'{0,plano,sabores}',jsonb_build_array(jsonb_build_object('id',sabores[1],'quantidade',7),jsonb_build_object('id',sabores[2],'quantidade',7)));
  falhou:=false; begin perform public.criar_pedido_com_planos(payload,'pix',null,null,gen_random_uuid()); exception when others then falhou:=true; end;
  if not falhou then raise exception 'FAIL menos de 3 sabores'; end if;
  payload:=jsonb_set(carrinho,'{0,plano,sabores}',(select jsonb_agg(jsonb_build_object('id',s,'quantidade',case when ord<=2 then 3 else 2 end)) from unnest(sabores) with ordinality t(s,ord)));
  falhou:=false; begin perform public.criar_pedido_com_planos(payload,'pix',null,null,gen_random_uuid()); exception when others then falhou:=true; end;
  if not falhou then raise exception 'FAIL mais de 5 sabores'; end if;
  payload:=jsonb_set(carrinho,'{0,plano,sabores,0,quantidade}','6');
  falhou:=false; begin perform public.criar_pedido_com_planos(payload,'pix',null,null,gen_random_uuid()); exception when others then falhou:=true; end;
  if not falhou then raise exception 'FAIL total incorreto'; end if;
  update public.produtos set disponivel_kit=false where id=sabores[1];
  falhou:=false; begin perform public.criar_pedido_com_planos(carrinho,'pix',null,null,gen_random_uuid()); exception when others then falhou:=true; end;
  if not falhou then raise exception 'FAIL sabor inelegivel'; end if;
  update public.produtos set disponivel_kit=true where id=sabores[1];
  payload:=jsonb_set(carrinho,'{0,plano,primeira_data}',to_jsonb((primeira_data+(7-extract(dow from primeira_data)::int))::text));
  falhou:=false; begin perform public.criar_pedido_com_planos(payload,'pix',null,null,gen_random_uuid()); exception when others then falhou:=true; end;
  if not falhou then raise exception 'FAIL domingo'; end if;
  update public.produtos set plano_config=plano_config||'{"permite_voucher":false}' where id=kit;
  falhou:=false; begin perform public.criar_pedido_com_planos(carrinho,'voucher_presencial','Alelo',null,gen_random_uuid()); exception when others then falhou:=true; end;
  if not falhou then raise exception 'FAIL voucher nao permitido'; end if;
  update public.produtos set plano_config=plano_config||'{"permite_voucher":true}' where id=kit;

  result:=public.criar_pedido_com_planos(carrinho,'voucher_presencial','Alelo',null,idempotencia);
  pedido:=(result->>'id')::bigint;
  if (result->>'valor_total')::numeric<>200 then raise exception 'FAIL preco manipulado'; end if;
  if (public.criar_pedido_com_planos(carrinho,'voucher_presencial','Alelo',null,idempotencia)->>'id')::bigint<>pedido then raise exception 'FAIL idempotencia'; end if;
  select id into strict plano from public.planos_marmitas where pedido_id=pedido;
  select id into strict primeira from public.pedidos where plano_id=plano and entrega_numero=1;
  select id into strict segunda from public.pedidos where plano_id=plano and entrega_numero=2;
  if (select count(*) from public.pedidos where plano_id=plano)<>2 or (select entrega_prevista from public.pedidos where id=segunda)<>primeira_data+7 then raise exception 'FAIL agenda'; end if;
  if exists(select 1 from public.pedidos where plano_id=plano and (valor_total<>0 or pagamento_status<>'vinculado')) then raise exception 'FAIL cobrancas filhas'; end if;
  if exists(select 1 from public.produtos where id=any(sabores) and estoque<>100) then raise exception 'FAIL baixa antecipada'; end if;
  if (select saldo from public.planos_marmitas_resumo where id=plano)<>14 then raise exception 'FAIL saldo inicial'; end if;
  falhou:=false; begin perform public.aplicar_credito_pedido(pedido::text,'QA',cliente,email_cliente); exception when others then falhou:=sqlerrm like 'Voucher presencial%'; end;
  if not falhou then raise exception 'FAIL combinacao voucher credito'; end if;
  falhou:=false; begin update public.produtos set tipo_produto='kit',plano_config=cfg where id=sabores[1]; exception when others then falhou:=true; end;
  if not falhou then raise exception 'FAIL alteracao tipo vendido'; end if;
  execute 'set local role authenticated';
  if (select count(*) from public.planos_marmitas_resumo where id=plano)<>1 then raise exception 'FAIL RLS cliente nao visualiza plano'; end if;
  falhou:=false;
  begin insert into public.pedidos(cliente_id,itens,valor_total) values(cliente,jsonb_build_array(jsonb_build_object('id',kit,'quantidade',1)),1);
  exception when others then falhou:=true; end;
  if not falhou then raise exception 'FAIL bypass REST kit'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',courier,'email',email_courier,'role','authenticated')::text,true);
  if exists(select 1 from public.planos_marmitas_resumo where id=plano) or exists(select 1 from public.pedidos where id=pedido) then raise exception 'FAIL RLS exposicao'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',cliente,'email',email_cliente,'role','authenticated')::text,true);
  if exists(select 1 from public.pedidos where id=pedido and pago_em is not null) then raise exception 'FAIL receita pendente'; end if;
  falhou:=false; begin update public.pedidos set status='Em Preparo' where id=segunda; exception when others then falhou:=true; end;
  if not falhou then raise exception 'FAIL segunda semana sem pagamento'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'email',email_admin,'role','authenticated')::text,true);
  perform public.gerenciar_plano_marmitas(plano,'preparar',primeira);
  if (select sum(100-estoque) from public.produtos where id=any(sabores))<>7 then raise exception 'FAIL baixa preparo'; end if;
  perform public.gerenciar_plano_marmitas(plano,'pronta',primeira);
  if (select sum(100-estoque) from public.produtos where id=any(sabores))<>7 then raise exception 'FAIL baixa duplicada'; end if;
  perform public.atribuir_entregador_pedido(primeira,courier);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',courier,'email',email_courier,'role','authenticated')::text,true);
  perform public.iniciar_entrega_pedido(primeira);
  if not exists(select 1 from jsonb_array_elements(public.listar_minhas_entregas()) e where (e->>'id')::bigint=primeira and (e->>'valor_cobrar')::numeric=200) then raise exception 'FAIL entregador cobranca'; end if;
  perform public.registrar_voucher_plano(primeira,false,'QA recusada');
  if (select pagamento_status from public.pedidos where id=pedido)='approved' then raise exception 'FAIL recusa contabilizada'; end if;
  perform public.registrar_voucher_plano(primeira,true,'QA comprovante');
  if not exists(select 1 from public.planos_marmitas where id=plano and status='Ativo') or not exists(select 1 from public.pedidos where id=pedido and pago_em is not null) then raise exception 'FAIL pagamento voucher'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',cliente,'email',email_cliente,'role','authenticated')::text,true);
  codigo:=public.obter_codigo_entrega_cliente(primeira);
  if length(codigo)<>6 then raise exception 'FAIL codigo'; end if;
  result:=public.confirmar_entrega_pelo_cliente(primeira);
  if not (result->>'ok')::boolean or (select saldo from public.planos_marmitas_resumo where id=plano)<>7 then raise exception 'FAIL saldo entrega'; end if;
  if (public.confirmar_entrega_pelo_cliente(primeira)->>'ok')::boolean then raise exception 'FAIL entrega duplicada'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'email',email_admin,'role','authenticated')::text,true);
  perform public.gerenciar_plano_marmitas(plano,'reprogramar',segunda,primeira_data+8,'QA nova data');
  if (select entrega_prevista from public.pedidos where id=primeira)<>primeira_data then raise exception 'FAIL reprogramacao alterou outra semana'; end if;
  perform public.gerenciar_plano_marmitas(plano,'preparar',segunda);
  perform public.atribuir_entregador_pedido(segunda,courier);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',courier,'email',email_courier,'role','authenticated')::text,true);
  perform public.iniciar_entrega_pedido(segunda);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',cliente,'email',email_cliente,'role','authenticated')::text,true);
  codigo:=public.obter_codigo_entrega_cliente(segunda);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',courier,'email',email_courier,'role','authenticated')::text,true);
  if (public.confirmar_entrega_por_codigo(segunda,case when codigo='999999' then '888888' else '999999' end)->>'ok')::boolean then raise exception 'FAIL codigo incorreto'; end if;
  if not (public.confirmar_entrega_por_codigo(segunda,codigo)->>'ok')::boolean then raise exception 'FAIL codigo correto'; end if;
  if (public.confirmar_entrega_por_codigo(segunda,codigo)->>'ok')::boolean then raise exception 'FAIL codigo reutilizado'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',cliente,'email',email_cliente,'role','authenticated')::text,true);
  if not exists(select 1 from public.planos_marmitas_resumo where id=plano and saldo=0 and entregues=14 and status='Concluído') then raise exception 'FAIL conclusao'; end if;
  if (select count(*) from public.planos_marmitas_historico where plano_id=plano)<8 then raise exception 'FAIL auditoria'; end if;

  payload:=jsonb_set(jsonb_set(carrinho,'{0,id}',to_jsonb(kit24)),'{0,plano,sabores}',jsonb_build_array(jsonb_build_object('id',sabores[1],'quantidade',8),jsonb_build_object('id',sabores[2],'quantidade',8),jsonb_build_object('id',sabores[3],'quantidade',8)));
  result:=public.criar_pedido_com_planos(payload,'pix',null,null,gen_random_uuid());
  pedido:=(result->>'id')::bigint;
  if (select count(*) from public.pedidos where pedido_origem_id=pedido)<>4 then raise exception 'FAIL mensal'; end if;
  perform public.processar_pagamento_pedido_mp(pedido::text,'QA-rollback','approved','Em Preparo');
  if (select sum(100-estoque) from public.produtos where id=any(sabores))<>14 then raise exception 'FAIL gateway debitou semanas futuras'; end if;
  if not exists(select 1 from public.planos_marmitas where pedido_id=pedido and status='Ativo') then raise exception 'FAIL pagamento online'; end if;
  if has_table_privilege('authenticated','public.planos_marmitas','UPDATE') or has_table_privilege('anon','public.planos_marmitas','SELECT') then raise exception 'FAIL permissoes'; end if;
  -- A free mixed order consumes ordinary stock once, but never future kit stock.
  update public.app_config set valor=valor||'{"cupom_dia_d_ativo":true,"cupom_dia_d_percentual":100}' where chave='loja_config';
  payload:=carrinho||jsonb_build_array(jsonb_build_object('id',sabores[6],'quantidade',2));
  idempotencia:=gen_random_uuid();
  result:=public.criar_pedido_com_planos(payload,'credito',null,null,idempotencia);
  if (result->>'valor_total')::numeric<>0 or (select estoque from public.produtos where id=sabores[6])<>98 then raise exception 'FAIL estoque pedido isento'; end if;
  perform public.criar_pedido_com_planos(payload,'credito',null,null,idempotencia);
  if (select estoque from public.produtos where id=sabores[6])<>98 then raise exception 'FAIL estoque isento duplicado'; end if;
  raise exception using errcode='PZ001',message='QA_ROLLBACK';
  exception when sqlstate 'PZ001' then null;
  end;
end $$;
rollback;
select 'PASS: kits 14/24, sabores, totais, agenda, preco servidor, idempotencia, voucher, estoque por entrega, saldo, auditoria e pagamento online. Dados revertidos.' as resultado;
