export const CONTENT_HUB_PATH = "/conteudos";

export type ContentGroup = "setor" | "pratico";

export type IndustryFamily =
  | "Saúde"
  | "Beleza e bem-estar"
  | "Restauração e hotelaria"
  | "Casa, auto e campo"
  | "Serviços profissionais"
  | "Fitness e formação";

export interface ArticleSection {
  heading: string;
  paragraphs: string[];
}

export interface Article {
  slug: string;
  title: string;
  description: string;
  menuLabel: string;
  group: ContentGroup;
  family?: IndustryFamily;
  related: string[];
  sections: ArticleSection[];
}

export const CONTENT_HUB = {
  path: CONTENT_HUB_PATH,
  title: "Guias para PME que atendem o telefone em Portugal",
  description:
    "Notas práticas em português de Portugal: seis famílias de negócio e as perguntas que uma PME faz antes de pôr um atendedor na linha.",
} as const;

export function articlePath(slug: string): string {
  return `${CONTENT_HUB_PATH}/${slug}`;
}

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((article) => article.slug === slug);
}

export function articlesByGroup(group: ContentGroup): Article[] {
  switch (group) {
    case "setor":
    case "pratico":
      return ARTICLES.filter((article) => article.group === group);
    default: {
      const exhaustive: never = group;
      throw new Error(`Unknown content group: ${String(exhaustive)}`);
    }
  }
}

export function contentGroupLabel(group: ContentGroup): string {
  switch (group) {
    case "setor":
      return "Setores";
    case "pratico":
      return "Na prática";
    default: {
      const exhaustive: never = group;
      throw new Error(`Unknown content group: ${String(exhaustive)}`);
    }
  }
}

