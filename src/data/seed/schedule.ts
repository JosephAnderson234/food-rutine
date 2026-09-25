import type { FixedCourse, Settings } from "@app/domain/types";

/**
 * Cursos fijos tal como están en el calendario "Utec Courses" (2026-2).
 * Sirve para usar la app offline; cuando se conecte Google Calendar, estos datos vendrán de ahí.
 */
export const FIXED_COURSES: FixedCourse[] = [
  {
    id: "ml-lun",
    title: "Machine Learning",
    weekday: 1,
    start: "07:00",
    end: "09:00",
    modality: "virtual",
  },
  {
    id: "cpd-lun",
    title: "Computación Paralela y Distribuida",
    weekday: 1,
    start: "09:00",
    end: "11:00",
    modality: "presencial",
    location: "L210",
  },
  {
    id: "so-lun",
    title: "Sistemas Operativos",
    weekday: 1,
    start: "11:00",
    end: "13:00",
    modality: "presencial",
    location: "A901",
  },
  {
    id: "eco-lun",
    title: "Economía, Gobernanza y Relaciones de Poder",
    weekday: 1,
    start: "14:00",
    end: "16:00",
    modality: "presencial",
    location: "A708",
  },

  {
    id: "eco-mar",
    title: "Economía, Gobernanza y Relaciones de Poder",
    weekday: 2,
    start: "08:00",
    end: "09:00",
    modality: "presencial",
    location: "A708",
  },
  {
    id: "cpd-mar",
    title: "Computación Paralela y Distribuida (Lab)",
    weekday: 2,
    start: "11:00",
    end: "13:00",
    modality: "presencial",
    location: "M602",
  },
  {
    id: "eda-mar",
    title: "Estructura de Datos Avanzados",
    weekday: 2,
    start: "15:00",
    end: "17:00",
    modality: "presencial",
    location: "A903",
  },
  {
    id: "so-mar",
    title: "Sistemas Operativos (Lab)",
    weekday: 2,
    start: "17:00",
    end: "19:00",
    modality: "presencial",
    location: "M804",
  },

  {
    id: "cpd-mie",
    title: "Computación Paralela y Distribuida (Lab)",
    weekday: 3,
    start: "11:00",
    end: "13:00",
    modality: "presencial",
    location: "M602",
  },
  {
    id: "so-mie",
    title: "Sistemas Operativos (Lab)",
    weekday: 3,
    start: "13:00",
    end: "15:00",
    modality: "presencial",
    location: "M803",
  },
  {
    id: "eda-mie",
    title: "Estructura de Datos Avanzados",
    weekday: 3,
    start: "15:00",
    end: "17:00",
    modality: "presencial",
    location: "M802",
  },
  {
    id: "ml-mie",
    title: "Machine Learning",
    weekday: 3,
    start: "17:00",
    end: "19:00",
    modality: "virtual",
  },

  {
    id: "ml-jue",
    title: "Machine Learning",
    weekday: 4,
    start: "07:00",
    end: "09:00",
    modality: "virtual",
  },

  {
    id: "eda-vie",
    title: "Estructura de Datos Avanzados",
    weekday: 5,
    start: "13:00",
    end: "15:00",
    modality: "presencial",
    location: "M804",
  },
];

export const DEFAULT_SETTINGS: Settings = {
  id: "default",
  timeZone: "America/Lima",
  portion: { factor: { normal: 1, grande: 1.3 }, gymDay: "grande" },
  gym: {
    durationMin: 120,
    preferences: [
      { weekday: 1, from: "17:00", to: "19:00" },
      { weekday: 4, from: "15:00", to: "17:00" },
      { weekday: 6, from: "10:00", to: "12:00" },
    ],
  },
  safety: { fridgeMaxDays: 3, freezeAfterDays: 2, thawAt: "21:00" },
  lunchWindow: { from: "12:00", to: "14:30" },
  containers: { large: 6, small: 4 },
  rotation: ["A"],
  shoppingTrips: 2,
  coldPacks: 0,
};
