import type { Messages } from '../i18n';

// Neutral Latin American Spanish ("tú"). Kodi's Spanish interface calls add-ons "complementos".
export const es: Messages = {
	tag: 'es',
	locale: 'es-419',
	steps: { label: 'Progreso del inicio de sesión', code: 'Tu código', signin: 'Inicia sesión', done: 'Vuelve a Kodi' },
	index: {
		title: 'Ingresa tu código',
		heading: 'Conecta Kodi con tu nube',
		lead: 'Ingresa el código que aparece en tu TV. Después iniciarás sesión con Google, Microsoft o Dropbox.',
		notice: 'Ingresa solo un código que muestre tu propio dispositivo Kodi, nunca uno que alguien te haya enviado.',
		codeLabel: 'Código de tu TV',
		continue: 'Continuar',
		aboutSummary: '¿Qué es esto?',
		about: (source) => `Esta página conecta los complementos <strong>Google Drive</strong>, <strong>OneDrive</strong> y <strong>Dropbox</strong> de
			<a href="https://kodi.tv/">Kodi</a>, el centro multimedia de código abierto, con tu cuenta, para que puedas reproducir tus archivos en tu TV.
			Inicias sesión en la propia página de Google, Microsoft o Dropbox: este sitio nunca te pide ni ve tu contraseña, y los complementos solo pueden leer tus archivos.
			Es un proyecto de código abierto: <a href="${source}">código fuente</a>, <a href="/privacypolicy">política de privacidad</a>.`,
	},
	help: {
		summary: '¿Tienes problemas?',
		network: 'Usa un teléfono o una computadora conectados a la misma red (Wi-Fi) que tu dispositivo Kodi.',
		expired: 'Los códigos caducan después de unos minutos. Si el tuyo caducó, vuelve a iniciar el proceso en Kodi.',
		sourceId: (id) => `Tu source id es <strong>${id}</strong>. Debe coincidir con uno de los source id que muestra Kodi.`,
		forum: '¿Sigues con problemas? Pregunta en el foro de soporte (en inglés):',
	},
	success: {
		title: 'Sesión iniciada',
		heading: 'Iniciaste sesión',
		lead: 'Kodi terminará de agregar tu cuenta en unos segundos. Ya puedes cerrar esta página.',
		another: 'Ingresar otro código',
	},
	funding: {
		title: 'Ayuda a que este inicio de sesión siga funcionando',
		text: 'Este servidor de inicio de sesión gratuito lo mantiene un solo desarrollador. El hospedaje cuesta dinero, y Google exige una evaluación de seguridad pagada cada año para que el inicio de sesión de Google Drive siga funcionando. Si el complemento te resulta útil, considera hacer una aportación.',
		progress: (raised, goal) => `${raised} de ${goal} recaudados este año`,
		button: 'Apoya el proyecto',
	},
	failure: {
		title: 'Error al iniciar sesión',
		heading: 'No se completó el inicio de sesión',
		lead: 'Vuelve a iniciar el proceso desde Kodi para obtener un código nuevo.',
		retry: 'Ingresar un código nuevo',
	},
	errors: {
		'error.pin.invalid': 'Ese código no funcionó. Verifica que coincida con el de tu TV y que este dispositivo esté en la misma red que Kodi.',
		'failure.denied': 'No se concedió el acceso. Kodi necesita tu permiso para leer tus archivos.',
		'failure.code.1': 'Tu código ya no es válido.',
		'failure.code.2': 'No se pudo obtener la autorización del proveedor. Es posible que tu cuenta no tenga una unidad.',
		'failure.code.3': 'La solicitud de inicio de sesión no es válida.',
		'failure.code.4': 'Este inicio de sesión se terminó en un navegador distinto al que lo empezó. Vuelve a empezar desde Kodi y termina en el mismo navegador.',
	},
	tooMany: { title: 'Demasiados intentos', text: 'Espera un minuto y vuelve a intentarlo.' },
	notFound: { title: 'Página no encontrada', text: 'No hay nada en esta dirección.' },
	footer: {
		privacy: 'Política de privacidad',
		source: 'Código fuente',
		disclaimer: 'Sin afiliación ni respaldo de Team Kodi, Google, Microsoft ni Dropbox.',
	},
	privacy: {
		title: 'Política de privacidad',
		body: (source) => `
	<h1>Política de privacidad</h1>
	<p class="meta">Última actualización: 11 de octubre de 2026</p>
	<p class="meta">Esta es una traducción. Si hay alguna diferencia, prevalece la <a href="/privacypolicy?lang=en">versión original en inglés</a>.</p>

	<p>
		Esta política cubre los complementos <strong>Google Drive</strong>, <strong>OneDrive</strong> y <strong>Dropbox</strong> para Kodi y este servicio de inicio de sesión.
		Son proyectos de código abierto desarrollados y operados por Carlos Guzman (cguZZman). No tienen afiliación ni respaldo de
		Team Kodi, Google, Microsoft ni Dropbox.
	</p>

	<h2>En resumen</h2>
	<ul>
		<li>Los complementos solo <strong>leen</strong> tus archivos para que puedas explorarlos y reproducirlos en Kodi. Nunca cambian ni eliminan nada.</li>
		<li>Tus archivos van directamente entre tu dispositivo Kodi y Google, Microsoft o Dropbox. Nunca pasan por este servidor.</li>
		<li>Este servidor solo ayuda a tu dispositivo Kodi a iniciar sesión. Guarda los datos del inicio de sesión en memoria durante 3 minutos como máximo y nunca los almacena.</li>
		<li>Nada se vende, se comparte con terceros ni se usa para publicidad.</li>
	</ul>

	<h2>A qué acceden los complementos y por qué</h2>
	<h3>Google Drive</h3>
	<dl class="scopes">
		<dt><code>drive.readonly</code> Ver y descargar tus archivos de Google Drive</dt>
		<dd>Listar tus carpetas, unidades compartidas y archivos, y reproducirlos o mostrarlos en Kodi. Con este permiso el complemento también lee el nombre de tu cuenta de Drive, para mostrarlo en el menú de Kodi. Acceso de solo lectura.</dd>
	</dl>
	<h3>OneDrive</h3>
	<dl class="scopes">
		<dt><code>Files.Read.All</code></dt>
		<dd>Listar y reproducir tus archivos de OneDrive, incluidos los que otras personas compartieron contigo. Acceso de solo lectura.</dd>
		<dt><code>Sites.Read.All</code></dt>
		<dd>Listar y reproducir archivos de bibliotecas de documentos de SharePoint (cuentas profesionales o educativas). Acceso de solo lectura.</dd>
		<dt><code>User.Read</code></dt>
		<dd>Mostrar el nombre de tu cuenta en el menú de Kodi.</dd>
		<dt><code>offline_access</code></dt>
		<dd>Mantener la sesión iniciada sin pedirte que vuelvas a iniciar sesión cada hora.</dd>
	</dl>
	<h3>Dropbox</h3>
	<dl class="scopes">
		<dt><code>account_info.read</code></dt>
		<dd>Mostrar el nombre de tu cuenta en el menú de Kodi.</dd>
		<dt><code>files.metadata.read</code></dt>
		<dd>Listar tus carpetas y archivos, y buscar en ellos. Acceso de solo lectura.</dd>
		<dt><code>files.content.read</code></dt>
		<dd>Reproducir y mostrar tus archivos (videos, música, imágenes y subtítulos). Acceso de solo lectura.</dd>
	</dl>

	<h2>Cómo circulan tus datos</h2>
	<h3>Tus archivos</h3>
	<p>
		Tu dispositivo Kodi pide los nombres de archivo, las carpetas, las miniaturas y el contenido de los archivos directamente a Google,
		Microsoft o Dropbox, y solo se usan para mostrarlos y reproducirlos en Kodi. Nunca pasan por este servidor.
	</p>
	<h3>Inicio de sesión</h3>
	<p>
		Cuando ingresas el código de tu TV, este servidor te envía a Google, Microsoft o Dropbox para iniciar sesión. Cuando das tu autorización, el
		proveedor envía a este servidor un código de autorización de un solo uso. El servidor lo cambia por tokens de acceso y de
		actualización, y los guarda <strong>en memoria</strong> hasta que tu dispositivo Kodi los recoge, como máximo 3 minutos después. Luego
		se eliminan. Los tokens nunca se escriben en disco ni en registros.
	</p>
	<p>
		Mientras inicias sesión, el servidor guarda una cookie temporal en tu navegador. Sirve para asegurar que el inicio de sesión termine
		en el mismo navegador que lo empezó, para que nadie pueda engañarte para autorizar un inicio de sesión en su dispositivo. Se elimina
		al terminar el inicio de sesión y caduca a los 5 minutos como máximo. No se usa para nada más.
	</p>
	<p>
		Para asegurar que el código se ingresa desde la misma red que tu dispositivo Kodi, el servidor guarda tu dirección IP pública en
		memoria junto con el código, también durante 3 minutos como máximo.
	</p>
	<h3>Mantener la sesión iniciada</h3>
	<p>
		Aproximadamente una vez por hora, tu dispositivo Kodi envía su token de actualización a este servidor. El servidor agrega las
		credenciales de la aplicación, reenvía la solicitud a Google, Microsoft o Dropbox y devuelve el nuevo token de acceso a tu dispositivo. No
		guarda los tokens ni los registra.
	</p>
	<h3>Protección contra abusos</h3>
	<p>
		Para proteger el servicio, el servidor cuenta las solicitudes por dirección IP, y las actualizaciones de tokens por un hash
		irreversible del token de actualización. Estos contadores se guardan en memoria durante un minuto y nunca se almacenan.
	</p>
	<h3>Hospedaje</h3>
	<p>
		Este servidor funciona en Cloudflare Workers. Cloudflare recibe cada solicitud, incluida tu dirección IP, para poder entregarla,
		según la <a href="https://www.cloudflare.com/privacypolicy/">política de privacidad de Cloudflare</a>. Los registros de solicitudes
		están desactivados para este servicio: el único registro que guarda son sus propios mensajes de error (por ejemplo, que falló una
		solicitud de token y el código de error del proveedor), que nunca contienen tokens ni direcciones IP, y que Cloudflare elimina a los
		pocos días.
	</p>

	<h2>Qué se guarda en tu dispositivo Kodi</h2>
	<p>
		Para cada cuenta, los complementos guardan el ID y el nombre de tu cuenta, la lista de tus unidades y los tokens de acceso y de
		actualización. Se guardan en la carpeta de datos del complemento en tu dispositivo Kodi, junto con una caché temporal de listados de
		carpetas que caduca a los pocos minutos (5 de forma predeterminada; se puede cambiar en la configuración del complemento).
	</p>

	<h2>Cómo se protegen tus datos</h2>
	<p>Los datos de usuario de Google y los tokens de inicio de sesión son sensibles, y se protegen así:</p>
	<ul>
		<li><strong>Cifrado en tránsito:</strong> todo el tráfico entre tu navegador, tu dispositivo Kodi, este servidor, Google, Microsoft y Dropbox usa HTTPS (TLS). Este servidor solo acepta HTTPS e indica a los navegadores que nunca usen HTTP sin cifrar (HSTS).</li>
		<li><strong>Minimización de datos:</strong> solo se pide acceso de solo lectura. Este servidor nunca pide tus archivos ni sus detalles, y no tiene ninguna base de datos de usuarios, cuentas ni datos de usuario de Google.</li>
		<li><strong>Manejo de tokens:</strong> en este servidor, los tokens solo existen en memoria, como máximo 3 minutos durante el inicio de sesión o mientras dura una solicitud de actualización. Nunca se escriben en disco, en una base de datos ni en registros. En tu dispositivo Kodi, los complementos quitan los tokens de todo lo que escriben en el registro de Kodi.</li>
		<li><strong>Control de acceso:</strong> un código de inicio de sesión solo se puede usar desde la misma red que el dispositivo Kodi que lo pidió, debe terminarse en el mismo navegador que lo empezó (una cookie de un solo uso y PKCE), y los tokens resultantes solo se pueden recoger con un secreto aleatorio que solo conoce ese dispositivo Kodi. Los códigos caducan a los 3 minutos y funcionan una sola vez. Las solicitudes tienen límites de frecuencia para evitar abusos.</li>
		<li><strong>Credenciales de la aplicación:</strong> los secretos de cliente se guardan en el almacenamiento cifrado de secretos del proveedor de hospedaje, no en el código fuente.</li>
		<li><strong>Sin acceso humano:</strong> nadie, ni siquiera el desarrollador, puede ver tus archivos ni tus tokens a través de este servicio.</li>
		<li><strong>Código abierto:</strong> los complementos y este servidor son de código abierto, así que cualquiera puede revisar cómo manejan los datos.</li>
	</ul>

	<h2>Conservación y eliminación de los datos de usuario de Google</h2>
	<ul>
		<li><strong>En este servidor:</strong> no se conservan datos de usuario de Google. Los tokens de inicio de sesión se eliminan en cuanto tu dispositivo Kodi los recoge, y como máximo 3 minutos después de empezar el inicio de sesión. Las solicitudes de actualización se reenvían a Google y se responden sin guardar nada.</li>
		<li><strong>En tu dispositivo Kodi:</strong> el ID y el nombre de tu cuenta, la lista de unidades y los tokens se quedan en tu dispositivo hasta que eliminas la cuenta en el complemento. Los listados de carpetas en caché caducan a los pocos minutos.</li>
		<li><strong>Eliminar tus datos:</strong> elimina la cuenta en Kodi (abre el complemento, abre el menú contextual de la cuenta y elige eliminarla). Así se borran sus tokens y datos de cuenta de tu dispositivo. Desinstalar el complemento y borrar su carpeta de datos elimina todo lo que guardó.</li>
		<li>
			<strong>Revocar el acceso:</strong> puedes revocar el acceso del complemento en cualquier momento en los
			<a href="https://myaccount.google.com/permissions">permisos de tu cuenta de Google</a>, tu
			<a href="https://account.live.com/consent/Manage">cuenta personal de Microsoft</a>, tu
			<a href="https://myapplications.microsoft.com/">cuenta profesional o educativa de Microsoft</a> o las
			<a href="https://www.dropbox.com/account/connected_apps">aplicaciones conectadas de tu cuenta de Dropbox</a>. Los tokens dejan de funcionar de inmediato.
		</li>
		<li>Como este servidor no guarda datos sobre ti, no hay nada que eliminar en el servidor. Si tienes preguntas sobre tus datos, usa el contacto de abajo.</li>
	</ul>

	<h2>Informes de errores</h2>
	<p>
		Los complementos no envían informes de errores. Los errores solo se escriben en el registro de Kodi en tu dispositivo, sin tokens.
		Versiones anteriores de los complementos tenían una opción <em>Report errors</em>; este servicio no acepta ni guarda esos informes.
	</p>

	<h2>Servicios de API de Google</h2>
	<p>
		El uso y la transferencia de la información recibida de las API de Google cumplen la
		<a href="https://developers.google.com/terms/api-services-user-data-policy">Política de Datos del Usuario de los Servicios de API de Google</a>,
		incluidos los requisitos de Uso Limitado. Los datos de usuario de Google nunca se venden, se usan para publicidad, se transfieren a
		terceros ni se usan para entrenar modelos de IA.
	</p>

	<h2>Donaciones</h2>
	<p>
		Si decides apoyar el proyecto, la plataforma de donaciones gestiona tu donación según su propia política de privacidad. Las
		donaciones no se vinculan con tus cuentas de Kodi.
	</p>

	<h2>Contacto</h2>
	<p>
		Preguntas sobre esta política: abre un issue en
		<a href="${source}/issues">${source.replace('https://', '')}</a> (en inglés o español).
	</p>
`,
	},
};
