// Isolated UI fixtures: no database writes or real payment requests.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const plano = { total_marmitas:14, entregas:2, marmitas_por_entrega:7, intervalo_dias:7, sabores_min:3, sabores_max:5, permite_voucher:true };
const kit = { id:999001, nome:'Plano Quinzenal', descricao:'14 marmitas em duas entregas semanais.', tipo_produto:'kit', plano_config:plano, preco:200, ativo:true, estoque:0, categoria:'Marmitas', imagem_url:'/icon-512x512.png' };
const sabores = ['Frango com arroz integral','Patinho com legumes','Estrogonofe Fit','Frango com batata doce','Carne com mandioca','Peixe com arroz'].map((nome,i)=>({id:i+1,nome,preco:25,ativo:true,disponivel_kit:true,tipo_produto:'avulso',categoria:'Marmitas',imagem_url:'/icon-192x192.png'}));
(async () => {
  const browser = await chromium.launch({ headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || undefined });
  try {
    for (const width of [390,1440]) {
      const page = await browser.newPage({ viewport:{width,height:900} });
      const errors=[]; page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*.supabase.co/**', async route => {
        const req=route.request(),url=new URL(req.url());
        if(req.method()!=='GET'&&req.method()!=='OPTIONS') return route.abort();
        let rows=[];
        if(url.pathname.endsWith('/produtos')) rows=url.searchParams.has('id')?[kit]:sabores;
        if(url.pathname.endsWith('/app_config')) rows=[{valor:url.searchParams.get('chave')==='eq.planos_config'?{dias:[1,2,3,4,5,6],antecedencia_dias:1,bandeiras:{Alelo:true}}:{data_liberacao_vendas:'2020-01-01T00:00:00-03:00',meios_pagamento:{pix:true,mercado_pago:true,cielo:false}}}];
        const object=(req.headers().accept||'').includes('vnd.pgrst.object');
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(object?rows[0]||{}:rows)});
      });
      await page.goto('http://localhost:3000/produto/999001');
      await page.getByRole('heading',{name:'Escolha de 3 a 5 sabores'}).waitFor();
      const add=page.getByRole('button',{name:'Adicionar Plano ao Carrinho'});
      assert.equal(await add.isDisabled(),true);
      for(let i=0;i<3;i++) await page.getByRole('checkbox',{name:'Selecionar '+sabores[i].nome,exact:true}).check();
      const quantities=page.getByRole('spinbutton');
      assert.deepEqual(await quantities.evaluateAll(nodes=>nodes.map(n=>Number(n.value))),[5,5,4]);
      await quantities.nth(0).fill('6'); assert.equal(await add.isDisabled(),true);
      await quantities.nth(1).fill('4');
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+2); if(tomorrow.getDay()===0)tomorrow.setDate(tomorrow.getDate()+1);
      const date=tomorrow.toISOString().slice(0,10);
      await page.getByLabel('Primeira entrega', {exact:true}).fill(date);
      assert.equal(await add.isEnabled(),true);
      for(let i=3;i<5;i++)await page.getByRole('checkbox',{name:'Selecionar '+sabores[i].nome,exact:true}).check();
      await page.getByRole('checkbox',{name:'Selecionar '+sabores[5].nome,exact:true}).click();
      assert.equal(await page.getByRole('checkbox',{checked:true}).count(),5);
      assert.ok(await page.getByText('Limite de 5 sabores. Desmarque um para trocar.').isVisible());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow horizontal');
      await page.screenshot({path:path.join(os.tmpdir(),'viva-leve-kit-'+width+'.png'),fullPage:true});
      assert.deepEqual(errors,[]);
      await page.close(); console.log('PASS UI '+width+'px: distribuicao, limites, ajuste manual, data, CTA e responsividade');
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
