import type { Incident } from '../types';

const emptyStringArray: string[] = [];
const emptyNotesArray: Incident['notes'] = [];

const normalizeStringArray = (value?: string[] | null): string[] =>
  Array.isArray(value) ? value : emptyStringArray;

const normalizeNotes = (value?: Incident['notes'] | null): Incident['notes'] =>
  Array.isArray(value) ? value : emptyNotesArray;

export const normalizeIncident = (incident: Incident): Incident => ({
  ...incident,
  affectedIPs: normalizeStringArray(incident.affectedIPs),
  affectedUsers: normalizeStringArray(incident.affectedUsers),
  tags: normalizeStringArray(incident.tags),
  notes: normalizeNotes(incident.notes),
});

export const normalizeIncidents = (incidents: Incident[]): Incident[] =>
  incidents.map((incident) => normalizeIncident(incident));
