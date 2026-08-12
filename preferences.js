(function () {
  "use strict";

  const STORAGE_THEME = "colegiolibre-theme";
  const STORAGE_LANGUAGE = "colegiolibre-language";
  const root = document.documentElement;
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)");
  const storedTheme = localStorage.getItem(STORAGE_THEME);
  const storedLanguage = localStorage.getItem(STORAGE_LANGUAGE);
  let theme = storedTheme === "dark" || storedTheme === "light"
    ? storedTheme
    : systemDark?.matches
      ? "dark"
      : "light";
  let language = storedLanguage === "en" ? "en" : "es";
  let observer = null;
  let translating = false;
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  const translationQueue = new Set();
  let translationTask = null;
  const protectedContentSelector = [
    "[data-no-translate]",
    "[data-product-title]",
    ".product-title",
    ".publication-card__title",
    ".similar-card__title",
    ".school-product-card__title",
    "#product-title",
    "script",
    "style",
    "code",
    "pre"
  ].join(", ");

  const translations = new Map(Object.entries({
    "Saltar al contenido": "Skip to content",
    "ColegioLibre | Marketplace de material escolar usado": "ColegioLibre | Used school supplies marketplace",
    "Ingresar | ColegioLibre": "Sign in | ColegioLibre",
    "ColegioLibre | Publicá tu producto": "ColegioLibre | List your product",
    "ColegioLibre | Cargando publicación": "ColegioLibre | Loading listing",
    "ColegioLibre | Mensajes": "ColegioLibre | Messages",
    "ColegioLibre | Mi perfil": "ColegioLibre | My profile",
    "ColegioLibre | Comunidad escolar": "ColegioLibre | School community",
    "Administración | ColegioLibre": "Administration | ColegioLibre",
    "Administrador de colegios | ColegioLibre": "School administrator | ColegioLibre",
    "Perfil público | ColegioLibre": "Public profile | ColegioLibre",
    "Perfil público": "Public profile",
    "Centro de ayuda | ColegioLibre": "Help Center | ColegioLibre",
    "Privacidad | ColegioLibre": "Privacy | ColegioLibre",
    "Productos prohibidos | ColegioLibre": "Prohibited products | ColegioLibre",
    "Seguridad | ColegioLibre": "Safety | ColegioLibre",
    "Términos de uso | ColegioLibre": "Terms of Use | ColegioLibre",
    "Buscar material escolar": "Search school supplies",
    "Mensajes": "Messages",
    "Favoritos": "Favorites",
    "ColegioLibre | Favoritos": "ColegioLibre | Favorites",
    "TU COLECCIÓN": "YOUR COLLECTION",
    "Productos favoritos": "Favorite products",
    "Guardá materiales interesantes y volvé a encontrarlos sin tener que buscarlos otra vez.": "Save interesting school items and find them again without searching.",
    "productos guardados": "saved products",
    "producto guardado": "saved product",
    "Buscar dentro de tus favoritos": "Search your favorites",
    "Buscar dentro de favoritos": "Search favorites",
    "Ordenar por": "Sort by",
    "Guardados recientemente": "Recently saved",
    "Menor precio": "Lowest price",
    "Mayor precio": "Highest price",
    "Publicados recientemente": "Recently listed",
    "Todavía no guardaste productos": "You have not saved any products yet",
    "Cuando encuentres algo que te interese, tocá el corazón para guardarlo acá.": "When you find something interesting, tap the heart to save it here.",
    "No encontramos coincidencias": "No matches found",
    "Probá con otro título, categoría, colegio o ubicación.": "Try another title, category, school or location.",
    "No pudimos cargar tus favoritos": "We could not load your favorites",
    "Revisá tu conexión e intentá nuevamente.": "Check your connection and try again.",
    "Reintentar": "Try again",
    "Quitar de favoritos": "Remove from favorites",
    "Producto quitado de favoritos.": "Product removed from favorites.",
    "No se pudo quitar el producto de favoritos.": "The product could not be removed from favorites.",
    "Compartir": "Share",
    "Enlace copiado.": "Link copied.",
    "No se pudo compartir la publicación.": "The listing could not be shared.",
    "Desactivar cuenta": "Deactivate account",
    "Desactivando...": "Deactivating...",
    "La cuenta no fue desactivada.": "The account was not deactivated.",
    "Historial": "History",
    "Historial administrativo": "Administrative history",
    "Registro de cambios sensibles en productos, reportes y cuentas.": "Record of sensitive changes to products, reports and accounts.",
    "No hay acciones administrativas para estos filtros.": "There are no administrative actions for these filters.",
    "Ver detalles técnicos": "View technical details",
    "Iniciar sesión": "Sign in",
    "Cerrar sesión": "Sign out",
    "Salir": "Sign out",
    "Mi cuenta": "My account",
    "Mi perfil": "My profile",
    "Ajustes": "Settings",
    "Publicá": "Sell",
    "Publicar": "Sell",
    "Publicá tu producto": "List your product",
    "Publicar producto": "List product",
    "Publicar nuevo producto": "List a new product",
    "Marketplace": "Marketplace",
    "Categorías": "Categories",
    "Categoría": "Category",
    "Todas las categorías": "All categories",
    "Libros": "Books",
    "Apuntes": "Notes",
    "Cuadernos": "Notebooks",
    "Útiles": "Supplies",
    "Mochilas": "Backpacks",
    "Tecnología": "Technology",
    "Uniformes": "Uniforms",
    "Otros": "Other",
    "Otro": "Other",
    "¿Cómo funciona?": "How does it work?",
    "Cómo funciona": "How it works",
    "Ayuda": "Help",
    "Centro de ayuda": "Help Center",
    "Cómo comprar": "How to buy",
    "Cómo vender": "How to sell",
    "Seguridad": "Safety",
    "Privacidad": "Privacy",
    "Términos": "Terms",
    "Términos de uso": "Terms of Use",
    "Productos prohibidos": "Prohibited products",
    "Volver": "Back",
    "Inicio": "Home",
    "Volver al inicio": "Back to home",
    "Volver al marketplace": "Back to marketplace",
    "Ver sitio": "View site",
    "Explorá productos": "Browse products",
    "Ver cómo funciona": "See how it works",
    "Ver cómo comprar": "Learn how to buy",
    "Ver todos": "View all",
    "Más información": "Learn more",
    "Mi colegio": "My school",
    "Mi zona": "My area",
    "Toda Argentina": "All Argentina",
    "Viendo productos de toda Argentina": "Viewing products from all Argentina",
    "Explorá por categoría": "Browse by category",
    "Filtrar por estado:": "Filter by condition:",
    "Ordenar por": "Sort by",
    "Recomendados": "Recommended",
    "Más recientes": "Newest",
    "Menor precio": "Lowest price",
    "Mayor precio": "Highest price",
    "Nivel:": "Level:",
    "Nivel": "Level",
    "Año:": "Year:",
    "Materia:": "Subject:",
    "Tipo:": "Type:",
    "Talle:": "Size:",
    "Todos": "All",
    "Todas": "All",
    "Primaria": "Primary school",
    "Secundaria": "Secondary school",
    "Nuevo": "New",
    "Como nuevo": "Like new",
    "Usado": "Used",
    "Muy usado": "Well used",
    "Limpiar filtros": "Clear filters",
    "Explorá el marketplace": "Browse the marketplace",
    "Nosotros": "About us",
    "Contacto": "Contact",
    "Enviar un correo": "Send an email",
    "Material escolar": "School supplies",
    "Tu comunidad escolar": "Your school community",
    "¡Bienvenido!": "Welcome!",
    "Perfil y colegio": "Profile and school",
    "Nombre": "Name",
    "Nivel escolar": "School level",
    "Seleccioná tu nivel": "Select your level",
    "Colegio": "School",
    "Continuar": "Continue",
    "Padrón oficial argentino": "Official Argentine school directory",
    "Buscar tu colegio": "Find your school",
    "Bienvenido a ColegioLibre": "Welcome to ColegioLibre",
    "Continuar con Google": "Continue with Google",
    "Continuar con Apple": "Continue with Apple",
    "o continuá con email": "or continue with email",
    "Abriendo Google…": "Opening Google…",
    "Abriendo Apple…": "Opening Apple…",
    "Google todavía no está habilitado en Supabase.": "Google is not enabled in Supabase yet.",
    "Apple todavía no está habilitado en Supabase.": "Apple is not enabled in Supabase yet.",
    "No pudimos abrir Google. Intentá nuevamente.": "We could not open Google. Please try again.",
    "No pudimos abrir Apple. Intentá nuevamente.": "We could not open Apple. Please try again.",
    "Crear cuenta": "Create account",
    "Email": "Email",
    "Contraseña": "Password",
    "Confirmar contraseña": "Confirm password",
    "¿Olvidaste tu contraseña?": "Forgot your password?",
    "Recuperar contraseña": "Reset password",
    "Enviar enlace": "Send link",
    "Contraseña nueva": "New password",
    "Guardar contraseña": "Save password",
    "Tus conversaciones": "Your conversations",
    "Seleccioná una conversación": "Select a conversation",
    "Escribiendo…": "Typing…",
    "Reportar": "Report",
    "Bloquear": "Block",
    "Escribí tu mensaje": "Write your message",
    "Producto de la conversación": "Conversation product",
    "Reportar conversación": "Report conversation",
    "Motivo": "Reason",
    "Seleccioná un motivo": "Select a reason",
    "Posible fraude o engaño": "Possible fraud or scam",
    "Acoso o mensajes ofensivos": "Harassment or offensive messages",
    "Conducta o encuentro inseguro": "Unsafe conduct or meeting",
    "Spam": "Spam",
    "Contenido inapropiado": "Inappropriate content",
    "Otro motivo": "Other reason",
    "Contanos qué pasó": "Tell us what happened",
    "Cancelar": "Cancel",
    "Enviar reporte": "Submit report",
    "Comunidad escolar": "School community",
    "Cargando colegio...": "Loading school...",
    "Cargando ubicación...": "Loading location...",
    "Productos activos": "Active products",
    "Publicadores": "Sellers",
    "Categorias activas": "Active categories",
    "Categorías activas": "Active categories",
    "Red escolar activa": "Active school network",
    "Cargando código...": "Loading code...",
    "Publicar en esta comunidad": "List in this community",
    "Marketplace del colegio": "School marketplace",
    "Publicaciones del colegio": "School listings",
    "Filtrar por categoría": "Filter by category",
    "Estudiantes publicando": "Students selling",
    "Publicadores destacados": "Featured sellers",
    "Miembro de ColegioLibre": "ColegioLibre member",
    "Colegio verificado": "Verified school",
    "Reputación": "Reputation",
    "Sin calificaciones": "No ratings",
    "Calificaciones": "Ratings",
    "Ventas completadas": "Completed sales",
    "Publicaciones activas": "Active listings",
    "Publicaciones": "Listings",
    "Experiencias verificadas": "Verified experiences",
    "Calificaciones recibidas": "Ratings received",
    "Reportar usuario": "Report user",
    "Posible fraude": "Possible fraud",
    "Acoso o conducta ofensiva": "Harassment or offensive conduct",
    "Conducta insegura": "Unsafe conduct",
    "Detalles": "Details",
    "Mis publicaciones": "My listings",
    "Compras": "Purchases",
    "Ventas": "Sales",
    "Configuración": "Settings",
    "Dashboard": "Dashboard",
    "Resumen de tu cuenta": "Account overview",
    "Activos": "Active",
    "Vendidos": "Sold",
    "Vistas totales": "Total views",
    "Conversaciones": "Conversations",
    "Miembro desde": "Member since",
    "Calificación": "Rating",
    "Nueva": "New",
    "Tiempo de respuesta": "Response time",
    "Sin datos": "No data",
    "Ventas cerradas": "Closed sales",
    "Listado de publicaciones": "Listings",
    "Activas": "Active",
    "Pausadas": "Paused",
    "Vendidas": "Sold",
    "Consejo de seguridad": "Safety tip",
    "Ajustes de tu cuenta": "Account settings",
    "Nombre completo": "Full name",
    "Código de colegio": "School code",
    "Zona": "Area",
    "Guardar cambios": "Save changes",
    "¿Necesitás ayuda?": "Need help?",
    "Cargando publicación…": "Loading listing…",
    "Cargando publicación...": "Loading listing...",
    "Cargando": "Loading",
    "Producto escolar": "School product",
    "Publicado recientemente": "Recently listed",
    "0 vistas": "0 views",
    "Detalles del producto": "Product details",
    "Estado del producto": "Product condition",
    "Descripción": "Description",
    "Contactar vendedor": "Contact seller",
    "Producto vendido": "Product sold",
    "Publicación pausada": "Listing paused",
    "Producto reservado": "Product reserved",
    "El vendedor todavía no agregó una descripción.": "The seller has not added a description yet.",
    "Miembro de la comunidad ColegioLibre": "ColegioLibre community member",
    "Miembro de la comunidad": "Community member",
    "Prenda": "Garment",
    "Tamaño": "Size",
    "Medida": "Measurement",
    "Ver comunidad del colegio": "View school community",
    "Cargando ubicación…": "Loading location…",
    "Cargando reputación...": "Loading reputation...",
    "Editar publicación": "Edit listing",
    "Guardar en favoritos": "Save to favorites",
    "Reportar publicación": "Report listing",
    "Vendedor": "Seller",
    "Ver perfil": "View profile",
    "Contacto por ColegioLibre": "Contact through ColegioLibre",
    "Intercambio responsable": "Responsible exchange",
    "Colegio y zona": "School and area",
    "Ir al colegio": "Go to school",
    "Productos similares": "Similar products",
    "Producto o propuesta insegura": "Unsafe product or proposal",
    "Información o categoría incorrecta": "Incorrect information or category",
    "Spam o publicación repetida": "Spam or duplicate listing",
    "Título del producto": "Product title",
    "Seleccioná una categoría": "Select a category",
    "Completá los datos específicos": "Complete the product details",
    "Seleccioná el nivel": "Select the level",
    "Año o grado": "Year or grade",
    "Seleccioná el año": "Select the year",
    "Materia": "Subject",
    "Matemática": "Mathematics",
    "Lengua y Literatura": "Language and Literature",
    "Inglés": "English",
    "Historia": "History",
    "Geografía": "Geography",
    "Biología": "Biology",
    "Física": "Physics",
    "Química": "Chemistry",
    "Seleccioná la materia": "Select the subject",
    "Tipo de producto": "Product type",
    "Seleccioná una opción": "Select an option",
    "Talle": "Size",
    "Tamaño": "Size",
    "Medida": "Measurement",
    "Precio": "Price",
    "Ubicación": "Location",
    "Seleccioná tu zona": "Select your area",
    "Fotos del producto": "Product photos",
    "Publicar producto": "List product",
    "Vista previa": "Preview",
    "Matemática 3 - Santillana": "Mathematics 3 - Santillana",
    "y la": "and the",
    "Administrador": "Administrator",
    "Panel privado": "Private dashboard",
    "Colegios y códigos": "Schools and codes",
    "Sesión administrativa": "Admin session",
    "Actualizar datos": "Refresh data",
    "Total registrado": "Total registered",
    "Visibles para estudiantes": "Visible to students",
    "Estudiantes": "Students",
    "Perfiles vinculados": "Linked profiles",
    "Productos registrados": "Registered products",
    "Crear colegio": "Create school",
    "Cancelar edición": "Cancel editing",
    "Nombre del colegio": "School name",
    "Prefijo del código": "Code prefix",
    "Provincia": "Province",
    "Ciudad o localidad": "City or town",
    "URL del logo": "Logo URL",
    "Colores del colegio": "School colors",
    "Principal": "Primary",
    "Secundario": "Secondary",
    "Acento": "Accent",
    "Colegio activo": "Active school",
    "Código": "Code",
    "Se generará automáticamente": "Generated automatically",
    "Crear colegio y generar código": "Create school and generate code",
    "Directorio": "Directory",
    "Colegios registrados": "Registered schools",
    "Buscar colegio": "Search schools",
    "Filtrar por estado": "Filter by status",
    "Inactivos": "Inactive",
    "Comunidad": "Community",
    "Estado": "Status",
    "Acciones": "Actions",
    "Administración": "Administration",
    "Confianza y seguridad": "Trust and safety",
    "Centro de control": "Control Center",
    "Administración de ColegioLibre": "ColegioLibre Administration",
    "Actualizar": "Refresh",
    "Reportes": "Reports",
    "Revisión automática": "Automated review",
    "Cuentas": "Accounts",
    "Moderación": "Moderation",
    "Reportes de la comunidad": "Community reports",
    "Pendientes": "Pending",
    "En revisión": "Under review",
    "Resueltos": "Resolved",
    "Pendientes y en revisión": "Pending and under review",
    "Descartados": "Dismissed",
    "Buscar": "Search",
    "Moderación preventiva": "Preventive moderation",
    "Revisión de publicaciones": "Listing review",
    "Resultado": "Result",
    "Pendientes de revisión": "Awaiting review",
    "Revisión manual": "Manual review",
    "Procesando": "Processing",
    "Bloqueadas": "Blocked",
    "Aprobadas": "Approved",
    "Comunidades escolares": "School communities",
    "Solicitudes de verificación": "Verification requests",
    "Rechazadas": "Rejected",
    "Acceso automático": "Automatic access",
    "Códigos temporales por colegio": "Temporary school codes",
    "Código del colegio": "School code",
    "Etiqueta": "Label",
    "Cantidad de usos": "Number of uses",
    "Vence": "Expires",
    "Crear código temporal": "Create temporary code",
    "Código creado": "Code created",
    "Copiar": "Copy",
    "Catálogo seguro": "Safe catalog",
    "Reglas para productos prohibidos": "Rules for prohibited products",
    "Buscar en": "Search in",
    "Título, descripción y categoría": "Title, description and category",
    "Título": "Title",
    "Coincidencia": "Match",
    "Contiene": "Contains",
    "Es exactamente": "Exactly matches",
    "Palabra o frase": "Word or phrase",
    "Acción": "Action",
    "Mandar a revisión": "Send to review",
    "Efecto en la cuenta": "Account effect",
    "Sin sanción": "No penalty",
    "Sumar un strike": "Add a strike",
    "Motivo que verá el usuario": "Reason shown to the user",
    "Agregar regla": "Add rule",
    "Usuarios": "Users",
    "Estado de cuentas": "Account status",
    "Página no encontrada | ColegioLibre": "Page not found | ColegioLibre",
    "Error 404": "404 error",
    "No encontramos esa página": "We couldn't find that page",
    "Estamos para ayudarte": "We're here to help",
    "Cuenta e inicio de sesión": "Account and sign-in",
    "Publicar y editar": "List and edit",
    "Comprar y reservar": "Buy and reserve",
    "Reportes y problemas": "Reports and issues",
    "Escribir a soporte": "Contact support",
    "Temas": "Topics",
    "Cuenta": "Account",
    "Tus datos": "Your data",
    "Política de privacidad": "Privacy Policy",
    "Actualizado: 28 de julio de 2026": "Updated: July 28, 2026",
    "1. Datos que utilizamos": "1. Data we use",
    "2. Para qué se utilizan": "2. How we use it",
    "3. Qué información es visible": "3. What information is visible",
    "4. Proveedores": "4. Service providers",
    "5. Conservación y seguridad": "5. Retention and security",
    "6. Tus opciones": "6. Your choices",
    "7. Personas menores": "7. Minors",
    "Realizar una consulta": "Send an inquiry",
    "Datos utilizados": "Data used",
    "Finalidades": "Purposes",
    "Visibilidad": "Visibility",
    "Proveedores": "Providers",
    "Conservación": "Retention",
    "Tus opciones": "Your choices",
    "Menores": "Minors",
    "Confianza y comunidad": "Trust and community",
    "Centro de seguridad": "Safety Center",
    "Usá el chat de ColegioLibre": "Use ColegioLibre chat",
    "Pagos y acuerdos": "Payments and agreements",
    "Encuentros y entregas": "Meetups and delivery",
    "Revisá el producto": "Check the product",
    "Reportes y bloqueos": "Reports and blocks",
    "Informar un problema": "Report an issue",
    "Situaciones urgentes": "Urgent situations",
    "Consejos": "Tips",
    "Chat interno": "In-app chat",
    "Pagos": "Payments",
    "Entregas": "Deliveries",
    "Revisión": "Review",
    "Urgencias": "Emergencies",
    "Información legal": "Legal information",
    "1. Qué es ColegioLibre": "1. What ColegioLibre is",
    "2. Cuentas": "2. Accounts",
    "3. Publicaciones": "3. Listings",
    "4. Operaciones y entregas": "4. Transactions and delivery",
    "5. Conducta": "5. Conduct",
    "6. Moderación y sanciones": "6. Moderation and penalties",
    "7. Responsabilidad": "7. Liability",
    "8. Cambios y contacto": "8. Changes and contact",
    "El servicio": "The service",
    "Operaciones": "Transactions",
    "Conducta": "Conduct",
    "Sanciones": "Penalties",
    "Responsabilidad": "Liability",
    "Contactar a ColegioLibre": "Contact ColegioLibre",
    "No está permitido publicar": "You may not list",
    "Materiales que pueden requerir revisión": "Items that may require review",
    "Qué ocurre si se detectan": "What happens when they are detected",
    "Consultar un producto": "Ask about a product",
    "Más información": "More information",
    "Reglas de publicación": "Listing rules"
    ,
    "El marketplace de": "The marketplace for",
    "material escolar": "used school",
    "usado": "supplies",
    "Comprá, vendé e intercambiá materiales entre estudiantes.": "Buy, sell and exchange school supplies between students.",
    "Selección nacional": "Nationwide selection",
    "Recomendados de toda Argentina": "Recommended across Argentina",
    "Todo para el colegio, ordenado por categoría": "Everything for school, organized by category",
    "Cada estantería muestra una selección breve. Entrá en “Ver todos” para explorar la categoría completa.": "Each section shows a short selection. Choose “View all” to browse the full category.",
    "Una forma simple de circular materiales escolares": "A simple way to give school supplies a second life",
    "Diseñado para que comprar, vender y cambiar materiales sea rápido, confiable y accesible en todo el país.": "Designed to make buying, selling and exchanging school supplies quick, reliable and accessible nationwide.",
    "Manuales, novelas, diccionarios y libros para todas las materias.": "Textbooks, novels, dictionaries and books for every subject.",
    "Resúmenes, guías, modelos de examen y material de estudio por materia.": "Summaries, study guides, practice tests and subject-specific study materials.",
    "Cuadernos nuevos o con pocas hojas usadas, carpetas y repuestos.": "New or lightly used notebooks, binders and refill paper.",
    "Cartucheras, reglas, compases, calculadoras y materiales de clase.": "Pencil cases, rulers, compasses, calculators and classroom supplies.",
    "Mochilas, bolsos y accesorios escolares listos para seguir usándose.": "Backpacks, bags and school accessories ready for continued use.",
    "Calculadoras, tablets, accesorios y tecnología para estudiar.": "Calculators, tablets, accessories and technology for studying.",
    "Remeras, buzos, pantalones y prendas escolares filtradas por talle.": "School shirts, sweatshirts, trousers and uniforms filtered by size.",
    "Todo lo demás que puede servirle a otro estudiante.": "Everything else that could be useful to another student.",
    "Buscá por materia o categoría": "Search by subject or category",
    "Filtrá por estado, categoría, precio y colegio para encontrar exactamente lo que necesitás.": "Filter by condition, category, price and school to find exactly what you need.",
    "Conectate con estudiantes reales": "Connect with real students",
    "Chateá con estudiantes de tu comunidad, coordiná entrega y resolvé dudas rápido.": "Chat with students in your community, arrange delivery and quickly clear up any questions.",
    "Comprá, vendé o intercambiá": "Buy, sell or exchange",
    "Publicá gratis, ahorrá plata y mové materiales dentro de tu red escolar.": "List for free, save money and give school supplies a second life within your school network.",
    "El marketplace donde estudiantes compran, venden e intercambian materiales escolares de forma simple, segura y sustentable.": "The marketplace where students buy, sell and exchange school supplies simply, safely and sustainably.",
    "¿Tenés alguna duda o necesitás ayuda? Escribinos y te responderemos lo antes posible.": "Have a question or need help? Write to us and we’ll get back to you as soon as possible.",
    "Configurá tu cuenta para encontrar productos de tu colegio.": "Set up your account to find products from your school.",
    "Buscar y seleccionar mi colegio": "Find and select my school",
    "Buscá por el nombre conocido, las siglas o la dirección del colegio.": "Search by the familiar name, initials or school address.",
    "Escribí el nombre conocido o las siglas. Si no aparece, probá con su dirección.": "Enter the familiar name or initials. If it doesn’t appear, try the address.",
    "Tu comunidad escolar, más cerca": "Your school community, closer",
    "Comprá y vendé entre familias de tu colegio.": "Buy and sell among families at your school.",
    "Encontrá libros, uniformes y materiales escolares cerca tuyo, de forma simple y segura.": "Find books, uniforms and school supplies near you, simply and safely.",
    "Productos de tu colegio y tu zona": "Products from your school and area",
    "Contacto directo entre compradores y vendedores": "Direct contact between buyers and sellers",
    "Publicaciones gratuitas y fáciles de gestionar": "Free listings that are easy to manage",
    "Ahorrá, reutilizá y ayudá a otra familia.": "Save money, reuse and help another family.",
    "Ingresá tu email y te enviaremos un enlace seguro para crear una contraseña nueva.": "Enter your email and we’ll send you a secure link to create a new password.",
    "Elegí una contraseña segura que no hayas usado anteriormente.": "Choose a secure password you haven’t used before.",
    "Elegí un chat para ver el historial completo.": "Choose a chat to view the full conversation.",
    "El reporte será revisado por el equipo de ColegioLibre. La otra persona no verá quién lo envió.": "The ColegioLibre team will review the report. The other person will not see who submitted it.",
    "Encontrá libros, cuadernos, útiles y tecnología publicados por estudiantes reales de esta comunidad.": "Find books, notebooks, supplies and technology listed by real students in this community.",
    "Publicá gratis dentro de tu colegio y conectate con estudiantes de la misma comunidad para mover materiales reales.": "List for free within your school and connect with students in the same community.",
    "Este colegio todavía no tiene publicaciones activas para este filtro.": "This school has no active listings for this filter yet.",
    "Administrá tus materiales, revisá métricas reales y seguí el estado de cada publicación.": "Manage your items, review real metrics and track every listing.",
    "ColegioLibre no procesa pagos: no envíes dinero por adelantado.": "ColegioLibre does not process payments: never send money in advance.",
    "Usá siempre el chat y coordiná la entrega en un lugar seguro.": "Always use the chat and arrange delivery in a safe place.",
    "Actualizá tu perfil, tu colegio y la zona que usás para navegar ColegioLibre.": "Update your profile, school and the area you use to browse ColegioLibre.",
    "Usá el chat para coordinar y mantener la conversación ordenada.": "Use the chat to coordinate and keep the conversation organized.",
    "Revisá el producto y coordiná la entrega en un lugar seguro.": "Check the product and arrange delivery in a safe place.",
    "Revisaremos el producto y al vendedor. Tu identidad no se mostrará en la publicación.": "We will review the product and seller. Your identity will not appear on the listing.",
    "Creá comunidades escolares con un código único generado automáticamente.": "Create school communities with an automatically generated unique code.",
    "Estamos comprobando que tu cuenta tenga permisos de administrador.": "We are checking whether your account has administrator permissions.",
    "Opcional. Se limpia y combina con cuatro caracteres aleatorios.": "Optional. It is sanitized and combined with four random characters.",
    "Permite que aparezca en el buscador y acepte nuevos estudiantes.": "Allows the school to appear in search and accept new students.",
    "Revisión automática, reportes, cuentas y reglas de publicación.": "Automated review, reports, accounts and listing rules.",
    "El bot publica lo seguro, bloquea lo prohibido y te muestra únicamente los casos dudosos.": "The bot publishes safe content, blocks prohibited items and shows only uncertain cases.",
    "Aprobá únicamente a quienes pertenezcan al colegio indicado.": "Approve only people who belong to the selected school.",
    "El código completo se muestra una sola vez cuando se crea.": "The full code is shown only once when created.",
    "Copialo ahora. Por seguridad, después solo se mostrará una parte.": "Copy it now. For security, only part of it will be shown later.",
    "“Bloquear” rechaza la publicación. El strike es opcional y debe reservarse para casos graves.": "“Block” rejects the listing. A strike is optional and should be reserved for serious cases.",
    "Las publicaciones activas se pausan automáticamente al suspender o bloquear.": "Active listings are automatically paused when an account is suspended or blocked.",
    "Es posible que el enlace haya cambiado o que la publicación ya no esté disponible.": "The link may have changed or the listing may no longer be available.",
    "Respuestas rápidas para publicar, comprar, vender y utilizar tu comunidad escolar.": "Quick answers for listing, buying, selling and using your school community.",
    "¿Cómo creo una cuenta?": "How do I create an account?",
    "Entrá en “Iniciar sesión”, elegí “Crear cuenta” y completá el registro. Después seleccioná tu colegio para ingresar a tu comunidad.": "Choose “Sign in”, then “Create account” and complete registration. Select your school to join your community.",
    "Olvidé mi contraseña": "I forgot my password",
    "Utilizá “¿Olvidaste tu contraseña?” en el acceso. Recibirás las instrucciones en el email registrado.": "Use “Forgot your password?” on the sign-in page. Instructions will be sent to your registered email.",
    "¿Qué puedo publicar?": "What can I list?",
    "Libros, apuntes, cuadernos, útiles, mochilas, tecnología y uniformes permitidos. Revisá la lista de": "Allowed books, notes, notebooks, supplies, backpacks, technology and uniforms. Review the list of",
    "¿Por qué quedó en revisión?": "Why is it under review?",
    "El sistema revisa la publicación. Los casos dudosos se mantienen pausados hasta que un administrador pueda decidir.": "The system reviews the listing. Uncertain cases remain paused until an administrator makes a decision.",
    "¿Cómo la edito o pauso?": "How do I edit or pause it?",
    "Ingresá en tu perfil, abrí “Mis publicaciones” y utilizá el menú de la tarjeta.": "Open your profile, choose “My listings” and use the card menu.",
    "Abrí un producto y tocá “Contactar vendedor”. Usá el chat para consultar, reservar y coordinar. ColegioLibre no procesa pagos.": "Open a product and choose “Contact seller”. Use the chat to ask, reserve and coordinate. ColegioLibre does not process payments.",
    "Las conversaciones están asociadas al producto. Si no podés escribir, comprobá que la publicación siga disponible y que ninguna de las cuentas esté bloqueada o restringida.": "Conversations are linked to a product. If you cannot write, check that the listing is still available and neither account is blocked or restricted.",
    "Podés reportar una publicación o una cuenta desde los botones correspondientes. Para errores técnicos, indicá qué estabas haciendo, en qué dispositivo ocurrió y adjuntá una captura sin datos privados.": "You can report a listing or account using the relevant buttons. For technical errors, explain what you were doing, the device used and attach a screenshot without private information.",
    "Explicamos de manera clara qué información utiliza ColegioLibre y para qué.": "We clearly explain what information ColegioLibre uses and why.",
    "Email, nombre y datos básicos de la cuenta.": "Email, name and basic account information.",
    "Colegio, nivel escolar y zona seleccionada.": "Selected school, school level and area.",
    "Publicaciones, imágenes, favoritos, mensajes, reportes y calificaciones.": "Listings, images, favorites, messages, reports and ratings.",
    "Información técnica necesaria para seguridad, funcionamiento y prevención de abuso.": "Technical information required for safety, operation and abuse prevention.",
    "ColegioLibre no necesita tu DNI para aplicar sanciones y no debería solicitarlo salvo que exista una necesidad legítima, informada y protegida.": "ColegioLibre does not need your national ID to apply penalties and should not request it unless there is a legitimate, disclosed and protected need.",
    "Crear y proteger la cuenta.": "Create and protect the account.",
    "Mostrar productos relevantes por colegio y zona.": "Show relevant products by school and area.",
    "Habilitar mensajes, reservas y calificaciones.": "Enable messages, reservations and ratings.",
    "Prevenir fraude, abuso y productos prohibidos.": "Prevent fraud, abuse and prohibited products.",
    "Responder consultas y mejorar el servicio.": "Answer inquiries and improve the service.",
    "Las publicaciones, nombre público, colegio, zona general y reputación pueden ser visibles para otras personas. El email, credenciales y mensajes privados no deben mostrarse públicamente.": "Listings, public name, school, general area and reputation may be visible to others. Email, credentials and private messages must not be publicly displayed.",
    "ColegioLibre utiliza servicios tecnológicos como Supabase y Vercel para autenticación, base de datos, almacenamiento y alojamiento. Solo deben recibir la información necesaria para prestar esos servicios.": "ColegioLibre uses services such as Supabase and Vercel for authentication, database, storage and hosting. They should receive only the information required to provide those services.",
    "La información se conserva mientras la cuenta esté activa o cuando sea necesaria para seguridad, resolución de reportes y obligaciones aplicables. Se utilizan controles de acceso y políticas de base de datos para limitar el acceso.": "Information is retained while an account is active or when needed for safety, report resolution and applicable obligations. Access controls and database policies limit access.",
    "Podés pedir acceso, corrección o eliminación de información asociada a tu cuenta. Algunos registros mínimos de seguridad pueden conservarse para impedir abuso o cumplir obligaciones.": "You may request access, correction or deletion of information linked to your account. Minimal safety records may be retained to prevent abuse or meet obligations.",
    "La plataforma está vinculada con comunidades escolares. Las personas menores deben utilizarla con acompañamiento de una persona adulta responsable y evitar compartir datos personales o coordinar encuentros sin supervisión.": "The platform is connected to school communities. Minors should use it with a responsible adult and avoid sharing personal data or arranging unsupervised meetings.",
    "ColegioLibre ayuda a ordenar el contacto. Las decisiones de pago, encuentro y entrega requieren igualmente cuidado y acompañamiento.": "ColegioLibre helps organize contact. Payment, meeting and delivery decisions still require care and supervision.",
    "Mantené la conversación dentro de la plataforma. No publiques teléfonos, documentos, direcciones particulares ni datos bancarios.": "Keep conversations on the platform. Do not publish phone numbers, documents, home addresses or banking details.",
    "ColegioLibre no procesa ni protege pagos. Desconfiá de enlaces externos, comprobantes dudosos, pedidos de adelantos y presión para cerrar una operación rápidamente.": "ColegioLibre does not process or protect payments. Be cautious of external links, suspicious receipts, advance-payment requests and pressure to close quickly.",
    "Elegí un lugar público, iluminado y concurrido.": "Choose a public, well-lit and busy place.",
    "Si sos menor, asistí con una persona adulta responsable.": "If you are a minor, attend with a responsible adult.",
    "No compartas tu domicilio si no es indispensable.": "Do not share your home address unless essential.",
    "Revisá el artículo antes de entregar dinero.": "Check the item before handing over money.",
    "No continúes si algo te genera desconfianza.": "Do not continue if something feels suspicious.",
    "Compará las imágenes con el artículo real, comprobá edición, talle, funcionamiento y estado. Solicitá aclaraciones dentro del chat.": "Compare the images with the real item and check its edition, size, operation and condition. Ask questions in the chat.",
    "Reportá publicaciones engañosas, productos prohibidos, amenazas o intentos de obtener información privada. También podés bloquear a una persona para impedir nuevo contacto.": "Report misleading listings, prohibited products, threats or attempts to obtain private information. You can also block someone to prevent further contact.",
    "Si existe peligro inmediato o un posible delito, priorizá tu seguridad y acudí a una persona adulta responsable o a las autoridades correspondientes. No dependas únicamente de un reporte dentro de la plataforma.": "If there is immediate danger or a possible crime, prioritize your safety and contact a responsible adult or the appropriate authorities. Do not rely solely on an in-platform report.",
    "Estas reglas explican cómo utilizar ColegioLibre y qué responsabilidades corresponden a cada integrante de la comunidad.": "These rules explain how to use ColegioLibre and each community member’s responsibilities.",
    "ColegioLibre es una plataforma que permite publicar, encontrar y conversar sobre materiales escolares usados. La plataforma facilita el contacto, pero no compra, vende, cobra, entrega ni custodia productos.": "ColegioLibre is a platform for listing, finding and discussing used school supplies. It facilitates contact but does not buy, sell, charge for, deliver or hold products.",
    "ColegioLibre no procesa pagos ni garantiza una operación. Compradores y vendedores coordinan directamente y deben actuar con precaución.": "ColegioLibre does not process payments or guarantee a transaction. Buyers and sellers coordinate directly and must act carefully.",
    "La información suministrada debe ser correcta y mantenerse actualizada.": "The information provided must be accurate and kept up to date.",
    "Cada persona es responsable de proteger su contraseña.": "Each person is responsible for protecting their password.",
    "No se permiten cuentas utilizadas para engañar, acosar o eludir sanciones.": "Accounts used to deceive, harass or evade penalties are not allowed.",
    "Si una persona menor de edad utiliza la plataforma, debe hacerlo con conocimiento y acompañamiento de una persona adulta responsable.": "Minors must use the platform with the knowledge and supervision of a responsible adult.",
    "Solo pueden publicarse materiales permitidos y vinculados con la comunidad educativa. Las fotos y descripciones deben representar el estado real del producto.": "Only permitted items related to the educational community may be listed. Photos and descriptions must show the product’s real condition.",
    "No publicar artículos falsificados, robados, peligrosos o ilegales.": "Do not list counterfeit, stolen, dangerous or illegal items.",
    "No incluir datos personales, teléfonos, enlaces de pago o instrucciones para evadir las medidas de seguridad.": "Do not include personal data, phone numbers, payment links or instructions to bypass safety measures.",
    "No duplicar publicaciones ni utilizar palabras engañosas.": "Do not duplicate listings or use misleading wording.",
    "La moderación puede aprobar, pausar, rechazar o retirar contenido.": "Moderation may approve, pause, reject or remove content.",
    "Las reservas, mensajes y estados ayudan a ordenar el intercambio, pero no constituyen una garantía de pago o entrega. Antes de aceptar un producto, revisalo y coordiná encuentros en lugares públicos, acompañados y seguros.": "Reservations, messages and statuses organize an exchange but do not guarantee payment or delivery. Check the product and arrange accompanied meetings in safe public places.",
    "No se permiten amenazas, discriminación, acoso, spam, manipulación de calificaciones, suplantación de identidad ni intentos de obtener información privada.": "Threats, discrimination, harassment, spam, rating manipulation, impersonation and attempts to obtain private information are prohibited.",
    "ColegioLibre puede emitir advertencias, limitar funciones, pausar publicaciones o suspender cuentas para proteger a la comunidad. Las decisiones consideran gravedad, reincidencia y evidencia disponible.": "ColegioLibre may issue warnings, limit features, pause listings or suspend accounts to protect the community. Decisions consider severity, repeated conduct and available evidence.",
    "Cada usuario es responsable por sus publicaciones, conversaciones, productos, acuerdos y encuentros. ColegioLibre no inspecciona físicamente los artículos ni garantiza identidad, calidad, precio o cumplimiento.": "Each user is responsible for their listings, conversations, products, agreements and meetings. ColegioLibre does not physically inspect items or guarantee identity, quality, price or performance.",
    "Estos términos pueden actualizarse para reflejar mejoras o nuevas obligaciones. Las modificaciones importantes se comunicarán dentro de la plataforma.": "These terms may be updated to reflect improvements or new obligations. Important changes will be communicated within the platform.",
    "ColegioLibre está destinado a materiales escolares permitidos. Esta lista puede ampliarse cuando aparezcan nuevos riesgos.": "ColegioLibre is intended for permitted school supplies. This list may expand as new risks emerge.",
    "Armas, explosivos, elementos peligrosos o instrucciones para fabricarlos.": "Weapons, explosives, dangerous items or instructions to make them.",
    "Alcohol, tabaco, vapeadores, drogas o sustancias reguladas.": "Alcohol, tobacco, vaping products, drugs or regulated substances.",
    "Medicamentos, productos médicos o suplementos.": "Medicines, medical products or supplements.",
    "Documentos personales, credenciales, certificados o exámenes robados.": "Personal documents, credentials, certificates or stolen exams.",
    "Productos robados, falsificados o de origen dudoso.": "Stolen, counterfeit or suspiciously sourced products.",
    "Contenido sexual, violento, discriminatorio o destinado al acoso.": "Sexual, violent, discriminatory or harassing content.",
    "Animales, alimentos perecederos o productos que requieran controles sanitarios.": "Animals, perishable food or products requiring health controls.",
    "Servicios, préstamos, apuestas, inversiones o instrumentos financieros.": "Services, loans, gambling, investments or financial instruments.",
    "Software ilegal, cuentas digitales, contraseñas o dispositivos con información privada.": "Illegal software, digital accounts, passwords or devices containing private information.",
    "Publicaciones que pidan contacto, pagos o acuerdos por fuera para eludir las reglas.": "Listings requesting outside contact, payments or agreements to bypass the rules.",
    "Calculadoras, tablets, notebooks y tecnología.": "Calculators, tablets, laptops and technology.",
    "Uniformes con nombres o datos personales visibles.": "Uniforms with visible names or personal data.",
    "Apuntes o guías que puedan infringir derechos de autor.": "Notes or guides that may infringe copyright.",
    "Elementos de laboratorio, arte o deporte que puedan ser peligrosos.": "Potentially dangerous laboratory, art or sports items.",
    "La publicación puede quedar pausada, ser rechazada o eliminarse. Según la gravedad o reincidencia, también pueden limitarse funciones o suspenderse la cuenta.": "A listing may be paused, rejected or removed. Depending on severity or repeated conduct, features may also be limited or the account suspended.",
    "Si tenés dudas antes de publicar, consultanos. Es mejor revisar el artículo antes que aplicar una sanción después.": "If you are unsure before listing, contact us. It is better to review the item before a penalty is needed.",
    "No se pudo inicializar Supabase.": "Supabase could not be initialized.",
    "Contraseña débil. Sumá mayúsculas y números.": "Weak password. Add uppercase letters and numbers.",
    "Contraseña aceptable.": "Acceptable password.",
    "Contraseña segura.": "Strong password.",
    "Contraseña muy segura.": "Very strong password.",
    "Mínimo 8 caracteres": "At least 8 characters",
    "Ingresá tu contraseña": "Enter your password",
    "Creá tu cuenta": "Create your account",
    "Registrate con tu email y elegí una contraseña segura.": "Register with your email and choose a strong password.",
    "¿Ya tenés una cuenta?": "Already have an account?",
    "El email o la contraseña no son correctos.": "The email or password is incorrect.",
    "Primero confirmá tu email desde el enlace que recibiste.": "First confirm your email using the link you received.",
    "Ese email ya tiene una cuenta. Probá iniciar sesión.": "That email already has an account. Try signing in.",
    "La contraseña debe tener al menos 8 caracteres.": "The password must be at least 8 characters long.",
    "La contraseña nueva debe ser distinta de la anterior.": "The new password must be different from the previous one.",
    "Hiciste varios intentos seguidos. Esperá unos minutos y probá de nuevo.": "You made several attempts. Wait a few minutes and try again.",
    "No pudimos conectarnos. Revisá tu internet e intentá nuevamente.": "We could not connect. Check your internet connection and try again.",
    "No pudimos crear la cuenta. Revisá los datos e intentá nuevamente.": "We could not create the account. Check the details and try again.",
    "No pudimos completar la recuperación. Intentá nuevamente.": "We could not complete password recovery. Try again.",
    "No pudimos iniciar sesión. Intentá nuevamente.": "We could not sign you in. Try again.",
    "Ingresá tu email.": "Enter your email.",
    "Ingresá un email válido.": "Enter a valid email.",
    "Ingresá tu contraseña.": "Enter your password.",
    "Repetí tu contraseña.": "Repeat your password.",
    "Las contraseñas no coinciden.": "Passwords do not match.",
    "Listo. Estamos abriendo tu cuenta…": "Done. We’re opening your account…",
    "Creando tu cuenta…": "Creating your account…",
    "Cuenta creada. Revisá tu email y tocá el enlace de confirmación para activarla.": "Account created. Check your email and use the confirmation link to activate it.",
    "Enviando el enlace seguro…": "Sending the secure link…",
    "Si existe una cuenta con ese email, vas a recibir un enlace para cambiar la contraseña. Revisá también Spam.": "If an account exists for that email, you’ll receive a password reset link. Check your spam folder too.",
    "Guardando tu contraseña…": "Saving your password…",
    "Contraseña actualizada. Ya podés continuar con tu cuenta.": "Password updated. You can now continue with your account.",
    "Mostrar contraseña": "Show password",
    "Ocultar contraseña": "Hide password",
    "Datos del libro": "Book details",
    "Datos de los apuntes": "Notes details",
    "Tipo de cuaderno": "Notebook type",
    "Repuesto de hojas": "Refill paper",
    "Datos del cuaderno": "Notebook details",
    "Tipo de útil": "School supply type",
    "Datos del útil": "School supply details",
    "Tamaño": "Size",
    "Datos de la mochila": "Backpack details",
    "Tipo de tecnología": "Technology type",
    "Datos del producto tecnológico": "Technology product details",
    "Datos del uniforme": "Uniform details",
    "Datos del producto": "Product details",
    "La publicación quedó guardada y será revisada.": "The listing was saved and will be reviewed.",
    "La revisión automática no respondió.": "The automated review did not respond.",
    "No pudimos completar la revisión automática. La publicación quedó guardada para revisión.": "We could not complete the automated review. The listing was saved for review.",
    "Cambios aprobados. La publicación ya está disponible.": "Changes approved. The listing is now available.",
    "¡Publicación aprobada y disponible!": "Listing approved and available!",
    "La publicación quedó en revisión.": "The listing is under review.",
    "Tu cuenta no está habilitada para publicar.": "Your account is not allowed to list products.",
    "Solo podés publicar dentro del colegio asociado a tu cuenta.": "You can only list within the school linked to your account.",
    "No encontramos una publicación tuya con ese ID.": "We could not find one of your listings with that ID.",
    "Editá tu publicación": "Edit your listing",
    "Actualizá la información de tu material y guardá los cambios.": "Update your item information and save the changes.",
    "No se pudo cargar": "Could not load",
    "No se pudo cargar la publicación.": "The listing could not be loaded.",
    "Se restauró el formulario.": "The form was reset.",
    "Ubicación personalizada": "Custom location",
    "No se pudo subir la imagen.": "The image could not be uploaded.",
    "Esperá a que termine de cargar la publicación.": "Wait for the listing to finish loading.",
    "Completá título, categoría y precio.": "Complete the title, category and price.",
    "Agregá una descripción de al menos 20 caracteres.": "Add a description of at least 20 characters.",
    "Seleccioná el nivel y el año o grado.": "Select the level and year or grade.",
    "Seleccioná la materia.": "Select the subject.",
    "Tenés que iniciar sesión para publicar.": "You must sign in to list a product.",
    "Sin ubicación": "No location",
    "No tenés permiso para editar esta publicación.": "You do not have permission to edit this listing.",
    "Cambios guardados. Estamos revisando la publicación…": "Changes saved. We are reviewing the listing…",
    "Error al guardar los cambios.": "Could not save the changes.",
    "Error al publicar el producto.": "Could not list the product.",
    "No se encontró el perfil.": "Profile not found.",
    "No se pudo cargar este perfil.": "This profile could not be loaded.",
    "¿Querés desbloquear a este usuario?": "Do you want to unblock this user?",
    "¿Querés bloquear a este usuario? No podrán iniciar nuevas conversaciones.": "Do you want to block this user? You will not be able to start new conversations.",
    "No se pudo actualizar el bloqueo.": "The block could not be updated.",
    "No se pudo enviar el reporte.": "The report could not be submitted.",
    "Reporte enviado. Gracias por avisarnos.": "Report submitted. Thank you for letting us know.",
    "No se pudieron cargar tus conversaciones.": "Your conversations could not be loaded.",
    "Todavía no tenés conversaciones activas.": "You do not have active conversations yet.",
    "No hay conversaciones para mostrar.": "There are no conversations to show.",
    "Probá con otro término o iniciá una desde un producto.": "Try another term or start a conversation from a product.",
    "No se pudo abrir la conversación.": "The conversation could not be opened.",
    "No tenés acceso a esta conversación.": "You do not have access to this conversation.",
    "No se encontró la conversación.": "Conversation not found.",
    "El producto asociado ya no está disponible.": "The related product is no longer available.",
    "Solo el vendedor puede cambiar el estado.": "Only the seller can change the status.",
    "¿Querés volver a mostrar este producto como disponible?": "Do you want to make this product available again?",
    "¿Querés reservar este producto para este comprador?": "Do you want to reserve this product for this buyer?",
    "¿Confirmás que el producto fue vendido?": "Do you confirm that the product was sold?",
    "No se pudo cambiar el estado del producto.": "The product status could not be changed.",
    "Venta finalizada": "Sale completed",
    "La operación quedó marcada como completada.": "The transaction was marked as completed.",
    "¿Querés cancelar tu reserva? El producto volverá a estar disponible para otras personas.": "Do you want to cancel your reservation? The product will become available to others.",
    "No se pudo cancelar la reserva.": "The reservation could not be cancelled.",
    "Reserva cancelada. El vendedor recibió el aviso.": "Reservation cancelled. The seller was notified.",
    "Elegí una calificación de 1 a 5 estrellas.": "Choose a rating from 1 to 5 stars.",
    "No se pudo enviar la calificación.": "The rating could not be submitted.",
    "Calificación enviada. ¡Gracias!": "Rating submitted. Thank you!",
    "Desbloqueá al usuario para volver a escribir.": "Unblock the user to write again.",
    "No se pudo enviar el mensaje.": "The message could not be sent.",
    "No se pudieron cargar los datos administrativos.": "Administrative data could not be loaded.",
    "Escribí el nombre del colegio.": "Enter the school name.",
    "El código no cambia al editar": "The code does not change when editing",
    "Ya existe un colegio con ese nombre o código.": "A school with that name or code already exists.",
    "Tu cuenta no tiene permisos para realizar esta acción.": "Your account does not have permission to perform this action.",
    "No se pudo guardar el colegio. Revisá la consola para más información.": "The school could not be saved. Check the console for more information.",
    "No hay publicaciones esperando una decisión.": "There are no listings awaiting a decision.",
    "No hay resultados para estos filtros.": "There are no results for these filters.",
    "Motivo de aprobación:": "Approval reason:",
    "Motivo del bloqueo:": "Block reason:",
    "No se pudo revisar la publicación.": "The listing could not be reviewed.",
    "Publicación aprobada.": "Listing approved.",
    "Publicación bloqueada.": "Listing blocked.",
    "No se pudieron cargar los reportes.": "Reports could not be loaded.",
    "No hay reportes para estos filtros.": "There are no reports for these filters.",
    "Nota interna de resolución": "Internal resolution note",
    "¿Resolver este reporte sin una nota interna?": "Resolve this report without an internal note?",
    "No se pudo actualizar el reporte.": "The report could not be updated.",
    "No se pudieron cargar las verificaciones.": "Verification requests could not be loaded.",
    "No hay solicitudes con estos filtros.": "There are no requests for these filters.",
    "No se pudo revisar la solicitud.": "The request could not be reviewed.",
    "Verificación aprobada.": "Verification approved.",
    "Elegí una fecha de vencimiento válida.": "Choose a valid expiration date.",
    "No se pudo crear el código.": "The code could not be created.",
    "Código temporal creado.": "Temporary code created.",
    "Código copiado.": "Code copied.",
    "No se pudieron cargar las invitaciones.": "Invitations could not be loaded.",
    "Todavía no creaste códigos temporales.": "You have not created temporary codes yet.",
    "No se pudo crear la regla.": "The rule could not be created.",
    "No se pudieron cargar las reglas.": "Rules could not be loaded.",
    "No hay reglas configuradas todavía.": "No rules have been configured yet.",
    "No se pudo modificar la regla.": "The rule could not be updated.",
    "No se pudieron cargar las cuentas.": "Accounts could not be loaded.",
    "No se encontraron cuentas.": "No accounts were found.",
    "Motivo de la reactivación:": "Reactivation reason:",
    "Motivo de la restricción:": "Restriction reason:",
    "No se pudo actualizar la cuenta.": "The account could not be updated.",
    "Estado de cuenta actualizado.": "Account status updated.",
    "Conversación": "Conversation",
    "Publicación": "Listing",
    "visita": "view",
    "favorito": "favorite",
    "mensaje": "message",
    "Aprobada": "Approved",
    "Revisando": "Reviewing",
    "No aprobada": "Not approved",
    "Editar y volver a enviar": "Edit and resubmit",
    "Reactivar producto": "Reactivate product",
    "Pausar producto": "Pause product",
    "Sin verificar": "Unverified",
    "Información incorrecta": "Incorrect information",
    "No se pudieron cargar las notificaciones.": "Notifications could not be loaded.",
    "Estás al día": "You’re all caught up",
    "Todavía no hay notificaciones": "No notifications yet",
    "Cuando alguien te escriba o guarde un producto, aparecerá acá.": "When someone messages you or saves a product, it will appear here.",
    "No se pudieron marcar como leídas.": "Notifications could not be marked as read.",
    "Tenés una nueva notificación.": "You have a new notification.",
    "Activar avisos": "Enable alerts",
    "Avisos activados": "Alerts enabled",
    "Avisos bloqueados": "Alerts blocked",
    "Avisos del teléfono": "Phone alerts",
    "No se pudieron activar los avisos del dispositivo.": "Device alerts could not be enabled.",
    "Sacar foto": "Take photo",
    "Cargando la zona de tu colegio…": "Loading your school area…",
    "Otra ubicación": "Another location",
    "Escribí la localidad o zona": "Enter the town, city or area",
    "No pudimos abrir la cámara. Podés elegir una foto de la galería.": "We couldn't open the camera. You can choose a photo from your gallery.",
    "Guardaron tu producto": "Someone saved your product",
    "Calificá la operación": "Rate the transaction",
    "No tenés publicaciones en esta sección.": "You have no listings in this section.",
    "Todavía no marcaste publicaciones como vendidas.": "You have not marked any listings as sold yet.",
    "Comunicación": "Communication",
    "Pendiente de revisión": "Pending review",
    "Colegio sin verificar": "Unverified school",
    "Revisión ya solicitada": "Review already requested",
    "Solicitar revisión manual": "Request manual review",
    "Ingresá el código de verificación.": "Enter the verification code.",
    "Verificar con código": "Verify with code",
    "El código no es válido.": "The code is invalid.",
    "Tu colegio quedó verificado.": "Your school was verified.",
    "No se pudo enviar la solicitud.": "The request could not be submitted.",
    "Solicitud enviada para revisión.": "Request submitted for review.",
    "Sin colegio": "No school",
    "Todavía no tenés compras": "You do not have purchases yet",
    "Producto de ColegioLibre": "ColegioLibre product",
    "La operación fue confirmada por el vendedor.": "The transaction was confirmed by the seller.",
    "El vendedor reservó este producto para vos.": "The seller reserved this product for you.",
    "El vendedor canceló la reserva.": "The seller cancelled the reservation.",
    "Esta reserva ya no está activa.": "This reservation is no longer active.",
    "No tenés permiso para modificar esta publicación.": "You do not have permission to modify this listing.",
    "La publicación volvió a estar disponible.": "The listing is available again.",
    "La publicación quedó pausada.": "The listing was paused.",
    "La publicación se marcó como vendida.": "The listing was marked as sold.",
    "No se pudo actualizar el estado.": "The status could not be updated.",
    "Completá tu nombre para guardar los ajustes.": "Enter your name to save the settings.",
    "Ese código de colegio no existe.": "That school code does not exist.",
    "No se pudieron guardar los ajustes.": "Settings could not be saved.",
    "Colegio actualizado. Tenés que verificarlo nuevamente.": "School updated. You need to verify it again.",
    "No se pudo cerrar la sesión.": "Could not sign out.",
    "Ubicación no especificada": "Location not specified",
    "Este código no coincide con una comunidad escolar activa.": "This code does not match an active school community.",
    "Elegí tu colegio desde el buscador para entrar a su comunidad.": "Choose your school in search to enter its community.",
    "No se pudo actualizar el favorito.": "The favorite could not be updated.",
    "Este colegio todavía no tiene estudiantes publicando.": "This school does not have students listing products yet.",
    "Podés elegir otro colegio o volver.": "You can choose another school or go back.",
    "Buscá por nombre, siglas o dirección. También podés agregar la localidad.": "Search by name, initials or address. You can also add the town.",
    "Escribí al menos 2 letras para buscar.": "Enter at least 2 letters to search.",
    "Buscando en el padrón oficial…": "Searching the official directory…",
    "No pudimos buscar colegios en este momento. Probá nuevamente.": "We could not search for schools right now. Try again.",
    "No lo encontramos con ese nombre. Probá con la dirección del colegio y su localidad.": "We could not find it by that name. Try the school address and town.",
    "Ingresá tu nombre.": "Enter your name.",
    "Seleccioná tu nivel escolar.": "Select your school level.",
    "Buscá y seleccioná tu colegio.": "Find and select your school.",
    "Tu sesión venció. Volvé a iniciar sesión.": "Your session expired. Sign in again.",
    "Comprobando el colegio…": "Checking the school…",
    "Ese colegio ya no está disponible. Seleccioná otro.": "That school is no longer available. Choose another.",
    "Guardando tu perfil…": "Saving your profile…",
    "No se pudo guardar tu perfil. Probá nuevamente.": "Your profile could not be saved. Try again.",
    "¡Listo! Ya podés usar ColegioLibre.": "Done! You can now use ColegioLibre."
  }));

  const phraseTranslations = [
    ["La publicación aparecerá en ", "Your listing will appear in "],
    [" y también podrá encontrarse por zona.", " and can also be found by area."],
    ["Cargando...", "Loading..."],
    ["Cargando métricas reales de tu actividad...", "Loading real activity metrics..."],
    ["No encontramos productos para esa búsqueda.", "We couldn't find products for that search."],
    ["Probá con otro término, otro estado o volvé a ver todos los destacados.", "Try another term or condition, or return to all featured products."],
    ["No encontramos colegios para estos filtros.", "We couldn't find schools matching these filters."],
    ["No hay conversación abierta.", "No conversation is open."],
    ["Elegí un chat de la izquierda para empezar.", "Choose a chat on the left to get started."],
    ["No encontramos esa página", "We couldn't find that page"],
    ["Este usuario no tiene publicaciones disponibles.", "This user has no available listings."],
    ["Todavía no recibió calificaciones.", "No ratings received yet."],
    ["Todavía no hay otros productos disponibles en esta categoría.", "There are no other products in this category yet."],
    ["Completá la información para publicar tu material.", "Complete the information to list your item."],
    ["Estos datos ayudan a encontrar el producto con filtros más precisos.", "These details help buyers find the product with more accurate filters."],
    ["Subí hasta 6 fotos o arrastrá y soltá aquí", "Upload up to 6 photos or drag and drop them here"],
    ["Formatos permitidos: JPG, PNG. Máx. 6MB c/u", "Allowed formats: JPG, PNG. Max. 6 MB each"],
    ["Usá al menos 8 caracteres.", "Use at least 8 characters."],
    ["¿Todavía no tenés una cuenta?", "Don't have an account yet?"],
    ["Al continuar aceptás los", "By continuing, you agree to the"],
    ["Ingresá con tu email y contraseña para continuar.", "Enter your email and password to continue."],
    ["Creá una contraseña nueva", "Create a new password"],
    ["Seleccioná una conversación", "Select a conversation"],
    ["Enter para enviar · Shift + Enter para una nueva línea", "Enter to send · Shift + Enter for a new line"],
    ["Cuando abras un chat, vas a ver acá el material asociado.", "When you open a chat, the related item will appear here."],
    ["ColegioLibre no procesa pagos", "ColegioLibre does not process payments"],
    ["Cargando información del producto…", "Loading product information…"],
    ["Usá el chat para coordinar", "Use the chat to coordinate"],
    ["Coordiná la entrega en un lugar seguro", "Arrange delivery in a safe place"],
    ["Publicado hoy", "Listed today"],
    ["Publicado hace", "Listed"],
    ["Publicado ayer", "Listed yesterday"],
    ["Publicado el", "Listed on"],
    ["Actualizado", "Updated"],
    ["Ver comunidad de", "View the community for"],
    ["Colegio no especificado", "School not specified"],
    ["Colegio no disponible", "School unavailable"],
    ["Zona no especificada", "Area not specified"],
    ["Ubicación no especificada", "Location not specified"],
    ["Primaria", "Primary school"],
    ["Secundaria", "Secondary school"],
    ["No corresponde", "Not applicable"],
    ["Talle ", "Size "],
    ["Tamaño ", "Size "],
    ["Medida ", "Measurement "],
    [" días", " days"],
    [" día", " day"],
    [" horas", " hours"],
    [" hora", " hour"],
    [" minutos", " minutes"],
    [" minuto", " minute"],
    [" calificaciones", " ratings"],
    [" calificación", " rating"],
    [" ventas", " sales"],
    [" venta", " sale"],
    [" vistas", " views"],
    [" vista", " view"],
    [" favoritos", " favorites"],
    [" favorito", " favorite"],
    [" mensajes", " messages"],
    [" mensaje", " message"],
    [" ayer", " yesterday"],
    [" hoy", " today"],
    ["vistas", "views"],
    ["favoritos", "favorites"],
    ["mensajes", "messages"],
    ["producto disponible", "product available"],
    ["productos disponibles", "products available"],
    ["producto seleccionado", "product selected"],
    ["productos seleccionados", "products selected"],
    ["Miembro desde", "Member since"],
    ["Publicado", "Listed"],
    ["Disponible", "Available"],
    ["Pausado", "Paused"],
    ["Vendido", "Sold"],
    ["Reservado", "Reserved"],
    ["Reactivar", "Reactivate"],
    ["Pausar", "Pause"],
    ["Marcar como vendido", "Mark as sold"],
    ["Volver a publicar", "Relist"],
    ["Editar publicación", "Edit listing"],
    ["Eliminar", "Delete"],
    ["Aprobar", "Approve"],
    ["Rechazar", "Reject"],
    ["Bloquear", "Block"],
    ["Desbloquear", "Unblock"],
    ["por fuera de ColegioLibre", "outside ColegioLibre"],
    ["Hecho por estudiantes para estudiantes en Argentina.", "Made by students for students in Argentina."],
    ["© 2026 ColegioLibre · Hecho para comunidades escolares.", "© 2026 ColegioLibre · Built for school communities."]
  ];

  const placeholderTranslations = new Map(Object.entries({
    "Buscar productos, libros, útiles, uniformes…": "Search products, books, supplies, uniforms…",
    "Buscar material escolar": "Search school supplies",
    "Ej: Matemática 3 - Santillana": "E.g. Mathematics 3 - Santillana",
    "Contá el estado del producto, edición, si tiene marcas, subrayados, etc.": "Describe the condition, edition, marks, highlighting, and other details.",
    "Buscar colegio": "Search schools",
    "Usuario, motivo o detalle": "User, reason, or details",
    "Producto, usuario o motivo": "Product, user, or reason",
    "Ej: bebida alcohólica": "E.g. alcoholic beverage",
    "Escribí un mensaje...": "Write a message...",
    "Nombre completo": "Full name",
    "tu@email.com": "you@email.com"
  }));

  function translateString(value) {
    const clean = String(value || "").trim().replace(/\s+/g, " ");
    if (!clean) return value;
    if (translations.has(clean)) return translations.get(clean);

    let result = String(value);
    for (const [spanish, english] of phraseTranslations) {
      if (result.includes(spanish)) result = result.replaceAll(spanish, english);
    }
    return result;
  }

  function translateTextNode(node) {
    if (!node.nodeValue?.trim()) return;
    const parent = node.parentElement;
    if (!parent || parent.closest(protectedContentSelector)) return;
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const original = originalText.get(node);
    node.nodeValue = language === "en" ? translateString(original) : original;
  }

  function translateElementAttributes(element) {
    if (element.closest?.(protectedContentSelector)) return;
    if (!originalAttributes.has(element)) originalAttributes.set(element, new Map());
    const originals = originalAttributes.get(element);
    for (const attribute of ["placeholder", "title", "aria-label"]) {
      if (!element.hasAttribute?.(attribute)) continue;
      if (!originals.has(attribute)) {
        originals.set(attribute, element.getAttribute(attribute));
      }
      const original = originals.get(attribute);
      const translated = placeholderTranslations.get(original) || translateString(original);
      element.setAttribute(attribute, language === "en" ? translated : original);
    }
  }

  function translateTree(target) {
    if (translating) return;
    translating = true;
    try {
      const walker = document.createTreeWalker(
        target,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            return node.nodeValue?.trim()
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
        }
      );
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      textNodes.forEach(translateTextNode);

      if (target.nodeType === Node.ELEMENT_NODE) translateElementAttributes(target);
      target.querySelectorAll?.("[placeholder], [title], [aria-label]")
        .forEach(translateElementAttributes);
    } finally {
      translating = false;
    }
  }

  function flushTranslationQueue() {
    translationTask = null;
    const queued = [...translationQueue].filter((node) => node?.isConnected);
    translationQueue.clear();
    const roots = queued.filter(
      (node) => !queued.some((candidate) => candidate !== node && candidate.contains?.(node))
    );
    roots.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      if (node.nodeType === Node.ELEMENT_NODE) translateTree(node);
    });
  }

  function scheduleTranslation(node) {
    if (!node || language !== "en") return;
    translationQueue.add(node);
    if (translationTask !== null) return;
    if ("requestIdleCallback" in window) {
      translationTask = window.requestIdleCallback(flushTranslationQueue, {
        timeout: 120
      });
    } else {
      translationTask = window.requestAnimationFrame(flushTranslationQueue);
    }
  }

  function applyTheme(nextTheme, persist = true) {
    theme = nextTheme === "dark" ? "dark" : "light";
    root.dataset.theme = theme;
    if (persist) localStorage.setItem(STORAGE_THEME, theme);
    const button = document.getElementById("preference-theme");
    if (button) {
      const dark = theme === "dark";
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute(
        "aria-label",
        language === "en"
          ? dark ? "Switch to light mode" : "Switch to dark mode"
          : dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
      );
      button.querySelector("span").textContent =
        language === "en"
          ? dark ? "Light" : "Dark"
          : dark ? "Claro" : "Oscuro";
    }
  }

  function applyLanguage(nextLanguage, persist = true) {
    language = nextLanguage === "en" ? "en" : "es";
    root.lang = language;
    root.dataset.language = language;
    if (persist) localStorage.setItem(STORAGE_LANGUAGE, language);
    translateTree(document.body);
    document.title =
      language === "en"
        ? translateString(document.documentElement.dataset.originalTitle || document.title)
        : document.documentElement.dataset.originalTitle || document.title;

    const button = document.getElementById("preference-language");
    if (button) {
      button.querySelector(".preference-controls__language-label").textContent =
        language === "en" ? "ES" : "EN";
      button.setAttribute(
        "aria-label",
        language === "en" ? "Cambiar a español" : "Switch to English"
      );
    }
    applyTheme(theme, false);
    window.dispatchEvent(
      new CustomEvent("colegiolibre:languagechange", { detail: { language } })
    );
  }

  function createControls() {
    if (document.getElementById("preference-controls")) return;
    const controls = document.createElement("aside");
    controls.id = "preference-controls";
    controls.className = "preference-controls";
    controls.setAttribute(
      "aria-label",
      language === "en" ? "Display preferences" : "Preferencias de visualización"
    );
    controls.setAttribute("data-no-translate", "");
    controls.innerHTML = `
      <button class="preference-controls__button" id="preference-theme" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.4 14.3A8.5 8.5 0 0 1 9.7 3.6 8.5 8.5 0 1 0 20.4 14.3Z"></path>
        </svg>
        <span class="preference-controls__theme-label">Oscuro</span>
      </button>
      <button class="preference-controls__button preference-controls__language" id="preference-language" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"></path>
        </svg>
        <span class="preference-controls__language-label">EN</span>
      </button>
    `;
    document.body.appendChild(controls);
    document.getElementById("preference-theme").addEventListener("click", () => {
      applyTheme(theme === "dark" ? "light" : "dark");
    });
    document.getElementById("preference-language").addEventListener("click", () => {
      const nextLanguage = language === "en" ? "es" : "en";
      localStorage.setItem(STORAGE_LANGUAGE, nextLanguage);
      window.location.reload();
    });
  }

  root.dataset.originalTitle = document.title;
  applyTheme(theme, false);
  root.lang = language;
  root.dataset.language = language;

  document.addEventListener("DOMContentLoaded", () => {
    if (!root.dataset.originalTitle) root.dataset.originalTitle = document.title;
    createControls();
    applyLanguage(language, false);
    observer = new MutationObserver((mutations) => {
      if (translating || language !== "en") return;
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(scheduleTranslation);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });

  systemDark?.addEventListener("change", (event) => {
    if (!localStorage.getItem(STORAGE_THEME)) {
      applyTheme(event.matches ? "dark" : "light", false);
    }
  });

  window.colegioLibrePreferences = {
    get language() {
      return language;
    },
    get theme() {
      return theme;
    },
    setLanguage: applyLanguage,
    setTheme: applyTheme,
    translate: translateString,
    refresh(target = document.body) {
      if (language === "en" && target) translateTree(target);
    }
  };
})();
