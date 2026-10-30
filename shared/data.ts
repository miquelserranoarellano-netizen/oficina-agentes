import type { AgentDef, Project, WorkerRole } from './types.ts';

export const AGENTS: AgentDef[] = [
  {
    id: 'alex',
    name: 'Álex',
    role: 'CEO',
    roleName: 'Director',
    color: '#f2c14e',
    look: {
      skin: '#f1c7a0',
      hair: '#3b2a20',
      hairStyle: 'peinado',
      shirt: '#2c3e66',
      pants: '#1e2742',
      shoes: '#120e18',
      trait: 'corbata',
      accent: '#d63a3a',
    },
  },
  {
    id: 'leo',
    name: 'Leo',
    role: 'DEV',
    roleName: 'Programador',
    color: '#4fd18b',
    look: {
      skin: '#e0ac7e',
      hair: '#1f1d2b',
      hairStyle: 'pincho',
      shirt: '#3aa872',
      pants: '#2d3550',
      shoes: '#e8e8f0',
      trait: 'cascos',
      accent: '#e54b4b',
    },
  },
  {
    id: 'nora',
    name: 'Nora',
    role: 'DIS',
    roleName: 'Diseñadora',
    color: '#ff6fa8',
    look: {
      skin: '#f6d2b4',
      hair: '#a2452f',
      hairStyle: 'melena',
      shirt: '#e0558f',
      pants: '#2b2440',
      shoes: '#2a1b22',
      trait: 'boina',
      accent: '#c8324a',
    },
  },
  {
    id: 'ivan',
    name: 'Iván',
    role: 'GUI',
    roleName: 'Guionista',
    color: '#ff9f43',
    look: {
      skin: '#d9a77c',
      hair: '#5b3a24',
      hairStyle: 'rizos',
      shirt: '#e8822f',
      pants: '#3b3a4f',
      shoes: '#2a1b22',
      trait: 'gafas',
      accent: '#2a2333',
    },
  },
  {
    id: 'sara',
    name: 'Sara',
    role: 'MKT',
    roleName: 'Marketing',
    color: '#a77bff',
    look: {
      skin: '#f3cdb0',
      hair: '#e8c15a',
      hairStyle: 'coleta',
      shirt: '#8c5ee8',
      pants: '#25304d',
      shoes: '#f0f0f5',
      trait: 'coleta',
      accent: '#ff4d6d',
    },
  },
  {
    id: 'hugo',
    name: 'Hugo',
    role: 'INV',
    roleName: 'Investigador',
    color: '#4cc9f0',
    look: {
      skin: '#e2b48c',
      hair: '#8a8f9c',
      hairStyle: 'canoso',
      shirt: '#e8edf2',
      pants: '#34405e',
      shoes: '#2a1b22',
      trait: 'bata',
      accent: '#3ab0d6',
    },
  },
];

export const ROLE_LABEL: Record<string, string> = {
  CEO: 'CEO',
  DEV: 'DEV',
  DIS: 'DIS',
  GUI: 'GUI',
  MKT: 'MKT',
  INV: 'INV',
};

// Progreso de ejemplo según lo que se ve en las carpetas el 29 de octubre de 2026.
export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'reels',
    name: 'Reels',
    description:
      'Fábrica de reels verticales de curiosidades, ciencia y psicología con Remotion, voz de ElevenLabs y estilos propios. Muy activo: 16 guiones y unos 13 vídeos renderizados; el último, el viaje por París en mapa 3D.',
    color: '#ff5d73',
    progress: 70,
    status: 'curso',
    createdAt: '2026-10-25',
  },
  {
    id: 'smart-fitness-coach',
    name: 'Smart Fitness Coach',
    description:
      'Web de entrenador personal de hipertrofia (Next.js + PGlite): rutina, modo entrenamiento, peso, nutrición y revisiones. Fases 0-3 hechas (64 pruebas); la IA está escrita pero sin probar y falta el despliegue.',
    color: '#38d39f',
    progress: 65,
    status: 'curso',
    createdAt: '2026-10-09',
  },
  {
    id: 'smart-fitness-coach-app',
    name: 'Smart Fitness Coach App',
    description:
      'Versión móvil con Expo (SDK 57). Se está fusionando con SnapCal de Marc en Appcombinada: fases 1-5 de 10 hechas. Pendiente probarla en un móvil real.',
    color: '#4d9de0',
    progress: 50,
    status: 'curso',
    createdAt: '2026-10-15',
  },
  {
    id: 'ia-financiera',
    name: 'Proyecto IA Financiera',
    description: 'Carpeta vacía creada el 6 de octubre. Solo la idea: sin empezar.',
    color: '#f7b32b',
    progress: 0,
    status: 'cola',
    createdAt: '2026-10-06',
  },
  {
    id: 'boda',
    name: 'Proyecto Boda',
    description: 'Carpeta vacía creada el 6 de octubre. Sin empezar.',
    color: '#f78fb3',
    progress: 0,
    status: 'cola',
    createdAt: '2026-10-06',
  },
  {
    id: 'pagina-ia-miquel',
    name: 'PaginaIAMiquel',
    description: 'Carpeta vacía creada hoy. Por el nombre, una web personal sobre IA. Sin empezar.',
    color: '#b98cff',
    progress: 0,
    status: 'cola',
    createdAt: '2026-10-29',
  },
];

