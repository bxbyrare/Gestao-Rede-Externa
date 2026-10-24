const PT_NAME_PARTICLES = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'del', 'di', 'du', 'van', 'von'
]);

const ROMAN_NUMERALS = new Set(['II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'X']);

const PT_ACCENT_MAP: Record<string, string> = {
  conceicao: 'Conceição',
  assuncao: 'Assunção',
  encarnacao: 'Encarnação',
  purificacao: 'Purificação',
  apresentacao: 'Apresentação',
  anunciacao: 'Anunciação',
  ressurreicao: 'Ressurreição',
  ascensao: 'Ascensão',
  araujo: 'Araújo',
  espirito: 'Espírito',
  nazare: 'Nazaré',
  candido: 'Cândido',
  goncalves: 'Gonçalves',
  mendonca: 'Mendonça',
  lourenco: 'Lourenço',
  franca: 'França',
  proenca: 'Proença',
  valenca: 'Valença',
  braganca: 'Bragança',
  esperanca: 'Esperança',
  simoes: 'Simões',
  guimaraes: 'Guimarães',
  magalhaes: 'Magalhães',
  camoes: 'Camões',
  goes: 'Góes',
  brandao: 'Brandão',
  leao: 'Leão',
  falcao: 'Falcão',
  paixao: 'Paixão',
  galvao: 'Galvão',
  romao: 'Romão',
  aragao: 'Aragão',
  lobao: 'Lobão',
  mourao: 'Mourão',
  negrao: 'Negrão',
  serrao: 'Serrão',
  jordao: 'Jordão',
  leitao: 'Leitão',
  barao: 'Barão',
  carrao: 'Carrão',
  abraao: 'Abraão',
  salomao: 'Salomão',
  simao: 'Simão',
  estevao: 'Estêvão',
  cristovao: 'Cristóvão',
  sebastiao: 'Sebastião',
  damiao: 'Damião',
  junior: 'Júnior',
  jr: 'Júnior',
  'jr.': 'Júnior',
  joao: 'João',
  jose: 'José',
  antonio: 'Antônio',
  andre: 'André',
  mario: 'Mário',
  sergio: 'Sérgio',
  flavio: 'Flávio',
  fabio: 'Fábio',
  claudio: 'Cláudio',
  marcio: 'Márcio',
  decio: 'Décio',
  lucio: 'Lúcio',
  helcio: 'Hélcio',
  julio: 'Júlio',
  cesar: 'César',
  regis: 'Régis',
  ines: 'Inês',
  sonia: 'Sônia',
  monica: 'Mônica',
  veronica: 'Verônica',
  patricia: 'Patrícia',
  leticia: 'Letícia',
  cecilia: 'Cecília',
  lucia: 'Lúcia',
  valeria: 'Valéria',
  rogerio: 'Rogério',
  silverio: 'Silvério',
  tiberio: 'Tibério',
  vinicius: 'Vinícius',
  mauricio: 'Maurício',
  fabricio: 'Fabrício',
  aparicio: 'Aparício',
  bonifacio: 'Bonifácio',
  inacio: 'Inácio',
  horacio: 'Horácio',
  estacio: 'Estácio',
  jeronimo: 'Jerônimo',
  teofilo: 'Teófilo',
  angelo: 'Ângelo',
  romulo: 'Rômulo',
  getulio: 'Getúlio',
  braulio: 'Bráulio',
  tulio: 'Túlio',
  helio: 'Hélio',
  celio: 'Célio',
  nelio: 'Nélio',
  aurelio: 'Aurélio',
  cornelio: 'Cornélio',
  otavio: 'Otávio',
  savio: 'Sávio',
  silvio: 'Sílvio',
  fulvio: 'Fúlvio',
  plinio: 'Plínio',
  herminio: 'Hermínio',
  virginia: 'Virgínia',
  vitoria: 'Vitória',
  gloria: 'Glória',
  fatima: 'Fátima',
  barbara: 'Bárbara',
  debora: 'Débora',
  tamara: 'Tâmara',
  claudia: 'Cláudia',
  flavia: 'Flávia',
  marcia: 'Márcia',
  silvia: 'Sílvia',
  katia: 'Kátia',
  cassia: 'Cássia',
  cassio: 'Cássio',
  tassio: 'Tássio',
  lazaro: 'Lázaro',
  icaro: 'Ícaro',
  italo: 'Ítalo',
  alvaro: 'Álvaro',
  eder: 'Éder',
  edson: 'Édson',
  everson: 'Éverson',
  emerson: 'Émerson',
  erica: 'Érica',
  erico: 'Érico',
  hercules: 'Hércules',
  moises: 'Moisés',
  josue: 'Josué',
  tome: 'Tomé',
  noemia: 'Noêmia',
  eugenio: 'Eugênio',
  eugenia: 'Eugênia',
  genesio: 'Genésio',
  anisio: 'Anísio',
  dionisio: 'Dionísio',
  aloisio: 'Aloísio',
  aluisio: 'Aluísio',
  luis: 'Luís',
};

function capWord(w: string): string {
  if (!w) return '';
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

export function formatPersonName(rawName?: string | null): string {
  if (!rawName || typeof rawName !== 'string') return '';
  const cleaned = rawName.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  if (cleaned.includes('.') && !cleaned.includes(' ')) {
    return cleaned;
  }

  const tokens = cleaned.split(' ');
  const total = tokens.length;

  return tokens
    .map((token, idx) => {
      const upperTok = token.toUpperCase();
      const lowerTok = token.toLowerCase();

      if (idx > 0 && PT_NAME_PARTICLES.has(lowerTok)) {
        return lowerTok;
      }

      if (
        idx === total - 1 &&
        total >= 3 &&
        ['ju', 'jun', 'juni', 'junio', 'junior', 'jr', 'jr.'].includes(lowerTok)
      ) {
        return 'Júnior';
      }

      if (idx > 0 && ROMAN_NUMERALS.has(upperTok)) {
        return upperTok;
      }

      if (PT_ACCENT_MAP[lowerTok]) {
        return PT_ACCENT_MAP[lowerTok];
      }

      if (lowerTok.includes('-')) {
        return lowerTok
          .split('-')
          .map((sp) => PT_ACCENT_MAP[sp] || capWord(sp))
          .join('-');
      }

      if (lowerTok.includes("'")) {
        return lowerTok
          .split("'")
          .map((sp) => capWord(sp))
          .join("'");
      }

      return capWord(lowerTok);
    })
    .join(' ');
}
