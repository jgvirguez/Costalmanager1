import { BillingClient, BillingItem } from '../types/billing';

export const MOCK_CLIENTS: BillingClient[] = [
  { id: 'V-12964963', name: 'JOSE MOGOLLÓN', address: 'AV. INTERCOMUNAL, LOS CREPÚSCULOS', phone: '0412-5558899', type: 'Natural' },
  { id: 'J-31456789-1', name: 'INDUSTRIAS COSTAL C.A', address: 'ZONA INDUSTRIAL III, CALLE 2', phone: '0251-2371122', type: 'Jurídica' },
  { id: 'V-20123456', name: 'MARÍA PÉREZ', address: 'URB. SANTA ELENA, BARRE EL SOL', phone: '0424-1112233', type: 'Natural' },
];

export const MOCK_PRODUCTS = [
  {
    "code": "P-0001",
    "description": "5 ESPECIAS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0002",
    "description": "7 ESPECIAS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0003",
    "description": "ACEITE DE COCO 500 ML",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0004",
    "description": "ACEITE DE OLIVA 250ML",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0005",
    "description": "ACEITE DE OLIVA 500ML",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0006",
    "description": "ACEITE VEGETAL DE PALMA 18LT",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0007",
    "description": "ACEITE VEGETAL DE PALMA 4.8 LT",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0008",
    "description": "ACEITUNA CON HUESO 280 GR FRASCO",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0009",
    "description": "ACEITUNA RELLENA 270 GR FRASCO",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0010",
    "description": "ACEITUNAS CON HUESO",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0011",
    "description": "ACEITUNAS NEGRAS FRASCO GRANDE",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0012",
    "description": "ACEITUNAS RELLENAS",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0013",
    "description": "ACIDO BORICO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0014",
    "description": "ACIDO CITRICO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0015",
    "description": "ADOBO CRISTHEMY",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0016",
    "description": "ADOBO MEZCLA EL COSTAL KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0017",
    "description": "ADOBO PURO  ANDES",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0018",
    "description": "ADOBO PURO CR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0019",
    "description": "ADOBO Y",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0020",
    "description": "AFRECHO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0021",
    "description": "AFRECHO  SACO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0022",
    "description": "AFRECHO MOCASA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0023",
    "description": "AGUA POOL 600 ML",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0024",
    "description": "AGUA 1.5 LT",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0025",
    "description": "AJI PICANTE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0026",
    "description": "AJO CEB,PEREJ. ANDES",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0027",
    "description": "AJO  CHINO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0028",
    "description": "AJO  CHINO  CAJA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0029",
    "description": "AJO GRANULADO EYR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0030",
    "description": "AJO GRANULADO PURO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0031",
    "description": "AJO MEZ.ANDES",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0032",
    "description": "AJO MEZCLA EL COSTAL RODPER",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0033",
    "description": "AJONJOLI DES. NAC.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0034",
    "description": "AJONJOLI NATURAL",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0035",
    "description": "AJO PURO ANDES",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0036",
    "description": "AJO PURO COSTAL RODPER",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0037",
    "description": "ALBAHACA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0038",
    "description": "ALCAPARRAS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0039",
    "description": "ALI¥O PREP COSTAL-RODPER",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0040",
    "description": "ALI¥O PREP. Y",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0041",
    "description": "ALIÑO PREPARADO ANDES",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0042",
    "description": "ALMEMENDRINAS KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0043",
    "description": "ALMENDRAS ENTERA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0044",
    "description": "ALMENDRAS FILET.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0045",
    "description": "ALMIDON MAIZENA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0046",
    "description": "ALPISTE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0047",
    "description": "ALUCEMA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0048",
    "description": "ALUMBRE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0049",
    "description": "ANIS DULCE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0050",
    "description": "ANIS ESTRELLA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0051",
    "description": "ARROZ SEGUNDA POLLITO",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0052",
    "description": "ARVEJAS AMARILLA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0053",
    "description": "ARVEJAS V. PARTIDA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0054",
    "description": "ATUN ARRECIFE UND",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0055",
    "description": "AVELLANAS KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0056",
    "description": "AVENA  KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0057",
    "description": "AVENA  SACO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0058",
    "description": "AZUCAR SACO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0059",
    "description": "AZUFRE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0060",
    "description": "BASE SALSA AJO Y PEREJIL RORO' S 45GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0061",
    "description": "BASE SALSA MAIZ RORO' S 45GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0062",
    "description": "BASE SALSA QUESO CHEDAR RORO' S 45GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0063",
    "description": "BASE SALSA TOCINETA RORO' S 45GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0064",
    "description": "BASETORTA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0065",
    "description": "BBQ LA  XPAÑOLA 200G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0066",
    "description": "BBQ KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0067",
    "description": "BBQ PICANTE KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0068",
    "description": "BENZOATO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0069",
    "description": "BIG COLA 400 ML",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0070",
    "description": "BIG COLA UND 2 LT",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0071",
    "description": "CHOCOLATEGOMU GOMU MANI 40G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0072",
    "description": "CHOCOLATE KANDI 40G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0073",
    "description": "CHOCOLATE BLISS PIÑA 40G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0074",
    "description": "BOLSAS CLIENTES",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0075",
    "description": "BOLSAS 1 KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0076",
    "description": "CACAO CIVEN",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0077",
    "description": "CACAO MANTORO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0078",
    "description": "CACAO NESTLE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0079",
    "description": "CAFE 100GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0080",
    "description": "CAFE 200GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0081",
    "description": "CALDO DE CARNE COSTAL KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0082",
    "description": "CALDO POLLO ANDES",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0083",
    "description": "CALDO POLLO CR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0084",
    "description": "CALDO POLLO Y",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0085",
    "description": "CANELA M PURA EL COSTAL-CR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0086",
    "description": "CANELA M SEMI EL COSTAL-CR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0087",
    "description": "CANELA ENTERA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0088",
    "description": "CANELA PURA Y",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0089",
    "description": "CANELA SEMI CRISTHEMY",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0090",
    "description": "CANELA SEMI LA Y",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0091",
    "description": "CARAOTA NEGRA CANADIENSE KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0092",
    "description": "CARAOTA NEGRA IMPORTADA 45KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0093",
    "description": "CARAOTA NEGRA CRIOLLA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0094",
    "description": "CARAOTA NEGRA COSTAL KG EMP.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0095",
    "description": "CARAOTA NEGRA IMPORTADA  KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0096",
    "description": "CARAOTA NEGRA IMPORT SACO 50 KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0097",
    "description": "CARAOTA ROJA CRIOLLA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0098",
    "description": "CARAOTAS BLANCA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0099",
    "description": "CARMENCITA ANDES",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0100",
    "description": "CARMENCITA COSTAL KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0101",
    "description": "CARMENCITA CRISTHEMY",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0102",
    "description": "CARMENCITA LA Y",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0103",
    "description": "CARNE DE SOYA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0104",
    "description": "CARNE GUARO BURGER 50G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0105",
    "description": "CARNE FAVORITA 10 UND",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0106",
    "description": "CARNE PADRINO 10 UND",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0107",
    "description": "CEBADA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0108",
    "description": "CEBOLLA MOLIDA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0109",
    "description": "CEREAL ARITOS KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0110",
    "description": "CEREAL HOJUELA ESP.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0111",
    "description": "CEREZA GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0112",
    "description": "CEREZA FRASCO PEQ",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0113",
    "description": "CHAMPIÑONES LATA 2.84 KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0114",
    "description": "CHAMPIÑONES LATA 400 Gr",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0115",
    "description": "CHANTILLY LIQUIDA LT",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0116",
    "description": "CHANTILLY POLVO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0117",
    "description": "CHANTILLY MASTER TOP LT",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0118",
    "description": "QUESO CHEDAR EN POLVO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0119",
    "description": "CHIA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0120",
    "description": "CHICHARIN  KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0121",
    "description": "CHICHARIN  SACO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0122",
    "description": "CHOCO MIO CALY",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0123",
    "description": "CHOCOLATE BITTER CON SPLENDA 100 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0124",
    "description": "CHOCOLATE BITTER CON STEVIA 100 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0125",
    "description": "CHOCOLATE CON LECHE CON SPLENDA 100 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0126",
    "description": "CHOCOLATE CON LECHE CON STEVIA 100 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0127",
    "description": "CHOCOLATE EXTRA BITTER 250 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0128",
    "description": "CHORIZO AHUMADO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0129",
    "description": "CHORIZO AJO AHULUX",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0130",
    "description": "Chupeta madagascar",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0131",
    "description": "CILANTRO EN GRANO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0132",
    "description": "CIRUELAS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0133",
    "description": "CLAVO DE OLOR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0134",
    "description": "CMC",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0135",
    "description": "COBERTURA BITTER KRON 1KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0136",
    "description": "COBERTURA BLANCA 1KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0137",
    "description": "COBERTURA CON LECHE 1KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0138",
    "description": "COCACOLA BOMBITA 400 ML",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0139",
    "description": "COCO RALLADO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0140",
    "description": "COLOR  NARANJA  FLAVORS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0141",
    "description": "COLOR AMARILLO  FLAVORS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0142",
    "description": "COLOR AZUL FLAVORS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0143",
    "description": "COLOR MORADO FLAVORS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0144",
    "description": "COLOR NEGRO  FLAVORS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0145",
    "description": "COLOR ROJO  FLAVORS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0146",
    "description": "COLOR ROJO COLORISA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0147",
    "description": "COLOR ROSADO FLAVORS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0148",
    "description": "COLORISA AMARILLO BOLSA 500 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0149",
    "description": "COLORISA AMARILLO HUEVO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0150",
    "description": "COMBO DE HAMBURGUESA DE 10 UND.",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0151",
    "description": "COMBO EMPREDE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0152",
    "description": "COMINO EN GRANO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0153",
    "description": "COMINO MEZ. LOS ANDES",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0154",
    "description": "COMINO MOLIDO LA Y",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0155",
    "description": "COMINO PURO EL COSTAL-RODPER",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0156",
    "description": "COMINO PURO CRISTHEMY",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0157",
    "description": "CREMOR TARTARO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0158",
    "description": "CURCUMA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0159",
    "description": "CURRY PURO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0160",
    "description": "DANDY COLORIDO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0161",
    "description": "DANDY MINI KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0162",
    "description": "DORITOS EN POLVO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0163",
    "description": "ENCURTIDO 1,65 UND",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0164",
    "description": "ENCURTIDO 180 GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0165",
    "description": "ENCURTIDO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0166",
    "description": "ENELDO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0167",
    "description": "ERITORBATO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0168",
    "description": "ESEN LIMON LT FLAVORS",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0169",
    "description": "ESEN NARANJA LT FLAVORS",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0170",
    "description": "ESEN TUTIFRUTI GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0171",
    "description": "ESEN TUTIFRUTI LITRO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0172",
    "description": "ESENC MANTEQUILLA LT FLAV",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0173",
    "description": "ESENC MANZANA GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0174",
    "description": "ESENC NATA GALON SAYO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0175",
    "description": "ESENC CHOCO LITRO FLAVORS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0176",
    "description": "ESENC COCO FLAVORS GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0177",
    "description": "ESENC COLITA FLOWER LITRO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0178",
    "description": "ESENC DE CHICLETS LT",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0179",
    "description": "ESENC DE COCO FLAVORS LT",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0180",
    "description": "ESENC DULCE LECHE LT FLAV",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0181",
    "description": "ESENC FRESA LITRO FLAVORS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0182",
    "description": "ESENCIA MANZANA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0183",
    "description": "ESENCIA PERA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0184",
    "description": "EXTR MANTECADO 225 ORQ.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0185",
    "description": "EXTR MANTEQUILLA 225 ORQ.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0186",
    "description": "EXTR RON PASA 225 ORQ.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0187",
    "description": "EXTR VAINI BLANCA 100 ORQ.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0188",
    "description": "EXTR VAINI BLANCA 225 ORQ.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0189",
    "description": "EXTR VAINI NEGRA 100 ORQ.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0190",
    "description": "EXTR VAINI NEGRA 225 ORQ.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0191",
    "description": "EXTR VAINI NEGRA 500 ORQ.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0192",
    "description": "EXTR VAINI OSCU 850 ORQ.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0193",
    "description": "FLAN GM VAINILLA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0194",
    "description": "FLOR DE JAMAICA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0195",
    "description": "FRESAS CON CREMA UN",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0196",
    "description": "FRIJOL BAYO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0197",
    "description": "FRIJOL BLANCO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0198",
    "description": "FRIJOL CHINO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0199",
    "description": "FRIJOL CHINO consumo animal",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0200",
    "description": "FRIJOL PICO NEGRO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0201",
    "description": "FRIJOL SOYA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0202",
    "description": "FRUTAS CONFITADA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0203",
    "description": "GARBANZO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0204",
    "description": "GATORADE 500ML",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0205",
    "description": "GELATINA GM S/VARIOS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0206",
    "description": "GELATINA SIN SABOR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0207",
    "description": "GIRASOL",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0208",
    "description": "GOMA XANTAL",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0209",
    "description": "GOMITAS KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0210",
    "description": "GOTAS CHOCOLATE CON LECHE KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0211",
    "description": "GOTAS CHOCOLATE BITTER ST MORITZ 500 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0212",
    "description": "GOTAS CHOCOLATE BLANCO ST MORITZ 500 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0213",
    "description": "GOTAS CHOCOLATE CON LECHE ST MORITZ   500 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0214",
    "description": "GOTAS CHOCOLATE BLANCO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0215",
    "description": "GRAGEADO S/A AVENALLA LECHE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0216",
    "description": "GRAGEADO S/A ALMENDRA BITTER",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0217",
    "description": "GRAGEADO S/A FRUTOS MIXTOS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0218",
    "description": "GRAGEAS PALITO SPLINKER KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0219",
    "description": "GRAGEAS PERLA GRANDE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0220",
    "description": "GRAGEAS PERLA PEQ Y MED",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0221",
    "description": "GRANOLA RODPER",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0222",
    "description": "GRANOLA COSTAL",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0223",
    "description": "GRANULADO CHOCO ENCANTO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0224",
    "description": "GRANULADO MACIO COBERTURA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0225",
    "description": "GUAYABITA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0226",
    "description": "GUISANTE 400 Gr",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0227",
    "description": "CARNE HAMBURGUESA 40G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0228",
    "description": "CARNE HAMBURGUESA 55G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0229",
    "description": "HARINA DE YUCA PAQ 500 G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0230",
    "description": "HELADO GM CHICLE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0231",
    "description": "HELADO GM LIMON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0232",
    "description": "HELADO GM MANTECADO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0233",
    "description": "HELADO GM PARCHITA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0234",
    "description": "HELADO GM UVA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0235",
    "description": "HELADO GM CHOCO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0236",
    "description": "HELADO GM COCO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0237",
    "description": "HELADO GM FRESA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0238",
    "description": "HELADO GM RON PASAS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0239",
    "description": "HIERBABUENA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0240",
    "description": "HILO PABILO BULTO",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0241",
    "description": "HILO PABILO UNIDAD",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0242",
    "description": "HINOJO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0243",
    "description": "HUMO LIQUIDO LITRO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0244",
    "description": "JAMON AHUMADO PROEMBUTI",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0245",
    "description": "JAMON ESPALDA L PRADO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0246",
    "description": "JENGIBRE MOLIDO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0247",
    "description": "LAUREL HOJA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0248",
    "description": "LAUREL MOLIDO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0249",
    "description": "LENTEJAS  KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0250",
    "description": "LENTEJAS  SACO 50KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0251",
    "description": "LENTEJAS EMPAQUETADAS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0252",
    "description": "LENTEJAS P",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0253",
    "description": "LEVAD GLORIPAN DORADA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0254",
    "description": "LEVADURA INSTANT KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0255",
    "description": "LIMON COSTAL",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0256",
    "description": "LIMON MOLIDO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0257",
    "description": "LIMON MOLIDO BLANCO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0258",
    "description": "LINAZA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0259",
    "description": "LLUVIA DE COLORES",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0260",
    "description": "LLUVIA DE COLORES CARNAVAL",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0261",
    "description": "LLUVIA SABOR CHOCOLATE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0262",
    "description": "LLUVIA NAVIDEÑA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0263",
    "description": "LLUVIA NEON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0264",
    "description": "MAIZ AMARILLO ENTERO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0265",
    "description": "MAIZ AMARILLO ENTERO SACO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0266",
    "description": "MAIZ BLANCO ENTERO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0267",
    "description": "MAIZ COTUFA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0268",
    "description": "MAIZ PILADO AMARILLO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0269",
    "description": "MAIZ PILADO BLANCO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0270",
    "description": "MAIZ DULCE LATA 2.840 Kg",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0271",
    "description": "MAIZ DULCE LATA 400 Gr",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0272",
    "description": "MAIZ DULCE KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0273",
    "description": "MANI  AJONJOLI",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0274",
    "description": "MANI ROJO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0275",
    "description": "MANI CON CHOCOLATE COLORES KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0276",
    "description": "MANI CONFITADO COLORES KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0277",
    "description": "MANI JAPONES",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0278",
    "description": "MANI JUMBO SALADO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0279",
    "description": "MANI LIMON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0280",
    "description": "MANI LLUVIA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0281",
    "description": "MANI MIX",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0282",
    "description": "MANI SIN SAL TIPO A",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0283",
    "description": "MANI TOSTADO CONCHA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0284",
    "description": "MANI PICANTE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0285",
    "description": "MANI SALADO PREMIUN",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0286",
    "description": "MANI SIN SAL  PREMIUN",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0287",
    "description": "MANI SALADO TIPO A",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0288",
    "description": "MANTECA DELIOIL CJ",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0289",
    "description": "MANZANILLA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0290",
    "description": "MARGARINA TUPAN CAJA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0291",
    "description": "MASA LISTA 800 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0292",
    "description": "MAYONESA RAGAH3.350kg",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0293",
    "description": "MAYONESA GUSTOSA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0294",
    "description": "MAYONESA GUSTOSA 250 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0295",
    "description": "MAYONESA GUSTOSA GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0296",
    "description": "MAYONESA IDEAL GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0297",
    "description": "MAYONESA VEANA  3.785 KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0298",
    "description": "MEJORADOR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0299",
    "description": "MELOCOTON LATA 425 Gr",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0300",
    "description": "MENTA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0301",
    "description": "MEREY KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0302",
    "description": "MERMELADA GUAYABA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0303",
    "description": "MICOBAN",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0304",
    "description": "MIX INTEGRAL",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0305",
    "description": "MORTADELA DON RAMON 400G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0306",
    "description": "MORTADELA DON RAMON 900 GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0307",
    "description": "MORTADELA MARI 1KG.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0308",
    "description": "MOSTAZA  EN GRANO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0309",
    "description": "MOSTAZA GALON GUSTOSA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0310",
    "description": "MOSTAZA  COMA PQ",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0311",
    "description": "MOSTAZA GUSTOSA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0312",
    "description": "MOSTAZA GUSTOSA 200 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0313",
    "description": "NUEZ MOSCADA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0314",
    "description": "NUEZ SIN CASCARA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0315",
    "description": "NUGGETS POLLO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0316",
    "description": "NUGGETS QUESO  KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0317",
    "description": "ONOTO GRANO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0318",
    "description": "ONOTO MOLIDO  Y",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0319",
    "description": "ONOTO MOLIDO PURO CR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0320",
    "description": "ONOTO PURO CRISTHEMY",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0321",
    "description": "OREGANO EN HOJA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0322",
    "description": "OREGANO MOLIDO EL COSTAL KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0323",
    "description": "PAN ARAVE TIPO SHAWARMA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0324",
    "description": "PAN ARAVE TIPO TORTILLA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0325",
    "description": "PAN DE HAMBURGUESA SUSANA 10 UNID",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0326",
    "description": "PAN DE PERRO CALIENTE GRANDE SUSANA  10 UND",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0327",
    "description": "PAPAS RALLADAS CHIPS KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0328",
    "description": "PAPAS RALLADAS CHILOE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0329",
    "description": "PAPEL ANTIGRASO BOBINA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0330",
    "description": "PAPELON BULTO PEQUEÑA",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0331",
    "description": "PAPELON UND",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0332",
    "description": "PEPSI BULTO 2.5 LT",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0333",
    "description": "PIMENTON  PICANTE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0334",
    "description": "PIMENTON DULCE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0335",
    "description": "PIMIENTA BLANCA  PURA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0336",
    "description": "PIMIENTA CAYENA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0337",
    "description": "PIMIENTA EN GRANO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0338",
    "description": "PIMIENTA MEZCLA COSTAL KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0339",
    "description": "PIMIENTA NEGRA PURA  CR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0340",
    "description": "PIMIENTA NEGRA PURA LA Y",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0341",
    "description": "PIMIENTA PURA FOGONCITO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0342",
    "description": "PISTACHO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0343",
    "description": "PISTACHO SIN CONCHA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0344",
    "description": "POLVO HORN CAROLESEN AZUL",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0345",
    "description": "POLVO HORN SABRIMAX  KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0346",
    "description": "PUDIN GM CHOCOLATE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0347",
    "description": "PUDIN GM FRESA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0348",
    "description": "PUDIN GM MANTECADO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0349",
    "description": "PUDIN GM VAINILLA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0350",
    "description": "QUESO AMARILLO NAPOLITANO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0351",
    "description": "QUESO AMARILLO MONTESACRO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0352",
    "description": "QUESO AMARILLO CAROLAY",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0353",
    "description": "QUESO DE AÑO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0354",
    "description": "QUESO MOZZARELLA MI VAQUITA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0355",
    "description": "QUINCHONCHO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0356",
    "description": "QUINOA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0357",
    "description": "REFRESCO BOMBITA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0358",
    "description": "REFRESCO LATA COCACOLA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0359",
    "description": "REFRESCOGOLDEN LITRO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0360",
    "description": "RELAX",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0361",
    "description": "CHOCOLATE DARK 40G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0362",
    "description": "CHOCOLATE RICH DARK 90G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0363",
    "description": "CHOCOLATE RICHC MILK 40G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0364",
    "description": "CHOCOLATE RICHCRUNCH WHITE 40G",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0365",
    "description": "ROMERO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0366",
    "description": "SABROSEADOR LOS ANDES",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0367",
    "description": "SABROSEADOR RODPER",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0368",
    "description": "SAL BLANCA SACO 20 Kg",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0369",
    "description": "SAL  1 Kg",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0370",
    "description": "SAL CHINA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0371",
    "description": "SAL CHINA MICRO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0372",
    "description": "SAL DE CURA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0373",
    "description": "SAL DE HIGUERA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0374",
    "description": "SAL MARINA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0375",
    "description": "SALCHI DE POLLO KG  ALPRO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0376",
    "description": "SALCHICHA DE POLLO FONTANA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0377",
    "description": "SALCHI DE POLLO DON THEO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0378",
    "description": "SALCHI DE POLLO FONTANA 3.5 KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0379",
    "description": "SALCHICHA L PRADO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0380",
    "description": "SALCHICHA POLACA RANCHO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0381",
    "description": "SALSA INST. PASTA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0382",
    "description": "SALSA AJO ISABELLA  GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0383",
    "description": "SALSA CHINA 500 ML",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0384",
    "description": "SALSA DE TOMATE EMVESA 5 KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0385",
    "description": "SALSA INGLESA ISABELLA  GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0386",
    "description": "SALSA DE TOMATE PREMIUN XPAÑOLA",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0387",
    "description": "SALSA ROJA GALON BOLSA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0388",
    "description": "SALSA ROJA GALON PLASTICO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0389",
    "description": "SALSA ROJA GUSTOSA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0390",
    "description": "SALSA ROJA GUSTOSA GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0391",
    "description": "SALSA ROJA ISABELLA GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0392",
    "description": "SALSA ROSADA ISABELLA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0393",
    "description": "SALSA TOCINETA ISABELLA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0394",
    "description": "SALSA DE TOMATE VEANA  3.785 KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0395",
    "description": "SALSIFAST SOBRE DE 45 GMS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0396",
    "description": "SEMILLAS DE CALABAZA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0397",
    "description": "SEN KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0398",
    "description": "SPEED MAX LATA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0399",
    "description": "SPEED MAX POTE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0400",
    "description": "SPRINKLES UND",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0401",
    "description": "STEVIA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0402",
    "description": "SUERO DE BOLSA DON FERNANDO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0403",
    "description": "SUGARFINA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0404",
    "description": "SUGARFINA FLOWER KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0405",
    "description": "TE NEGRO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0406",
    "description": "TE VERDE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0407",
    "description": "TILO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0408",
    "description": "TOCINETA AHUMADA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0409",
    "description": "TOCINETA EN POLVO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0410",
    "description": "TOMILLO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0411",
    "description": "TRIGO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0412",
    "description": "UVAS PASAS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0413",
    "description": "VINAGRE 1/2 LITRO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0414",
    "description": "VINAGRE 1 LITRO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0415",
    "description": "VINAGRE MANZANA 1 LITRO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0416",
    "description": "ACEITE DE OLIVA 1LT",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0417",
    "description": "ACEITE 3 LITROS  KAIROS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0418",
    "description": "ACEI TE DE OLIVA LA FRAGUA 250ML",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0419",
    "description": "ACEI TE DE OLIVA LA FRAGUA 500ML",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0420",
    "description": "ACEITUNAS NEGRAS LA FRAGUA 390GR",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0421",
    "description": "ACEITUNAS NEGRAS RODAJAS LATA 3100 GR",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0422",
    "description": "AJONJOLI NEGRO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0423",
    "description": "ALIÑO PREPARADO CHORIZO EN POLVO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0424",
    "description": "ATUN EN ACEITE DE GIRASOL 145GR",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0425",
    "description": "ATUN NATURAL LA  FRAGUA 145G",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0426",
    "description": "ATUN AHUMADO LA  FRAGUA 145G",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0427",
    "description": "BBQ LA  XPAÑOLA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0428",
    "description": "BICARBONATO 200G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0429",
    "description": "BICARBONATO 500G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0430",
    "description": "CHOCOLATE BLISS MANI 40G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0431",
    "description": "CARAMELINA LT",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0432",
    "description": "CARNE DE SOYA  EMPAQUETADA 46G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0433",
    "description": "CARNE GUARO BURGER 40G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0434",
    "description": "CHAMPIÑON PRIMERA 2500 GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0435",
    "description": "CHAMPIÑONES LAMINADOS LA FRAGUA 370GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0436",
    "description": "CHOCOLATE BARRA BLANCA CALY 100G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0437",
    "description": "CHOCOLATE BARRA CON LECHE CALY 100G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0438",
    "description": "CHOCOLATE BARRA OSCURA CALY 100G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0439",
    "description": "COCO FILETEADO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0440",
    "description": "COLOR VERDE FLAVORS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0441",
    "description": "COLORANTES EN GOTAS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0442",
    "description": "GALLETAS GOLOZETAS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0443",
    "description": "GOTAS CHOCOLATE BITTER ST MORITZ 200 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0444",
    "description": "GOTAS CHOCOLATE CON LECHE ST MORITZ  200 GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0445",
    "description": "GRANOLA JIRETH KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0446",
    "description": "JALAPEÑO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0447",
    "description": "JUGO D FRUTILAC BULTO X12",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0448",
    "description": "LECHE CONDENSADA NESTLE",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0449",
    "description": "LECHE PURISIMA 1L",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0450",
    "description": "MAIZ DULCE LATA 150G TRIPACK",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0451",
    "description": "MAIZ DULCE LA FRAGUA 2500 GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0452",
    "description": "MAIZ DULCE LA FRAGUA 300 GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0453",
    "description": "MANI  COCO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0454",
    "description": "MANI JAPONES MIXTO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0455",
    "description": "MANTECA AURA CJ",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0456",
    "description": "MAYONESA ECONOMICA XPAÑOLA GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0457",
    "description": "MAYONESA  PREMIUN XPAÑOLA KG",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0458",
    "description": "MAYONESA VEANA  1KG KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0459",
    "description": "MAYONESA PREMIUM  XPAÑOLA 200G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0460",
    "description": "MAYONESA PREMIUM  XPAÑOLA GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0461",
    "description": "MELOCOTON ALMIBAR LATA 2500 GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0462",
    "description": "MIEL 100ml",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0463",
    "description": "MINI FLAQUITO PAQ 15UN",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0464",
    "description": "MORTADELA DON THEO 400G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0465",
    "description": "MORTADELA DON RAMON 600G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0466",
    "description": "MORTADELA MARI 500GRS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0467",
    "description": "MOSTAZA  EN GRANO NEGRA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0468",
    "description": "MOSTAZA XPAÑOLA 200G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0469",
    "description": "PAPELON BULTO GRANDE",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0470",
    "description": "PAPELON CONO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0471",
    "description": "PASTA DE TOMATE RISCOSSA 680GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0472",
    "description": "PASTA DE TOMATE EXTRA 400 GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0473",
    "description": "PASTA DE TOMATE EXTRA 2200 GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0474",
    "description": "PEPINILLOS EN VINAGRE 1.900KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0475",
    "description": "PIÑA EN ALMIBAR 850GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0476",
    "description": "PULPA DE FRUTAS",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0477",
    "description": "QUESO DE AÑO FRITZ",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0478",
    "description": "CHOCOLATE RICH MILK 90G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0479",
    "description": "CHOCOLATE RICH WHITE 40G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0480",
    "description": "SAL ROSA DEL HIMALAYA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0481",
    "description": "SAL DE CURA ROSADA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0482",
    "description": "SALSA DE TOMATE PREMIUN XPAÑOLA 1kg",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0483",
    "description": "SALSA DE TOMATE PREMIUN XPAÑOLA 200g",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0484",
    "description": "SALSA SOYA ISABELLA  GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0485",
    "description": "SALSA TOCINETA RORO`S 226GR",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0486",
    "description": "SALSA DE TOMATE VEANA  1KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0487",
    "description": "SIROPE CHOCOLATE 1200",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0488",
    "description": "SIROPE CHOCOLATE 300G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0489",
    "description": "SIROPE DE FRESA 1200",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0490",
    "description": "SIROPE FRESA 300G",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0491",
    "description": "SUERO DE BOLSA GUARALAC",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0492",
    "description": "VINAGRE  GALON",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0493",
    "description": "ACEITE VEGETAL DE PALMA 20LT",
    "unit": "LT",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0494",
    "description": "ACEITUNAS RELL. TOBO 14 KG",
    "unit": "UN",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0495",
    "description": "ADOBO FOGONCITO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0496",
    "description": "AJI JALAPEÑO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0497",
    "description": "ALCAPARRAS TOBO 35 KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0498",
    "description": "AVENA  SACO INTEGRAL",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0499",
    "description": "AVENA INTEGRAL",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0500",
    "description": "CANELA MOLIDA PURA FOGONCITO  KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0501",
    "description": "COMIINO PURO FOGONCITO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0502",
    "description": "LENTEJAS  SACO 45kg",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0503",
    "description": "LIMON PIMIENTA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0504",
    "description": "MOSTAZA  COMA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0505",
    "description": "POLLO SNACK KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0506",
    "description": "SABROSEADOR FOGONCITO KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0507",
    "description": "CAMBUR DEHIRATADO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0508",
    "description": "CEREAL HOJUELA NAT.",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0509",
    "description": "MANI CRUDO",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0510",
    "description": "OREJONES DE MANZANA",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  },
  {
    "code": "P-0511",
    "description": "PIÑA DESHIDRATADA KG",
    "unit": "KG",
    "priceUSD": 1,
    "stock": 0
  }
];