export const ARTICLES: Article[] = [
  {
    slug: "consultas-ao-telefone-clinica",
    title: "Consultas ao telefone: como uma clínica atende sem sair do gabinete",
    description:
      "O que uma chamada de marcação pede numa clínica portuguesa — e o que o telefone não deve improvisar.",
    menuLabel: "Saúde",
    group: "setor",
    family: "Saúde",
    related: ["marcacao-por-telefone", "atendedor-virtual-pme"],
    sections: [
      {
        heading: "A linha toca no meio da consulta",
        paragraphs: [
          "Num consultório pequeno, quem atende o telefone costuma ser a mesma pessoa que recebe o doente à porta, imprime a senha e confirma o próximo da fila. Quando o médico está no gabinete, a chamada não espera. O pedido típico é simples: uma especialidade, um dia, de manhã ou à tarde, e se há lugar esta semana.",
          "O problema não é falta de vontade. É física. Ninguém atende bem com a porta do gabinete aberta e um doente a preencher o termo de consentimento. O correio de voz enche-se de «está-me a ligar daqui a pouco» que nunca volta.",
        ],
      },
      {
        heading: "O que a chamada precisa de saber",
        paragraphs: [
          "Quem liga quase nunca quer um diagnóstico. Quer uma hora. Convém perguntar a especialidade (clínica geral, dermatologia, pediatria, medicina dentária), o nome e o telemóvel para a confirmação, e se prefere manhã ou tarde. Se a clínica trabalha com seguro, SNS ou particular, isso também entra na conversa — sem transformar o telefone num interrogatório clínico.",
          "Há um limite claro: a linha não dá conselhos médicos. Não sugere antibióticos, não interpreta sintomas, não diz «isso não é nada». Marca, remarca, cancela, indica o horário de abertura. O resto fica para a consulta.",
        ],
      },
      {
        heading: "Onde isso fica escrito",
        paragraphs: [
          "Uma marcação que só existe na cabeça de quem atendeu não serve. A hora tem de aparecer na agenda que a clínica já usa — no Atende, isso é o Google Calendar. Assim o médico vê o encaixe no telemóvel entre doentes, e quem ligou pode receber a confirmação por SMS.",
          "Se a linha for um atendedor, o tom é português de Portugal e o nome na chamada é o do consultório, não um primeiro nome de recepcionista inventado. A demo pública da Atende, no 21 021 0260, inclui o cenário de clínica precisamente por isto: ouvir a marcação, não um menu infinito.",
        ],
      },
    ],
  },
  {
    slug: "telefone-barbearia-salao",
    title: "O telefone da barbearia toca a meio do corte. Quem atende?",
    description:
      "Cadeiras ocupadas, tesoura na mão, e um pedido de sábado às 10h — o telefone da barbearia e do salão não espera pela pausa.",
    menuLabel: "Beleza e bem-estar",
    group: "setor",
    family: "Beleza e bem-estar",
    related: ["marcacao-por-telefone", "marcacoes-google-calendar"],
    sections: [
      {
        heading: "As mãos estão ocupadas",
        paragraphs: [
          "Numa barbearia ou num salão, o telefone quase nunca toca quando alguém está parado. Toca a meio do degradê, com a tinta no cabelo, ou quando o chão precisa de ser varrido antes do próximo. Atender implica parar o serviço, pedir desculpa ao cliente na cadeira, e ainda assim perder o fio à meada do pedido.",
          "Quem liga do outro lado não vê isso. Vê o número do Instagram, marca o ícone de chamada, e se ninguém atender ao segundo toque vai à cadeira da rua ao lado. Não é desleixo do barbeiro. É o telefone a competir com o trabalho que paga as contas.",
        ],
      },
      {
        heading: "O pedido de sábado às 10h",
        paragraphs: [
          "A conversa é curta quando corre bem: corte e barba, ou só corte; com o João ou com quem estiver; sábado de manhã. Se o João já tem a manhã fechada, a linha tem de o dizer e oferecer outro encaixe — não inventar um buraco na agenda para não perder o cliente.",
          "Fora de horas o padrão muda. Muita gente liga depois do fecho, no caminho para casa, a pensar na semana seguinte. Um correio de voz genérico («deixa mensagem») raramente se transforma em marcação. Quem quer o sábado liga a outra casa.",
        ],
      },
      {
        heading: "Salão e barbearia no mesmo problema",
        paragraphs: [
          "Coloração, brushing, manicure: o tempo de cadeira é mais longo, e interromper custa mais. A lógica é a mesma. O telefone tem de conhecer os serviços, a duração e a pessoa certa. A marcação só vale quando cai no Google Calendar da cadeira, não num papel ao lado da caixa registadora.",
          "A Atende trata barbearias e salões como o mesmo ofício na linha — mãos ocupadas, agenda no telemóvel. A demo ao vivo usa a barbearia; o salão entra no mesmo tipo de conversa. Não é um site à parte por cada tipo de corte.",
        ],
      },
    ],
  },
  {
    slug: "reserva-mesa-sala-cheia",
    title: "Reservar mesa com a sala cheia — o telefone no serviço de sala",
    description:
      "Sexta à noite, sala cheia, e alguém a ligar para quatro pessoas às 21h. O restaurante e o hotel continuam a ter de atender.",
    menuLabel: "Restauração e hotelaria",
    group: "setor",
    family: "Restauração e hotelaria",
    related: ["atendedor-virtual-pme", "marcacao-por-telefone"],
    sections: [
      {
        heading: "A sala não tem um segundo par de mãos",
        paragraphs: [
          "À sexta, às 21h, o telefone do restaurante toca no mesmo sítio onde se levam pratos. O empregado que atende ou deixa o serviço a meio, ou deixa a chamada cair. Nenhuma das duas opções é boa: a mesa das quatro pessoas vai para o concorrente, ou a mesa das seis que já está sentada espera pelo pão.",
          "O pedido é quase sempre o mesmo. Quantas pessoas, que hora, interior ou esplanada, cadeira para criança, alergia, aniversário. Não é um call center. É o serviço de sala a tentar não perder uma reserva enquanto serve.",
        ],
      },
      {
        heading: "Hotelaria: o mesmo telefone, outro guião",
        paragraphs: [
          "Numa pensão ou num hotel pequeno, a linha mistura reservas de mesa com check-in tardio, estacionamento e «ainda têm quarto para amanhã?». Quem está na recepção também está a entregar chaves. A conversa tem de distinguir o pedido — mesa, quarto, ou só o horário do pequeno-almoço — sem mandar a pessoa para um menu de 1-2-3 em inglês.",
          "A disponibilidade não se inventa. Se o sábado está completo, diz-se. Se há lugar às 20h mas não às 21h30, oferece-se essa hora. Uma reserva fantasma às 21h é pior do que uma chamada perdida: chega um grupo e não há mesa.",
        ],
      },
      {
        heading: "O que a linha pode fechar",
        paragraphs: [
          "Nome, telemóvel, hora, número de pessoas, e uma nota («esplanada se estiver seco»). Isso chega para a maior parte das noites. O resto — alteração do menu, conta de empresa, mesa junto à janela — pode ficar para um humano quando a sala abrandar.",
          "A demo da Atende no 21 021 0260 inclui o restaurante como um dos cinco trabalhos ao vivo. Não há uma página de hotel, outra de tasca e outra de brunch: é a mesma família, o mesmo problema de atender com a sala cheia.",
        ],
      },
    ],
  },
  {
    slug: "oficina-telefone-correio-voz",
    title: "Revisão e avaria: o telefone da oficina não pode ir para o correio de voz",
    description:
      "O mecânico está debaixo do carro. Quem liga quer deixar o carro amanhã de manhã — e o correio de voz não marca a revisão.",
    menuLabel: "Casa, auto e campo",
    group: "setor",
    family: "Casa, auto e campo",
    related: ["numero-351-negocio", "marcacao-por-telefone"],
    sections: [
      {
        heading: "O telefone no chão da oficina",
        paragraphs: [
          "Na oficina, o telemóvel da casa ou o fixo da secretária toca enquanto as mãos estão no motor. Atender com massa nas mãos é mau. Não atender é pior: o condutor que descreve um ruído no arranque deixa o carro noutro sítio. O correio de voz enche-se de matrículas ditadas à pressa, sem hora combinada.",
          "O mesmo vale para quem trabalha em casa, no campo ou na estrada — canalizador, electricista, oficina agrícola. O telefone toca no meio do serviço. A pessoa que liga quer saber se podem receber o carro, ou ir ao local, amanhã de manhã.",
        ],
      },
      {
        heading: "O que a chamada tem de apanhar",
        paragraphs: [
          "Matrícula, quilómetros, se é revisão, pneus ou um barulho novo, e se deixa o carro a abrir ou precisa de espera. Um orçamento fechado ao telefone, sem ver o carro, é uma armadilha. A linha marca o diagnóstico ou a revisão; o preço sai depois, com o carro no elevador.",
          "Quem está no terreno precisa da mesma disciplina: morada, janela horária, urgência verdadeira versus «quando puderem». Prometer «hoje à tarde» sem olhar à agenda é a forma mais rápida de ficar mal visto na freguesia.",
        ],
      },
      {
        heading: "Número visível, agenda visível",
        paragraphs: [
          "Muita oficina ainda publica um telemóvel pessoal no Facebook. Funciona até o dono estar debaixo de um comercial e o telemóvel no balcão. Um número +351 do negócio, com alguém — ou um atendedor — a marcar a entrada na agenda, separa a vida pessoal do recado da matrícula.",
          "A Atende inclui a oficina na demo ao vivo. Casa, auto e campo cabem na mesma família: o telefone não pode ser o correio de voz. A marcação cai no Google Calendar, com a matrícula na nota, para não se perder no bloco de papel ao lado do café.",
        ],
      },
    ],
  },
  {
    slug: "visitas-triagem-escritorio",
    title: "Visitas e triagem: o escritório que não perde a chamada",
    description:
      "Imobiliária em visita, advogado em reunião, ateliê a produzir. O telefone ainda tem de filtrar e marcar sem deixar o cliente no vazio.",
    menuLabel: "Serviços profissionais",
    group: "setor",
    family: "Serviços profissionais",
    related: ["marcacoes-google-calendar", "atendedor-virtual-pme"],
    sections: [
      {
        heading: "Fora do escritório, a linha continua",
        paragraphs: [
          "Uma imobiliária passa a tarde em visitas. Um contabilista está no fecho do mês. Um ateliê tem as mãos na maqueta. O telefone do escritório não sabe disso. Quem liga quer ver um T2 no sábado, enviar documentos, ou só perceber se ainda trabalham aquele tipo de processo.",
          "Se a chamada cai no correio de voz, o interessado liga à agência da rua seguinte. Em serviços profissionais o custo não é só uma hora perdida: é um processo ou uma visita que nunca entra na carteira.",
        ],
      },
      {
        heading: "Triagem sem fingir que se é o dono",
        paragraphs: [
          "A linha pode perguntar o que a pessoa procura — tipologia, zona, dia para a visita — e marcar um encaixe. Pode apontar o nome e o telemóvel e dizer que o consultor confirma. Não deve inventar o valor de avaliação, nem dar parecer jurídico, nem prometer que «o processo está resolvido».",
          "Essa fronteira importa. Quem liga aceita um atendedor que marca e filtra. Não aceita um que finge ser o advogado. O tom é de escritório português: claro, curto, sem jargão de call center.",
        ],
      },
      {
        heading: "A visita só existe na agenda",
        paragraphs: [
          "Uma visita combinada ao telefone e esquecida no bloco de notas é um casal à porta de um prédio vazio. A hora tem de ir para o Google Calendar de quem faz a visita, com a morada na descrição. O mesmo para uma reunião de contabilista ou uma chamada de retorno.",
          "A demo da Atende traz a imobiliária como um dos cinco trabalhos ao vivo. Os outros ofícios desta família — escritório, ateliê, mediação — partilham o mesmo gesto: atender, triar, marcar. Sem uma dezena de microsites a fingir que cada profissão é um produto diferente.",
        ],
      },
    ],
  },
  {
    slug: "aula-experimental-ginasio",
    title: "Aula experimental fora de horas: o ginásio continua a atender",
    description:
      "O balcão fecha, o telemóvel não. Quem quer uma aula experimental liga depois do trabalho — e espera uma hora, não um recado.",
    menuLabel: "Fitness e formação",
    group: "setor",
    family: "Fitness e formação",
    related: ["marcacao-por-telefone", "marcacoes-google-calendar"],
    sections: [
      {
        heading: "O interesse chega depois do fecho",
        paragraphs: [
          "Muita gente só pensa no ginásio a caminho de casa, às 21h ou 22h. O balcão já fechou. A recepção humana foi para casa. O Instagram ainda mostra o número. Se a chamada cai, o cartão experimental vai para a box da rua de baixo, que atendeu.",
          "Escolas de música, explicações, formação profissional: o mesmo horário enviesado. Quem trabalha de dia liga à noite. O pedido é uma aula experimental, uma visita às instalações, ou um horário de natação para crianças.",
        ],
      },
      {
        heading: "Marcar a aula, não vender o plano",
        paragraphs: [
          "Ao telefone, o que fecha o assunto é uma hora concreta: aula experimental de indoor, sexta às 19h, trazer toalha. Empurrar o plano anual na primeira chamada, sem ver a pessoa, cansa. O atendedor marca o encaixe; a conversa comercial fica para quem está no ginásio.",
          "Convém saber o que existe — aula de grupo, personal trainer, natação — e o que já não tem vaga essa semana. Inventar uma turma das 18h que está cheia só gera um no-show irritado.",
        ],
      },
      {
        heading: "A agenda dos instrutores",
        paragraphs: [
          "A aula experimental tem de aparecer no Google Calendar de quem a dá, não só no caderno da recepção. Se o treinador troca de turno, a linha não pode continuar a marcar em cima dele. Cancelar e remarcar também faz parte: uma pessoa que falhou a terça ainda pode querer a quinta.",
          "Na Atende, ginásio e formação são família de produto, não uma demo extra no picker. A clínica cobre o horário de atendimento na demo ao vivo; o ginásio entra no mesmo raciocínio de marcação. O telefone continua depois do balcão fechar.",
        ],
      },
    ],
  },
  {
    slug: "atendedor-virtual-pme",
    title: "Atendedor virtual para PME: o que faz, e o que não substitui",
    description:
      "Um atendedor virtual atende a linha da empresa em português de Portugal. Não é uma secretária no estrangeiro, nem um menu de teclas.",
    menuLabel: "Atendedor virtual",
    group: "pratico",
    related: ["marcacao-por-telefone", "numero-351-negocio"],
    sections: [
      {
        heading: "O que as pessoas querem dizer com isto",
        paragraphs: [
          "Quando uma PME portuguesa procura um atendedor virtual, quase nunca quer um chatbot no site. Quer que o telefone da loja, da clínica ou da oficina seja atendido quando as mãos estão ocupadas, ou depois do fecho. A conversa é de voz. O resultado esperado é um recado útil ou uma marcação.",
          "Não é uma central no estrangeiro a ler um guião em português do Brasil. Não é um «prima 1 para marcações» que nunca chega a uma pessoa. E não é um empregado a mais com contrato. É a linha da casa a responder em português de Portugal, com o nome do negócio.",
        ],
      },
      {
        heading: "O que pode fazer numa chamada",
        paragraphs: [
          "Atender, perceber o pedido, olhar à agenda, oferecer um horário, apontar o nome e o telemóvel, confirmar. Remarcar e cancelar quando isso já está nas regras. Transferir para o telemóvel do dono se a conversa sair do que a linha deve resolver — uma reclamação grave, um fornecedor, um assunto que só o dono fecha.",
          "Isto chega para a maior parte das chamadas de uma PME de serviços. Não chega para tudo, e não deve fingir que chega.",
        ],
      },
      {
        heading: "O que não substitui",
        paragraphs: [
          "Não substitui o profissional que corta, repara, consulta ou ensina. Não dá conselhos médicos, jurídicos ou de diagnóstico mecânico. Não publica um número +351 no mesmo segundo do pedido: em Portugal a atribuição espera aprovação. Não lê o site inteiro da empresa e fica «pronto em cinco minutos» como se o DID fosse norte-americano.",
          "A Atende é este ofício: atendedor de voz para PME, com marcação no Google Calendar e número tratado por nós. Há uma demo para ouvir — 21 021 0260 — não um catálogo de dezenas de páginas a fingir que cada ofício é um produto.",
        ],
      },
    ],
  },
  {
    slug: "marcacao-por-telefone",
    title: "Marcação por telefone: o pedido chega, a agenda responde",
    description:
      "Como uma marcação por telefone deve correr: serviço, hora, nome, telemóvel — e um sítio na agenda que não se perde.",
    menuLabel: "Marcação por telefone",
    group: "pratico",
    related: ["marcacoes-google-calendar", "atendedor-virtual-pme"],
    sections: [
      {
        heading: "O pedido cabe em quatro perguntas",
        paragraphs: [
          "Quase todas as marcações por telefone cabem no mesmo molde. Que serviço. Que dia, ou pelo menos manhã ou tarde. Quem vem. Que telemóvel para confirmar. O resto é ruído: a história da semana, o trânsito, o «é só um minuto». A linha tem de chegar às quatro perguntas sem parecer um formulário.",
          "Se o horário pedido não existe, oferece-se o mais próximo. Inventar um buraco na agenda para não perder a chamada cria um duplo problema: o cliente aparece e o profissional já tem outra pessoa na cadeira.",
        ],
      },
      {
        heading: "Confirmar é parte da marcação",
        paragraphs: [
          "Dizer a hora em voz alta no fim da chamada evita o clássico «eu pensei que era terça». Um SMS com o dia, a hora e o nome do negócio fecha o ciclo. Remarcar e cancelar usam o mesmo canal: quem marcou por telefone espera poder desmarcar por telefone.",
          "Sem um sítio partilhado, a confirmação é teatro. A hora tem de existir no Google Calendar no momento em que se diz «fica então às 16h». Não no caderno, não no WhatsApp pessoal do dono, não «depois passo isso para a agenda».",
        ],
      },
      {
        heading: "Fora de horas continua a ser marcação",
        paragraphs: [
          "Muita PME só perde chamadas depois do fecho. O pedido é o mesmo; quem atende é que não está. Um atendedor que marca fora de horas não é um extra de luxo — é a única forma de a terça-feira de manhã não começar com três recados ilegíveis.",
          "Na Atende, a marcação por telefone é o trabalho central, não um anexo. A demo no 21 021 0260 percorre clínica, barbearia, restaurante, oficina e imobiliária precisamente para se ouvir este gesto: o pedido chega, a agenda responde.",
        ],
      },
    ],
  },
  {
    slug: "numero-351-negocio",
    title: "Um número +351 para o negócio — quem pede, quem aprova, quem atende",
    description:
      "Em Portugal o número da empresa não aparece no segundo a seguir ao pedido. Quem trata do +351, o que espera aprovação, e o que a linha faz entretanto.",
    menuLabel: "Número +351",
    group: "pratico",
    related: ["atendedor-virtual-pme", "oficina-telefone-correio-voz"],
    sections: [
      {
        heading: "O número da casa não é um nick de aplicação",
        paragraphs: [
          "Muita conversa importada dos Estados Unidos fala em «número no minuto». Em Portugal um +351 de empresa passa por quem fornece o número e, muitas vezes, por aprovação regulatória. Publicar um DID que ainda não está atribuído é mandar clientes para o vazio.",
          "Por isso a Atende pede o número por si. Não há um selector de prefixos à americana. O estado fica em provisioning até haver aprovação. Só depois o número é para publicar no Google, no cartão e na montra.",
        ],
      },
      {
        heading: "Telemóvel pessoal versus linha do negócio",
        paragraphs: [
          "Enquanto o +351 não chega, muita PME continua no telemóvel do dono. Funciona até ao almoço de domingo. Separar a linha do negócio evita que o recado da oficina entre no mesmo ecrã que a família. O atendedor vive nessa linha de empresa, não no número pessoal.",
          "Portar o número que os clientes já conhecem também é caminho. Leva o tempo que a operadora e a regulação levarem. Não é um botão. Convém dizê-lo à cabeça, não depois do cliente já ter mandado imprimir os flyers.",
        ],
      },
      {
        heading: "Ouvir a linha antes de a publicar",
        paragraphs: [
          "Há um número de demonstração: 21 021 0260, ou +351 21 021 0260. Serve para ligar e ouvir o Atende a perguntar o cenário — clínica, barbearia, restaurante, oficina, imobiliária. Não é o número do vosso negócio. É a prova de que a conversa em português de Portugal existe, enquanto o vosso +351 espera a aprovação.",
          "Quando o número próprio for activo, o guião é o da casa. Até lá, o honesto é isto: tratamos do +351, a linha não acende no segundo a seguir ao pedido, e a marcação já pode ensaiar-se na demo.",
        ],
      },
    ],
  },
  {
    slug: "marcacoes-google-calendar",
    title: "A chamada entra na agenda: marcações no Google Calendar",
    description:
      "Se a hora dita ao telefone não aparece no Google Calendar, a marcação não existiu. O que a chamada deve escrever na agenda.",
    menuLabel: "Google Calendar",
    group: "pratico",
    related: ["marcacao-por-telefone", "visitas-triagem-escritorio"],
    sections: [
      {
        heading: "A agenda que já está no telemóvel",
        paragraphs: [
          "A maior parte das PME portuguesas já olha para o Google Calendar — no telemóvel, no balcão, no ecrã da recepção. Pedir-lhes um terceiro calendário «do software» é pedir-lhes que se esqueçam da marcação. A hora dita ao telefone tem de aparecer aí, com o serviço e o nome de quem vem.",
          "Se o sábado às 10h está ocupado no Calendar, a linha não o oferece. Se ficou livre porque houve um cancelamento, a linha pode voltar a usá-lo. Sem essa leitura, o atendedor é só uma conversa simpática.",
        ],
      },
      {
        heading: "O que a chamada deve escrever",
        paragraphs: [
          "Título claro («Corte e barba — Ana», «Revisão — matrícula 00-AA-00», «Visita — Rua da Prata 12»). Hora de início e fim com a duração certa do serviço. Telemóvel de contacto na descrição. Sem isto, o profissional chega ao encaixe e não sabe quem espera.",
          "Remarcar move o evento; cancelar liberta o intervalo. Fazer isto só por SMS, sem tocar no Calendar, deixa um fantasma às 16h e um buraco real às 17h.",
        ],
      },
      {
        heading: "Vários calendários, um telefone",
        paragraphs: [
          "Barbearia com três cadeiras, clínica com dois gabinetes, ginásio com dois treinadores: a chamada tem de cair no calendário certo. Se a Ana só trabalha até às 14h, a linha não marca a Ana às 16h. Isto é chato de configurar uma vez e óbvio todos os dias a seguir.",
          "A frase da Atende é esta: agendamento por voz com marcação no seu Google Calendar. Não prometemos um calendário paralelo. A demo no 21 021 0260 existe para se ouvir a hora a ser combinada — o passo seguinte, no vosso negócio, é essa hora aparecer no Calendar que já abrem de manhã.",
        ],
      },
    ],
  },
];
