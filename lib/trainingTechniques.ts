export type AdvancedTechniqueKey = 'drop-set' | 'rest-pause' | 'sst';

export const ADVANCED_TECHNIQUES: Record<AdvancedTechniqueKey, { label: string; instructions: string }> = {
  'drop-set': {
    label: 'Drop-set',
    instructions: `O Drop-set aumenta a fadiga ao levar o músculo à falha e reduzir a carga sucessivamente, sem descanso.

1º Série inicial: use uma carga que permita de 8 a 10 repetições até a falha concêntrica, sem conseguir completar outra repetição com boa técnica.

2º Redução: diminua imediatamente a carga em 20% a 30%, apenas com o tempo necessário para retirar anilhas ou mudar o pino.

3º Continuação: faça o máximo de repetições possíveis com a nova carga até falhar novamente.

4º Repetição opcional: reduza novamente entre 20% e 30% e repita até a falha. Somente então encerre a série.`,
  },
  'rest-pause': {
    label: 'Rest-Pause',
    instructions: `O Rest-Pause mantém a carga alta e usa pausas muito curtas para ampliar o número de repetições de qualidade.

1º Série inicial: escolha uma carga pesada que permita de 6 a 8 repetições até a falha técnica.

2º Pausa curta: apoie o peso com segurança e descanse de 10 a 15 segundos, fazendo de 5 a 6 respirações profundas.

3º Segunda etapa: com a mesma carga, faça quantas repetições conseguir, normalmente de 2 a 4.

4º Etapa final: descanse novamente de 10 a 15 segundos e, com a mesma carga, faça as últimas 1 ou 2 repetições possíveis. Esse conjunto forma um único bloco Rest-Pause.`,
  },
  sst: {
    label: 'SST',
    instructions: `O SST (Sarcoplasmic Stimulating Training) é uma técnica de altíssima intensidade, indicada no último exercício do músculo e preferencialmente em máquina ou cabo.

1º Série inicial: use uma carga para 8 a 10 repetições até a falha concêntrica.

2º Blocos curtos: descanse de 10 a 15 segundos e repita com a mesma carga até a falha. Continue até conseguir apenas 1 ou 2 repetições.

3º Primeira redução: diminua a carga em 20% e repita os blocos, sempre com 10 a 15 segundos de pausa, até voltar a atingir somente 1 ou 2 repetições.

4º Redução final: diminua mais 20% e repita uma última sequência até a falha técnica. Interrompa se perder a postura ou a amplitude segura.`,
  },
};

export function getAdvancedTechniqueInstructions(name?: string | null) {
  const normalized = String(name ?? '').trim().toLowerCase();
  const technique = Object.values(ADVANCED_TECHNIQUES).find(item => item.label.toLowerCase() === normalized);
  return technique?.instructions ?? '';
}