/** Colores que se ofrecen al crear o editar un proyecto. */
export const PROJECT_COLORS = [
  '#ff5d73',
  '#38d39f',
  '#4d9de0',
  '#f7b32b',
  '#f78fb3',
  '#b98cff',
  '#4fd1c5',
  '#ff8c42',
  '#a3e048',
  '#e0e0e0',
];

const GENERIC_TASKS: Record<WorkerRole, string[]> = {
  DEV: [
    'Revisar el código de {p}',
    'Arreglar errores de {p}',
    'Escribir pruebas para {p}',
    'Montar un prototipo de {p}',
    'Preparar el despliegue de {p}',
  ],
  DIS: [
    'Bocetar las pantallas de {p}',
    'Crear la paleta de colores de {p}',
    'Diseñar el logo de {p}',
    'Pulir los iconos de {p}',
  ],
  GUI: [
    'Redactar los textos de {p}',
    'Escribir el pitch de {p}',
    'Definir el tono de {p}',
    'Ordenar las ideas de {p}',
  ],
  MKT: [
    'Plan de lanzamiento de {p}',
    'Analizar el público de {p}',
    'Calendario de publicaciones de {p}',
    'Copys para redes de {p}',
  ],
  INV: [
    'Investigar la competencia de {p}',
    'Buscar referencias para {p}',
    'Comparar herramientas para {p}',
    'Resumir tendencias para {p}',
  ],
};

const PROJECT_TASKS: Record<string, Partial<Record<WorkerRole, string[]>>> = {
  reels: {
    DEV: ['Acelerar el render de Remotion', 'Automatizar el lote diario de reels'],
    DIS: ['Portada del próximo reel', 'Nueva paleta para el estilo oscuro'],
    GUI: ['Guion del próximo reel de curiosidades', 'Gancho de 3 segundos para el reel'],
    MKT: ['Descripción y hashtags del reel', 'Mejor hora para publicar'],
    INV: ['Buscar 3 curiosidades con fuentes', 'Ver qué reels funcionan mejor'],
  },
  'smart-fitness-coach': {
    DEV: ['Probar la IA con la API real', 'Recuperar contraseña por correo'],
    DIS: ['Repaso visual en el móvil', 'Pantalla de análisis más clara'],
    GUI: ['Textos del informe semanal', 'Mensajes del modo entrenamiento'],
    MKT: ['Página de presentación de la app'],
    INV: ['Comparar Neon y Supabase', 'Revisar estudios de volumen'],
  },
  'smart-fitness-coach-app': {
    DEV: ['Fase 6: Inicio y Nutrición reales', 'Probar la app en el móvil'],
    DIS: ['Pulir el tema claro', 'Pantalla de registrar comida'],
    GUI: ['Textos del cuestionario corto'],
    MKT: ['Nombre final para Appcombinada'],
    INV: ['Comparar bases de alimentos'],
  },
  'ia-financiera': {
    DEV: ['Prototipo que lee mis gastos'],
    GUI: ['Definir qué hará la IA financiera'],
    INV: ['Estudiar APIs de datos financieros', 'Ver apps parecidas'],
    MKT: ['¿Para quién es esta app?'],
    DIS: ['Boceto del panel de gastos'],
  },
  boda: {
    INV: ['Buscar fincas y presupuestos', 'Comparar fotógrafos'],
    GUI: ['Texto de la invitación', 'Guion del discurso'],
    DIS: ['Diseñar la invitación', 'Web de la boda: boceto'],
    MKT: ['Lista de invitados y avisos'],
    DEV: ['Web de la boda con confirmación'],
  },
  'pagina-ia-miquel': {
    DIS: ['Bocetar la portada de la web'],
    GUI: ['Escribir el «sobre mí»', 'Textos de cada proyecto'],
    DEV: ['Montar la web con Vite', 'Publicar la web'],
    MKT: ['Plan para dar a conocer la web'],
    INV: ['Webs de referencia de IA'],
  },
};

export function taskTitleFor(projectId: string, projectName: string, role: WorkerRole): string {
  const specific = PROJECT_TASKS[projectId]?.[role] ?? [];
  const generic = GENERIC_TASKS[role].map((t) => t.replace('{p}', projectName));
  const pool = specific.length > 0 && Math.random() < 0.7 ? specific : generic;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const PHRASES = {
  acknowledge: ['¡Voy!', '¡Entendido!', '¡A ello!', '¡Hecho, jefe!', '¡Me pongo!'],
  done: ['¡Listo!', '¡Terminado!', '¡Hecho!', '¡Fuera!'],
  ceoThink: ['Mmm…', '¿Qué toca ahora?', 'Prioridades…', '…'],
  ceoCall: ['¡{n}!', '{n}, tengo algo', 'Oye, {n}'],
  coffee: ['¡Qué buen café!', 'Un cafecito…', '¡Ahh!', 'Recargando pilas'],
  chat: [
    '¿Has visto el último reel?',
    'Hoy rindo un montón',
    '¿Pedimos pizza?',
    'Necesito vacaciones',
    'Ese bug era mío…',
    'Me encanta esta ofi',
    '¿Quién ha hecho café?',
    'Qué noche más bonita',
  ],
  allDone: '¡Todo terminado! Buen trabajo, equipo',
};
