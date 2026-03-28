/**
 * seed-descuentos.js
 * Carga descuentos, flete, plazo, soporte IVA y condiciones de tiendas nuevas.
 * Ejecutar en el servidor después de cada actualización:
 *   node C:\makabot\seed-descuentos.js
 */
const db = require('better-sqlite3')('C:/makabot/makabot.db');

// Datos completos por proveedor (búsqueda parcial por nombre, case-insensitive)
// pct: descuento como decimal (0.10 = 10%)
// flete: condición de flete negociada
// plazo: días de plazo estándar
// tiendas_nuevas: condiciones para tiendas nuevas
// soporte_iva: soporte de IVA acordado
// net_iva: porcentaje net IVA
const proveedoresData = [
  { nombre: 'AMARA',                       pct: 0.05, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: null,                    net_iva: null  },
  { nombre: 'ANYLADY',                     pct: 0.10, flete: '100% POR 1 MILLON',            plazo: 60, tiendas_nuevas: '90 dias con 10% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'IVA facturado al 33%',  net_iva: 2.5   },
  { nombre: 'OVIDIO DE JESUS SERNA',       pct: 0.10, flete: '100% POR 1 MILLON',            plazo: 60, tiendas_nuevas: '90 dias con 10% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'IVA facturado al 33%',  net_iva: 2.5   },
  { nombre: 'APOLO',                       pct: 0.06, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'AR ACCESORIOS',              pct: 0.05, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 5% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 50%',  net_iva: 2.5   },
  { nombre: 'AVENTURINA',                  pct: 0.08, flete: 'PENDIENTE',                    plazo: 60, tiendas_nuevas: '60 dias con 6% para las nuevas tiendas La 30 y Plaza del Sol',                                              soporte_iva: 'A PEDIDO',              net_iva: null  },
  { nombre: 'AYI',                         pct: 0.06, flete: null,                           plazo: 70, tiendas_nuevas: '70 dias con 6% para las nuevas tiendas La 30 y Plaza del Sol, Centro Quilla',                               soporte_iva: 'PENDIENTE',             net_iva: null  },
  { nombre: 'AYJ',                         pct: 0.06, flete: null,                           plazo: 70, tiendas_nuevas: '70 dias con 6% para las nuevas tiendas La 30 y Plaza del Sol, Centro Quilla',                               soporte_iva: 'PENDIENTE',             net_iva: null  },
  { nombre: 'BOLSOS Y GLAMOUR',            pct: 0.06, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'BON BON',                     pct: 0.06, flete: 'Flete pago arriba de 1 millon',plazo: 45, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 30%',  net_iva: null  },
  { nombre: 'BUSMAR',                      pct: 0.06, flete: '100%',                        plazo: 45, tiendas_nuevas: '80 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 50%',  net_iva: 2.5   },
  { nombre: 'CAPRICHOS',                   pct: 0.10, flete: '100%',                        plazo: 45, tiendas_nuevas: '60 dias sin descuento',                                                                                      soporte_iva: 'IVA facturado al 40%',  net_iva: null  },
  { nombre: 'CASA HOGAR',                  pct: 0.15, flete: '2 M cubren flete',             plazo: 60, tiendas_nuevas: '90 dias con 15% para las nuevas tiendas. La 93, La 30, Alegra, Plaza del Sol y Centro Quilla',               soporte_iva: 'IVA facturado al 40%',  net_iva: null  },
  { nombre: 'CHANGUITO',                   pct: 0.05, flete: '0%',                          plazo: 60, tiendas_nuevas: 'No cubrimos fletes ya que damos el descuento mencionado anteriormente',                                      soporte_iva: null,                    net_iva: null  },
  { nombre: 'COCONUT',                     pct: 0.07, flete: '50%',                         plazo: 45, tiendas_nuevas: '10% a 15 dias',                                                                                               soporte_iva: null,                    net_iva: null  },
  { nombre: 'COLORFRESH',                  pct: 0.06, flete: '0%',                          plazo: 45, tiendas_nuevas: '45 dias',                                                                                                     soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'COLOR FRESH',                 pct: 0.06, flete: '0%',                          plazo: 45, tiendas_nuevas: '45 dias',                                                                                                     soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'COSMOS',                      pct: 0.06, flete: '50%',                         plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'DAY COLOR',                   pct: 0.06, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: null,                    net_iva: null  },
  { nombre: 'DEUS',                        pct: 0.05, flete: 'FLETE 50% Y 50%',             plazo: 45, tiendas_nuevas: '60 dias con 5% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'DISTRIBUCIONES LOVER',        pct: 0.10, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'DISTRIBUCIONES MALU',         pct: 0.06, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 40%',  net_iva: null  },
  { nombre: 'DISTRIBUIDORA ISYA',          pct: 0.06, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 40%',  net_iva: null  },
  { nombre: 'DISTRIBUIDORA SM',            pct: 0.05, flete: '100%',                        plazo: 45, tiendas_nuevas: null,                                                                                                          soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'DIVINA FANTASY',              pct: 0.06, flete: '50%',                         plazo: 30, tiendas_nuevas: null,                                                                                                          soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'DUBAI',                       pct: 0.06, flete: '1 millon 100%',               plazo: 45, tiendas_nuevas: '70 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 35%',  net_iva: null  },
  { nombre: 'DISTRIBUIDOR DE LA BELLEZA',  pct: 0.10, flete: '1 millon 100%',               plazo: 60, tiendas_nuevas: '90 dias con 5% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 30%',  net_iva: null  },
  { nombre: 'ELAYA',                       pct: 0.05, flete: '100%',                        plazo: 45, tiendas_nuevas: '60 dias con 5% para las nuevas tiendas La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 70%',  net_iva: null  },
  { nombre: 'EL MUNDO DE LAS GAFAS',       pct: 0.05, flete: '30% POR 1 MILLON',            plazo: 40, tiendas_nuevas: '45 dias con 5% para las nuevas tiendas La 30 y Plaza del Sol',                                              soporte_iva: null,                    net_iva: null  },
  { nombre: 'ENGOL',                       pct: 0.06, flete: '50% Sta Mta y Otras Ciudades', plazo: 60, tiendas_nuevas: '60 dias con 6% para las nuevas tiendas La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'ESENCIAS Y FRAGANCIAS',       pct: 0.06, flete: '1200 FLETE PAGO',             plazo: 45, tiendas_nuevas: '60 dias con 6% para las nuevas tiendas La 30 y Plaza del Sol',                                              soporte_iva: null,                    net_iva: null  },
  { nombre: 'FANTASIA LA PERLA',           pct: 0.06, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 40%',  net_iva: null  },
  { nombre: 'FANTASIA ZHAARA',             pct: 0.05, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 5% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: null,                    net_iva: null  },
  { nombre: 'FANTASIA ZAHARA',             pct: 0.05, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 5% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: null,                    net_iva: null  },
  { nombre: 'SHARA IMPORT',                pct: 0.05, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 5% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: null,                    net_iva: null  },
  { nombre: 'FANTASY DELUXE',              pct: 0.05, flete: 'Flete 1 millon 100%',         plazo: 45, tiendas_nuevas: '60 dias con 5% para las nuevas tiendas La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 50%',  net_iva: 2.5   },
  { nombre: 'SKY BLUE',                    pct: 0.06, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 30%',  net_iva: null  },
  { nombre: 'SKYBLUE',                     pct: 0.06, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 30%',  net_iva: null  },
  { nombre: 'GRUPO TAHINO',                pct: 0.10, flete: 'Flete 2 millon 100%',         plazo: 45, tiendas_nuevas: '60 dias con 10% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'IVA facturado al 40%',  net_iva: null  },
  { nombre: 'HIPERBOLSO',                  pct: 0.05, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 5% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 45%',  net_iva: null  },
  { nombre: 'IMPORTACIONES RAGA',          pct: 0.06, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'PENDIENTE',             net_iva: null  },
  { nombre: 'IMPORTADORA RAGA',            pct: 0.06, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'PENDIENTE',             net_iva: null  },
  { nombre: 'IMPORTACIONES WG',            pct: 0.10, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 10% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'IVA facturado al 40%',  net_iva: null  },
  { nombre: 'MONARQUIA',                   pct: 0.12, flete: '100% POR 1 MILLON',           plazo: 60, tiendas_nuevas: '60 dias con 12% para las nuevas tiendas La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 33%',  net_iva: 2.5   },
  { nombre: 'DEAR BODY',                   pct: 0.12, flete: '100% POR 1 MILLON',           plazo: 60, tiendas_nuevas: '60 dias con 12% para las nuevas tiendas La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 33%',  net_iva: 2.5   },
  { nombre: 'RS KAIA',                     pct: 0.10, flete: '100%',                        plazo: 45, tiendas_nuevas: '60 dias para las nuevas tiendas con descuento',                                                              soporte_iva: 'IVA facturado al 40%',  net_iva: null  },
  { nombre: 'KAIA FANTASY',                pct: 0.10, flete: '100%',                        plazo: 45, tiendas_nuevas: '60 dias para las nuevas tiendas con descuento',                                                              soporte_iva: 'IVA facturado al 40%',  net_iva: null  },
  { nombre: 'SAN ANGEL',                   pct: 0.15, flete: 'Flete 2 millon 100%',         plazo: 60, tiendas_nuevas: '90 dias con 15% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'IVA facturado al 60%',  net_iva: null  },
  { nombre: 'DEL ORIENTE',                 pct: 0.06, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 40%',  net_iva: null  },
  { nombre: 'INTEGRA',                     pct: 0.06, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: null,                    net_iva: null  },
  { nombre: 'JUAN DE LA CRUZ',             pct: 0.06, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: null,                    net_iva: null  },
  { nombre: 'JYC COSMETICS',              pct: 0.20, flete: '100%',                        plazo: 45, tiendas_nuevas: '70 dias con 20%',                                                                                             soporte_iva: 'IVA AL 100%',           net_iva: null  },
  { nombre: 'KELLY ZUKLUAGA',              pct: 0.10, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 10% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'IVA facturado al 30%',  net_iva: null  },
  { nombre: 'LA COSMETICS',                pct: 0.10, flete: '100%',                        plazo: 45, tiendas_nuevas: '45 dias',                                                                                                     soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'LYA',                         pct: 0.06, flete: '100%',                        plazo: 45, tiendas_nuevas: '60 dias',                                                                                                     soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'PINK HOUSE',                  pct: 0.10, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 10% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'IVA facturado al 33%',  net_iva: null  },
  { nombre: 'MAFFICK',                     pct: 0.10, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 10% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'IVA facturado al 33%',  net_iva: null  },
  { nombre: 'MAGIC COSMETICOS',            pct: 0.10, flete: '100%',                        plazo: 60, tiendas_nuevas: '70 dias con 10% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'IVA facturado al 30%',  net_iva: null  },
  { nombre: 'MAX MODA',                    pct: 0.10, flete: 'Flete pago desde $1.200.000', plazo: 45, tiendas_nuevas: '60 dias con 10% para las nuevas tiendas La 30 y Plaza del Sol',                                              soporte_iva: null,                    net_iva: null  },
  { nombre: 'MILAGROS Y ACCESORIOS',       pct: 0.10, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 10% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'IVA facturado al 30%',  net_iva: null  },
  { nombre: 'MILAGRO ACCESORIOS',          pct: 0.10, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 10% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'IVA facturado al 30%',  net_iva: null  },
  { nombre: 'MILAIDIS',                    pct: 0.06, flete: '100%',                        plazo: 70, tiendas_nuevas: '70 dias',                                                                                                     soporte_iva: null,                    net_iva: null  },
  { nombre: 'MILAIDYS',                    pct: 0.06, flete: '100%',                        plazo: 70, tiendas_nuevas: '70 dias',                                                                                                     soporte_iva: null,                    net_iva: null  },
  { nombre: 'MILAN',                       pct: 0.08, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 8% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'MIS COSMETICOS',              pct: 0.05, flete: '600 MIL 100%',               plazo: 60, tiendas_nuevas: 'PENDIENTE',                                                                                                   soporte_iva: 'IVA AL 100%',           net_iva: 2.5   },
  { nombre: 'MONACO',                      pct: 0.06, flete: '1 millones 100%',             plazo: 45, tiendas_nuevas: '70 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 35%',  net_iva: null  },
  { nombre: 'MPZ IMPORTACIONES',           pct: 0.10, flete: '100%',                        plazo: 30, tiendas_nuevas: 'PENDIENTE',                                                                                                   soporte_iva: 'IVA facturado al 33%',  net_iva: null  },
  { nombre: 'MYK',                         pct: 0.05, flete: '100%',                        plazo: 60, tiendas_nuevas: null,                                                                                                          soporte_iva: null,                    net_iva: null  },
  { nombre: 'NOOBS',                       pct: 0.06, flete: '0%',                          plazo: 60, tiendas_nuevas: null,                                                                                                          soporte_iva: null,                    net_iva: null  },
  { nombre: 'OSAR',                        pct: 0.05, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 5% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 50%',  net_iva: null  },
  { nombre: 'PANDA',                       pct: 0.06, flete: '50%',                         plazo: 70, tiendas_nuevas: '70 dias',                                                                                                     soporte_iva: 'IVA facturado al 50%',  net_iva: 2.5   },
  { nombre: 'PARA TI',                     pct: 0.06, flete: '100%',                        plazo: 45, tiendas_nuevas: '60 dias con 6% para las nuevas tiendas La 30 y Plaza del Sol',                                               soporte_iva: 'IVA facturado al 20%',  net_iva: null  },
  { nombre: 'PRESTIGE',                    pct: 0.05, flete: '50%',                         plazo: 60, tiendas_nuevas: '90 dias con 5% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 30%',  net_iva: 2.5   },
  { nombre: 'KIUSI',                       pct: 0.05, flete: '50% y 50% menos 1 millon / 1 millon 100%', plazo: 50, tiendas_nuevas: '90 dias con 5% para las nuevas tiendas. La 30 y Plaza del Sol',                                soporte_iva: null,                    net_iva: null  },
  { nombre: 'Q CACHARRO',                  pct: 0.05, flete: '50% y 50% menos 1 millon / 1 millon 100%', plazo: 50, tiendas_nuevas: '90 dias con 5% para las nuevas tiendas. La 30 y Plaza del Sol',                                soporte_iva: null,                    net_iva: null  },
  { nombre: 'ROEL MEDELLIN',               pct: 0.10, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 10% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'PENDIENTE',             net_iva: null  },
  { nombre: 'ROMA',                        pct: 0.06, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 25%',  net_iva: null  },
  { nombre: 'SAN JOSE',                    pct: 0.05, flete: '100% MAS DE 2 MILLONES',      plazo: 60, tiendas_nuevas: '90 dias con 5% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 50%',  net_iva: 2.5   },
  { nombre: 'SANTUS',                      pct: 0.15, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 40%',  net_iva: null  },
  { nombre: 'SEIKO',                       pct: 0.06, flete: '100%',                        plazo: 45, tiendas_nuevas: '45 dias',                                                                                                     soporte_iva: 'IVA facturado al 100%', net_iva: null  },
  { nombre: 'KANDOR',                      pct: 0.06, flete: '100%',                        plazo: 45, tiendas_nuevas: '45 dias',                                                                                                     soporte_iva: 'IVA facturado al 100%', net_iva: null  },
  { nombre: 'SERCOLORES',                  pct: 0.05, flete: '100%',                        plazo: 45, tiendas_nuevas: '45 dias',                                                                                                     soporte_iva: 'IVA facturado al 30%',  net_iva: null  },
  { nombre: 'SYS MAQUILLAJE',              pct: 0.10, flete: '100%',                        plazo: 45, tiendas_nuevas: '45 dias',                                                                                                     soporte_iva: 'IVA facturado al 35%',  net_iva: null  },
  { nombre: 'BEBILO',                      pct: 0.06, flete: '100%',                        plazo: 45, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA AL 100%',           net_iva: null  },
  { nombre: 'UBRA JOT',                    pct: 0.10, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 10% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: null,                    net_iva: null  },
  { nombre: 'USHAS MEDELLIN',              pct: 0.15, flete: 'Flete 2 millon 100%',         plazo: 60, tiendas_nuevas: '90 dias con 15% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'IVA facturado al 60%',  net_iva: 2.5   },
  { nombre: 'VIVEZ',                       pct: 0.06, flete: '100%',                        plazo: 40, tiendas_nuevas: 'Por ahora no',                                                                                                soporte_iva: null,                    net_iva: null  },
  { nombre: 'YIWU',                        pct: 0.06, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 6% para las nuevas tiendas. La 30 y Plaza del Sol',                                              soporte_iva: 'IVA facturado al 30%',  net_iva: null  },
  { nombre: 'ZULU ACCESORIOS',             pct: 0.10, flete: '100%',                        plazo: 60, tiendas_nuevas: '90 dias con 10% para las nuevas tiendas. La 30 y Plaza del Sol',                                             soporte_iva: 'IVA facturado al 30%',  net_iva: null  },
];

const proveedores = db.prepare('SELECT nit, nombre FROM proveedores').all();
const update = db.prepare(`
  UPDATE proveedores SET
    descuento_cacharro = ?,
    descuento_activo = 'cacharro',
    flete_condicion = ?,
    plazo_dias = ?,
    tiendas_nuevas = ?,
    soporte_iva = ?,
    net_iva = ?
  WHERE nit = ?
`);

let actualizados = 0;
let sinDatos = [];

for (const prov of proveedores) {
  const nombreUpper = prov.nombre.toUpperCase();
  const match = proveedoresData.find(d => nombreUpper.includes(d.nombre.toUpperCase()));
  if (match) {
    update.run(match.pct, match.flete, match.plazo, match.tiendas_nuevas, match.soporte_iva, match.net_iva, prov.nit);
    console.log('OK: ' + prov.nombre + ' -> ' + (match.pct * 100) + '% | plazo: ' + match.plazo + ' dias');
    actualizados++;
  } else {
    sinDatos.push(prov.nombre);
  }
}

console.log('\nActualizados: ' + actualizados);
if (sinDatos.length > 0) {
  console.log('Sin datos (configurar manualmente en la app):');
  sinDatos.forEach(n => console.log('  - ' + n));
}
