"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  formatarDataLiberacaoCurta,
  resolverDataLiberacaoVendas,
  StoreLaunchConfig,
  vendasDaLojaLiberadas,
} from '../lib/storeLaunch';

export function useStoreLaunch(config?: StoreLaunchConfig | null) {
  const dataLiberacao = resolverDataLiberacaoVendas(config);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const restante = Date.parse(dataLiberacao) - Date.now();
    if (restante <= 0) return;

    const timeout = window.setTimeout(
      () => setAgora(Date.now()),
      Math.min(restante + 1000, 2_147_483_647),
    );
    return () => window.clearTimeout(timeout);
  }, [agora, dataLiberacao]);

  return useMemo(() => ({
    vendasLiberadas: vendasDaLojaLiberadas({ data_liberacao_vendas: dataLiberacao }, agora),
    dataLiberacao,
    dataLiberacaoCurta: formatarDataLiberacaoCurta({ data_liberacao_vendas: dataLiberacao }),
  }), [agora, dataLiberacao]);
}
