import { CompanySettings } from './company';

export function companyToFiscalIssuer(company: CompanySettings) {
  return {
    empresaId: company.id,
    cnpj: company.cnpj,
    razaoSocial: company.razao_social,
    inscricaoEstadual: company.inscricao_estadual,
    inscricaoMunicipal: company.inscricao_municipal,
    regimeTributario: company.regime_tributario,
    endereco: { logradouro: company.endereco, numero: company.numero, complemento: company.complemento,
      bairro: company.bairro, cep: company.cep, municipio: company.cidade, codigoMunicipioIbge: company.codigo_municipio_ibge,
      uf: company.uf, pais: company.pais },
  };
}
