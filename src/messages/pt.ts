import type { Messages } from '../i18n';

// Brazilian Portuguese. Kodi's Brazilian interface calls add-ons "add-ons".
export const pt: Messages = {
	tag: 'pt-BR',
	locale: 'pt-BR',
	steps: { label: 'Progresso do login', code: 'Seu código', signin: 'Entre na conta', done: 'Volte ao Kodi' },
	index: {
		title: 'Digite seu código',
		heading: 'Conecte o Kodi à sua nuvem',
		lead: 'Digite o código que aparece na sua TV. Depois, você vai entrar com sua conta Google, Microsoft ou Dropbox.',
		notice: 'Digite apenas um código mostrado pelo seu próprio Kodi, nunca um que alguém tenha enviado para você.',
		codeLabel: 'Código da sua TV',
		continue: 'Continuar',
		aboutSummary: 'O que é isto?',
		about: (source) => `Esta página conecta os add-ons <strong>Google Drive</strong>, <strong>OneDrive</strong> e <strong>Dropbox</strong> do
			<a href="https://kodi.tv/">Kodi</a>, a central de mídia de código aberto, à sua conta, para você reproduzir seus arquivos na TV.
			Você entra na conta na própria página do Google, da Microsoft ou do Dropbox: este site nunca pede nem vê sua senha, e os add-ons só podem ler seus arquivos.
			É um projeto de código aberto: <a href="${source}">código-fonte</a>, <a href="/privacypolicy">política de privacidade</a>.`,
	},
	help: {
		summary: 'Está com problemas?',
		network: 'Use um celular ou computador conectado à mesma rede (Wi-Fi) que o seu Kodi.',
		expired: 'Os códigos expiram depois de alguns minutos. Se o seu expirou, comece o login de novo no Kodi.',
		sourceId: (id) => `Seu source id é <strong>${id}</strong>. Ele deve ser igual a um dos source ids mostrados no Kodi.`,
		forum: 'Ainda com problemas? Pergunte no fórum de suporte (em inglês):',
	},
	success: {
		title: 'Login concluído',
		heading: 'Pronto, você entrou',
		lead: 'O Kodi vai terminar de adicionar sua conta em alguns segundos. Você já pode fechar esta página.',
		another: 'Digitar outro código',
	},
	funding: {
		title: 'Ajude a manter este login funcionando',
		text: 'Este serviço de login gratuito é mantido por um único desenvolvedor, para todos que usam os add-ons do Google Drive, OneDrive e Dropbox. Mantê-lo no ar, e manter os add-ons funcionando quando os serviços mudam, exige tempo e dinheiro. Se os add-ons forem úteis para você, considere contribuir.',
		progress: (raised, goal) => `${raised} de ${goal} arrecadados este ano`,
		button: 'Apoie o projeto',
	},
	failure: {
		title: 'Falha no login',
		heading: 'O login não foi concluído',
		lead: 'Comece o login de novo no Kodi para receber um novo código.',
		retry: 'Digitar um novo código',
	},
	errors: {
		'error.pin.invalid': 'Esse código não funcionou. Confira se ele é igual ao da sua TV e se este aparelho está na mesma rede que o Kodi.',
		'failure.denied': 'O acesso não foi concedido. O Kodi precisa da sua permissão para ler seus arquivos.',
		'failure.code.1': 'Seu código não é mais válido.',
		'failure.code.2': 'Não foi possível obter a autorização do provedor. Talvez sua conta não tenha um drive.',
		'failure.code.3': 'A solicitação de login é inválida.',
		'failure.code.4': 'Este login foi concluído em um navegador diferente do que o iniciou. Comece de novo no Kodi e termine no mesmo navegador.',
	},
	tooMany: { title: 'Muitas tentativas', text: 'Aguarde um minuto e tente de novo.' },
	notFound: { title: 'Página não encontrada', text: 'Não há nada neste endereço.' },
	footer: {
		privacy: 'Política de privacidade',
		source: 'Código-fonte',
		support: 'Apoie o projeto',
		disclaimer: 'Sem afiliação ou endosso da Team Kodi, do Google, da Microsoft ou do Dropbox.',
	},
	privacy: {
		title: 'Política de privacidade',
		body: (source) => `
	<h1>Política de privacidade</h1>
	<p class="meta">Última atualização: 14 de outubro de 2026</p>
	<p class="meta">Esta é uma tradução. Se houver alguma diferença, vale a <a href="/privacypolicy?lang=en">versão original em inglês</a>.</p>

	<p>
		Esta política cobre os add-ons <strong>Google Drive</strong>, <strong>OneDrive</strong> e <strong>Dropbox</strong> para Kodi e este serviço de login.
		São projetos de código aberto desenvolvidos e mantidos por Carlos Guzman (cguZZman). Eles não têm afiliação nem endosso da
		Team Kodi, do Google, da Microsoft ou do Dropbox.
	</p>

	<h2>Resumo</h2>
	<ul>
		<li>Os add-ons apenas <strong>leem</strong> seus arquivos para você navegar e reproduzi-los no Kodi. Eles nunca alteram nem excluem nada.</li>
		<li>Seus arquivos vão diretamente entre o seu Kodi e o Google, a Microsoft ou o Dropbox. Eles nunca passam por este servidor.</li>
		<li>Este servidor só ajuda o seu Kodi a entrar na conta. Ele mantém os dados do login na memória por no máximo 3 minutos e nunca os armazena.</li>
		<li>Nada é vendido, compartilhado com terceiros ou usado para publicidade.</li>
	</ul>

	<h2>O que os add-ons acessam e por quê</h2>
	<h3>Google Drive</h3>
	<dl class="scopes">
		<dt><code>drive.readonly</code> Ver e baixar seus arquivos do Google Drive</dt>
		<dd>Listar suas pastas, drives compartilhados e arquivos, e reproduzi-los ou exibi-los no Kodi. Com essa permissão o add-on também lê o nome da sua conta do Drive, para mostrá-lo no menu do Kodi. Acesso somente leitura.</dd>
	</dl>
	<h3>OneDrive</h3>
	<dl class="scopes">
		<dt><code>Files.Read.All</code></dt>
		<dd>Listar e reproduzir seus arquivos do OneDrive, incluindo os que foram compartilhados com você. Acesso somente leitura.</dd>
		<dt><code>Sites.Read.All</code></dt>
		<dd>Listar e reproduzir arquivos de bibliotecas de documentos do SharePoint (contas corporativas ou de estudante). Acesso somente leitura.</dd>
		<dt><code>User.Read</code></dt>
		<dd>Mostrar o nome da sua conta no menu do Kodi.</dd>
		<dt><code>offline_access</code></dt>
		<dd>Manter você conectado sem pedir um novo login a cada hora.</dd>
	</dl>
	<h3>Dropbox</h3>
	<dl class="scopes">
		<dt><code>account_info.read</code></dt>
		<dd>Mostrar o nome da sua conta no menu do Kodi.</dd>
		<dt><code>files.metadata.read</code></dt>
		<dd>Listar suas pastas e arquivos e pesquisar neles. Acesso somente leitura.</dd>
		<dt><code>files.content.read</code></dt>
		<dd>Reproduzir e exibir seus arquivos (vídeos, músicas, imagens e legendas). Acesso somente leitura.</dd>
	</dl>

	<h2>Como seus dados circulam</h2>
	<h3>Seus arquivos</h3>
	<p>
		Nomes de arquivos, pastas, miniaturas e o conteúdo dos arquivos são pedidos pelo seu Kodi diretamente ao Google, à Microsoft ou ao Dropbox e
		só são usados para exibi-los e reproduzi-los no Kodi. Eles nunca passam por este servidor.
	</p>
	<h3>Login</h3>
	<p>
		Quando você digita o código da sua TV, este servidor envia você ao Google, à Microsoft ou ao Dropbox para entrar na conta. Depois que você
		autoriza, o provedor envia a este servidor um código de autorização de uso único. O servidor troca esse código por tokens de
		acesso e de atualização e os mantém <strong>na memória</strong> até que o seu Kodi os busque, no máximo 3 minutos depois. Em
		seguida, eles são excluídos. Os tokens nunca são gravados em disco nem em logs.
	</p>
	<p>
		Durante o login, o servidor grava um cookie temporário no seu navegador. Ele garante que o login seja concluído no mesmo navegador
		que o iniciou, para que ninguém consiga enganar você a autorizar um login no aparelho dessa pessoa. Ele é removido quando o login
		termina e expira em no máximo 5 minutos. Ele não é usado para mais nada.
	</p>
	<p>
		Para garantir que o código seja digitado na mesma rede que o seu Kodi, o servidor mantém seu endereço IP público na memória junto
		com o código, também por no máximo 3 minutos.
	</p>
	<h3>Continuar conectado</h3>
	<p>
		Mais ou menos uma vez por hora, o seu Kodi envia o token de atualização a este servidor. O servidor adiciona as credenciais do
		aplicativo, encaminha a solicitação ao Google, à Microsoft ou ao Dropbox e devolve o novo token de acesso ao seu aparelho. Ele não guarda nem
		registra os tokens.
	</p>
	<h3>Proteção contra abusos</h3>
	<p>
		Para proteger o serviço, o servidor conta as solicitações por endereço IP, e as atualizações de token por um hash irreversível do
		token de atualização. Esses contadores ficam na memória por um minuto e nunca são armazenados.
	</p>
	<h3>Hospedagem</h3>
	<p>
		Este servidor roda no Cloudflare Workers. A Cloudflare recebe cada solicitação, incluindo seu endereço IP, para poder entregá-la,
		conforme a <a href="https://www.cloudflare.com/privacypolicy/">política de privacidade da Cloudflare</a>. Os logs de solicitações
		estão desativados para este serviço: o único log mantido são as próprias mensagens de erro do serviço (por exemplo, que uma
		solicitação de token falhou e o código de erro do provedor), que nunca contêm tokens nem endereços IP e são excluídas pela
		Cloudflare após alguns dias.
	</p>

	<h3>Estatísticas de uso</h3>
	<p>
		Para saber como o serviço é usado, o servidor registra contagens anônimas no Cloudflare Workers Analytics Engine. Por exemplo:
		que um login com o Google Drive foi concluído, que uma renovação de token funcionou ou falhou (com o código de erro do
		provedor), o país da solicitação segundo a Cloudflare, e as versões do complemento, do Kodi e do Python informadas pelo seu
		dispositivo Kodi. Para contar quantas contas são usadas por dia, o servidor guarda na memória, somente durante aquele dia, um
		hash irreversível de cada token de renovação que já viu; somente o número de contas é registrado. Esses registros nunca contêm
		endereços IP, tokens, nomes de conta, informações de arquivos nem nada que identifique você ou sua conta, e são apagados após
		três meses.
	</p>

	<h2>O que fica guardado no seu Kodi</h2>
	<p>
		Para cada conta, os add-ons guardam o ID e o nome da sua conta, a lista dos seus drives e os tokens de acesso e de atualização.
		Eles ficam na pasta de dados do add-on no seu Kodi, junto com um cache temporário das listas de pastas que expira em alguns minutos
		(5 por padrão, ajustável nas configurações do add-on).
	</p>

	<h2>Como seus dados são protegidos</h2>
	<p>Os dados de usuário do Google e os tokens de login são sensíveis e são protegidos assim:</p>
	<ul>
		<li><strong>Criptografia em trânsito:</strong> todo o tráfego entre o seu navegador, o seu Kodi, este servidor, o Google, a Microsoft e o Dropbox usa HTTPS (TLS). Este servidor só aceita HTTPS e instrui os navegadores a nunca usar HTTP sem criptografia (HSTS).</li>
		<li><strong>Minimização de dados:</strong> só é pedido acesso somente leitura. Este servidor nunca pede seus arquivos nem os detalhes deles, e não tem nenhum banco de dados de usuários, contas ou dados de usuário do Google.</li>
		<li><strong>Tratamento de tokens:</strong> neste servidor, os tokens só existem na memória, por no máximo 3 minutos durante o login ou enquanto dura uma solicitação de atualização. Eles nunca são gravados em disco, em banco de dados ou em logs. No seu Kodi, os add-ons removem os tokens de tudo o que gravam no log do Kodi.</li>
		<li><strong>Controle de acesso:</strong> um código de login só pode ser usado na mesma rede que o Kodi que o pediu, precisa ser concluído no mesmo navegador que o iniciou (um cookie de uso único e PKCE), e os tokens resultantes só podem ser buscados com um segredo aleatório que só esse Kodi conhece. Os códigos expiram em 3 minutos e funcionam uma única vez. As solicitações têm limites de frequência para evitar abusos.</li>
		<li><strong>Credenciais do aplicativo:</strong> os segredos de cliente ficam no armazenamento criptografado de segredos do provedor de hospedagem, não no código-fonte.</li>
		<li><strong>Sem acesso humano:</strong> ninguém, nem mesmo o desenvolvedor, consegue ver seus arquivos ou tokens por meio deste serviço.</li>
		<li><strong>Código aberto:</strong> os add-ons e este servidor são de código aberto, então qualquer pessoa pode verificar como eles tratam os dados.</li>
	</ul>

	<h2>Retenção e exclusão dos dados de usuário do Google</h2>
	<ul>
		<li><strong>Neste servidor:</strong> nenhum dado de usuário do Google é retido. Os tokens de login são excluídos assim que o seu Kodi os busca, e no máximo 3 minutos depois do início do login. As solicitações de atualização são repassadas ao Google e respondidas sem guardar nada.</li>
		<li><strong>No seu Kodi:</strong> o ID e o nome da sua conta, a lista de drives e os tokens ficam no seu aparelho até você remover a conta no add-on. As listas de pastas em cache expiram em alguns minutos.</li>
		<li><strong>Excluir seus dados:</strong> remova a conta no Kodi (abra o add-on, abra o menu de contexto da conta e escolha removê-la). Isso apaga os tokens e os dados da conta do seu aparelho. Desinstalar o add-on e apagar a pasta de dados dele remove tudo o que ele guardou.</li>
		<li>
			<strong>Revogar o acesso:</strong> você pode revogar o acesso do add-on a qualquer momento nas
			<a href="https://myaccount.google.com/permissions">permissões da sua Conta do Google</a>, na sua
			<a href="https://account.live.com/consent/Manage">conta pessoal da Microsoft</a>, na sua
			<a href="https://myapplications.microsoft.com/">conta corporativa ou de estudante da Microsoft</a> ou nos
			<a href="https://www.dropbox.com/account/connected_apps">apps conectados da sua conta do Dropbox</a>. Os tokens param de funcionar na hora.
		</li>
		<li>Como este servidor não guarda dados sobre você, não há nada a excluir no servidor. Se tiver dúvidas sobre seus dados, use o contato abaixo.</li>
	</ul>

	<h2>Relatórios de erros</h2>
	<p>
		Os add-ons não enviam relatórios de erros. Os erros só são gravados no log do Kodi no seu aparelho, sem os tokens.
		Versões antigas dos add-ons tinham uma opção <em>Report errors</em>; este serviço não aceita nem guarda esses relatórios.
	</p>

	<h2>Serviços de API do Google</h2>
	<p>
		O uso e a transferência das informações recebidas das APIs do Google seguem a
		<a href="https://developers.google.com/terms/api-services-user-data-policy">Política de Dados do Usuário dos Serviços de API do Google</a>,
		incluindo os requisitos de Uso Limitado. Os dados de usuário do Google nunca são vendidos, usados para publicidade, transferidos a
		terceiros ou usados para treinar modelos de IA.
	</p>

	<h2>Doações</h2>
	<p>
		Se você decidir apoiar o projeto, a doação é processada pela plataforma de doações, de acordo com a política de privacidade dela.
		As doações não são vinculadas às suas contas do Kodi.
	</p>

	<h2>Contato</h2>
	<p>
		Dúvidas sobre esta política: abra uma issue em
		<a href="${source}/issues">${source.replace('https://', '')}</a> (em inglês ou espanhol).
	</p>
`,
	},
};
